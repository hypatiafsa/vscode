
import { commands, languages, workspace, window, StatusBarAlignment, Uri, Diagnostic, DiagnosticSeverity, Position, Range } from "vscode";
import { spawn } from "node:child_process";

import Utils from "./utils.js";

const CFG_ROOT = "hypatia.hls";

function hlsCfg() {
  return Utils.cfg.get(CFG_ROOT);
}

function getCfgValue(key, fallback) {
  return hlsCfg().get(key, fallback);
}

function normaliseTrace(v) {
  return Utils.util.normaliseEnum(String(v ?? "off"), ["off", "messages", "verbose"], "off");
}

function buildCommandLine() {
  const enabled = !!getCfgValue("enabled", true);
  const path = String(getCfgValue("path", "") ?? "").trim();
  const argsRaw = getCfgValue("args", []);
  const args = Array.isArray(argsRaw) ? argsRaw.map(String) : [];
  const cmd = path.length > 0 ? path : (Utils.sys.isWindows() ? "hypatia.exe" : "hypatia");
  const hasHls = args.length > 0 && args[0] === "hls";
  const finalArgs = hasHls ? args.slice() : ["hls", ...args];
  return { enabled, cmd, args: finalArgs };
}

function pickWorkspaceRootUri() {
  const wf = workspace.workspaceFolders;
  if (wf && wf.length > 0) return wf[0].uri;
  return undefined;
}

function toVscodeSeverity(lspSeverity) {
  switch (lspSeverity) {
    case 1:
      return DiagnosticSeverity.Error;
    case 2:
      return DiagnosticSeverity.Warning;
    case 3:
      return DiagnosticSeverity.Information;
    case 4:
      return DiagnosticSeverity.Hint;
    default:
      return DiagnosticSeverity.Information;
  }
}

function toRange(lspRange) {
  const s = lspRange?.start ?? { line: 0, character: 0 };
  const e = lspRange?.end ?? s;
  return new Range(
    new Position(s.line ?? 0, s.character ?? 0),
    new Position(e.line ?? 0, e.character ?? 0)
  );
}

export class HlsController {

  constructor(context) {
    this._context = context;
    this._clientVersion = String(context?.extension?.packageJSON?.version ?? "");
    this._status = window.createStatusBarItem(StatusBarAlignment.Right, 100);
    this._status.command = "hypatia.hls.server";
    this._status.tooltip = "Hypatia HLS";
    this._status.show();
    this._output = Utils.out.output(context, "Hypatia HLS");
    this._diagnostics = languages.createDiagnosticCollection("hypatia");
    this._proc = undefined;
    this._buffer = Buffer.alloc(0);
    this._nextId = 1;
    this._pending = new Map();
    this._stopTimer = undefined;
    this._openDocs = new Set();
    this._queue = Utils.util.createSerialQueue((e) => {
      this._appendInfo(`[client] error: ${ String(e?.message ?? e) }`);
      Utils.out.logError(e, "hypatia.hls");
    });
    this._lastCmdlineKey = "";
    this._setState("idle");
  }

  activate() {
    this._context.subscriptions.push(
      commands.registerCommand("hypatia.hls.server", async (subcommand) => {
        return this._queue.enqueue(() => this._handleServerCommand(subcommand));
      })
    );
    this._context.subscriptions.push(
      commands.registerCommand("hypatia.hls.restart", async () => {
        return this._queue.enqueue(() => this.restart());
      })
    );
    this._context.subscriptions.push(
      commands.registerCommand("hypatia.hls.validate", async () => {
        return this._queue.enqueue(() => this.validateActiveEditor());
      })
    );
    this._context.subscriptions.push(
      window.onDidChangeVisibleTextEditors(() => {
        this._queue.enqueue(() => this._reconcile());
      })
    );
    this._context.subscriptions.push(
      workspace.onDidChangeConfiguration((e) => {
        const touchesHls = e.affectsConfiguration(`${ CFG_ROOT }.enabled`) ||
          e.affectsConfiguration(`${ CFG_ROOT }.path`) ||
          e.affectsConfiguration(`${ CFG_ROOT }.args`) ||
          e.affectsConfiguration(`${ CFG_ROOT }.trace`) ||
          e.affectsConfiguration(`${ CFG_ROOT }.shutdowndelay`);
        if (!touchesHls) return;
        this._queue.enqueue(() => this._reconcile(true, e));
      })
    );
    this._context.subscriptions.push(
      workspace.onDidOpenTextDocument((doc) => {
        if (doc.languageId !== "hypatia") return;
        this._queue.enqueue(() => this._maybeDidOpen(doc));
      })
    );
    this._context.subscriptions.push(
      workspace.onDidChangeTextDocument((e) => {
        if (e.document.languageId !== "hypatia") return;
        this._queue.enqueue(() => this._maybeDidChange(e.document));
      })
    );
    this._context.subscriptions.push(
      workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId !== "hypatia") return;
        this._queue.enqueue(() => this._maybeDidSave(doc));
      })
    );
    this._context.subscriptions.push(
      workspace.onDidCloseTextDocument((doc) => {
        if (doc.languageId !== "hypatia") return;
        this._queue.enqueue(() => this._maybeDidClose(doc));
      })
    );
    this._queue.enqueue(() => this._reconcile());
  }

  dispose() {
    this._cancelStopTimer();
    this._stopNow(true);
    this._diagnostics.dispose();
    this._status.dispose();
  }

  async restart() {
    const { enabled } = buildCommandLine();
    if (!enabled) {
      window.showWarningMessage("Hypatia HLS is disabled (hypatia.hls.enabled = false).");
      this._setState("off");
      await this._stopGracefully(false);
      return;
    }
    this._appendInfo("[client] restart requested");
    const shouldRun = Utils.editor.anyHypatiaEditors();
    await this._stopGracefully(false);
    if (shouldRun) {
      await this._start(true);
    } else {
      this._setState("idle");
    }
  }

  async validateActiveEditor() {
    const ed = window.activeTextEditor;
    if (!Utils.editor.isHypatiaEditor(ed)) {
      window.showInformationMessage("Open a Hypatia file to validate.");
      return;
    }
    const { enabled } = buildCommandLine();
    if (!enabled) {
      window.showWarningMessage("Hypatia HLS is disabled (hypatia.hls.enabled = false).");
      return;
    }
    await this._ensureRunning();
    if (!this._proc) {
      window.showErrorMessage("Could not start Hypatia HLS.");
      return;
    }
    const doc = ed.document;
    await this._maybeDidOpen(doc);
    await this._maybeDidChange(doc);
    const uri = doc.uri.toString();
    this._sendNotification("hypatia/validate", { textDocument: { uri } });
    this._sendRequest("workspace/executeCommand", { command: "hypatia.validate", arguments: [uri] })
      .catch(() => { });
    window.showInformationMessage("Hypatia: validation requested.");
  }

  async _handleServerCommand(subcommand) {
    const { enabled } = buildCommandLine();
    if (!enabled) {
      const choice = await window.showInformationMessage(
        "Hypatia HLS is currently disabled.",
        "Open Settings",
      );
      if (choice === "Open Settings") {
        commands.executeCommand("workbench.action.openSettings", `${ CFG_ROOT }.enabled`);
      }
      return;
    }
    const action = typeof subcommand === "string" ? subcommand : undefined;
    let picked = action;
    if (!picked) {
      picked = await window.showQuickPick(
        [
          { label: "Start", value: "start" },
          { label: "Stop", value: "stop" },
          { label: "Restart", value: "restart" },
          { label: "Show Output", value: "output" },
        ],
        { title: "Hypatia HLS" }
      ).then((x) => x?.value);
    }
    if (!picked) return;
    if (picked === "output") {
      this._output.show(true);
      return;
    }
    if (picked === "restart") {
      await this.restart();
      return;
    }
    if (picked === "stop") {
      await this._stopGracefully(true);
      this._setState("idle");
      return;
    }
    if (picked === "start") {
      await this._start(true);
      return;
    }
  }

  _traceMode() {
    return normaliseTrace(getCfgValue("trace", "off"));
  }

  _appendTrace(line) {
    const mode = this._traceMode();
    if (mode === "off") return;
    this._output.appendLine(line);
  }

  _appendInfo(line) {
    this._output.appendLine(line);
  }

  _setState(state) {
    if (state === "off") {
      this._status.text = "$(circle-slash) HLS Off";
      this._status.tooltip = "Hypatia HLS is disabled";
      return;
    }
    if (state === "on") {
      this._status.text = "$(zap) HLS On";
      this._status.tooltip = "Hypatia HLS is running";
      return;
    }
    this._status.text = "$(clock) HLS Idle";
    this._status.tooltip = "Hypatia HLS is enabled, waiting for a Hypatia editor";
  }

  _cmdlineKey() {
    const { enabled, cmd, args } = buildCommandLine();
    return enabled ? `${ cmd }\0${ args.join("\0") }` : "";
  }

  _cancelStopTimer() {
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = undefined;
    }
  }

  _scheduleStop() {
    this._cancelStopTimer();
    const delay = Utils.util.asFiniteNumber(getCfgValue("shutdowndelay", 5000), 5000);
    const ms = delay >= 0 ? delay : 5000;
    this._stopTimer = setTimeout(() => {
      this._stopTimer = undefined;
      if (Utils.editor.anyHypatiaEditors()) return;
      this._queue.enqueue(() => this._stopGracefully(true));
    }, ms);
  }

  async _reconcile(maybeRestart = false, cfgEvent) {
    const { enabled } = buildCommandLine();
    if (!enabled) {
      this._cancelStopTimer();
      const wasRunning = !!this._proc;
      this._setState("off");
      await this._stopGracefully(wasRunning);
      return;
    }
    if (!Utils.editor.anyHypatiaEditors()) {
      this._setState("idle");
      if (this._proc) this._scheduleStop();
      return;
    }
    this._cancelStopTimer();
    if (!this._proc) {
      await this._start(false);
      return;
    }
    if (maybeRestart) {
      const needsRestart =
        cfgEvent?.affectsConfiguration(`${ CFG_ROOT }.path`) ||
        cfgEvent?.affectsConfiguration(`${ CFG_ROOT }.args`);

      if (needsRestart) {
        const key = this._cmdlineKey();
        if (key && key !== this._lastCmdlineKey) {
          this._appendInfo("[client] command line changed; restarting HLS");
          await this.restart();
          return;
        }
      }
    }
    this._setState("on");
  }

  async _ensureRunning() {
    if (this._proc) return;
    await this._start(false);
  }

  async _start(userInitiated = false) {
    if (this._proc) {
      this._setState("on");
      return;
    }
    const { enabled, cmd, args } = buildCommandLine();
    if (!enabled) {
      this._setState("off");
      return;
    }
    if (!userInitiated && !Utils.editor.anyHypatiaEditors()) {
      this._setState("idle");
      return;
    }
    const cmdlineKey = this._cmdlineKey();
    const rootUri = pickWorkspaceRootUri();
    const cwd = rootUri ? rootUri.fsPath : undefined;
    this._appendInfo(`[client] starting: ${ cmd } ${ args.join(" ") }`);
    try {
      const proc = spawn(cmd, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });
      this._proc = proc;
      this._lastCmdlineKey = cmdlineKey;
      this._buffer = Buffer.alloc(0);
      this._openDocs.clear();
      proc.on("error", (err) => {
        this._appendInfo(`[client] process error: ${ String(err?.message ?? err) }`);
        window.showErrorMessage(`Hypatia HLS error: ${ String(err?.message ?? err) }`);
        this._setState(Utils.editor.anyHypatiaEditors() ? "idle" : "idle");
        this._stopNow(true);
      });
      proc.on("exit", (code, signal) => {
        this._appendInfo(`[client] exited (code=${ code ?? "?" }, signal=${ signal ?? "?" })`);
        this._proc = undefined;
        this._buffer = Buffer.alloc(0);
        this._pending.forEach((p) => p.reject(new Error("HLS exited")));
        this._pending.clear();
        this._openDocs.clear();
        this._diagnostics.clear();
        this._setState("idle");
      });
      proc.stderr.on("data", (chunk) => {
        const s = chunk.toString("utf8");
        this._appendTrace(s.trimEnd());
      });
      proc.stdout.on("data", (chunk) => {
        this._onStdout(chunk);
      });
      await this._initialiseLsp();
      for (const ed of window.visibleTextEditors) {
        if (!Utils.editor.isHypatiaEditor(ed)) continue;
        await this._maybeDidOpen(ed.document);
      }
      this._setState("on");
      window.showInformationMessage("Hypatia HLS started.");
    } catch (err) {
      this._appendInfo(`[client] failed to start: ${ String(err?.message ?? err) }`);
      window.showErrorMessage(`Could not start Hypatia HLS: ${ String(err?.message ?? err) }`);
      this._proc = undefined;
      this._setState("idle");
    }
  }

  async _stopGracefully(showNotice = false) {
    this._cancelStopTimer();
    if (!this._proc) return;
    this._appendInfo("[client] stopping...");
    try {
      await this._sendRequest("shutdown", null).catch(() => { });
      this._sendNotification("exit", null);
    } finally {
      const p = this._proc;
      setTimeout(() => {
        try {
          if (p && !p.killed) p.kill();
        } catch (_) { }
      }, 1500);
      this._stopNow(true);
      this._diagnostics.clear();
      this._openDocs.clear();
      if (showNotice) {
        window.showInformationMessage("Hypatia HLS stopped.");
      }
    }
  }

  _stopNow(clearPending = false) {
    if (!this._proc) return;
    try {
      if (!this._proc.killed) this._proc.kill();
    } catch (_) { }
    this._proc = undefined;
    this._buffer = Buffer.alloc(0);
    if (clearPending) {
      this._pending.forEach((p) => p.reject(new Error("HLS stopped")));
      this._pending.clear();
    }
  }

  async _initialiseLsp() {
    if (!this._proc) return;
    const rootUri = pickWorkspaceRootUri();
    const processId = process.pid;
    const params = {
      processId,
      rootUri: rootUri ? rootUri.toString() : null,
      capabilities: {
        textDocument: {
          synchronization: {
            didSave: true,
            dynamicRegistration: false,
          },
        },
        workspace: {
          configuration: true,
          workspaceFolders: true,
        },
      },
      workspaceFolders: (workspace.workspaceFolders ?? []).map((f) => ({ uri: f.uri.toString(), name: f.name })),
      clientInfo: { name: "Hypatia-VSCode", version: this._clientVersion },
    };
    const result = await this._sendRequest("initialize", params).catch((err) => {
      this._appendInfo(`[client] initialize failed: ${ String(err?.message ?? err) }`);
      throw err;
    });
    this._appendTrace(`[client] initialize result: ${ JSON.stringify(result) }`);
    this._sendNotification("initialized", {});
  }

  _onStdout(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    while (true) {
      const headerEnd = this._buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this._buffer.subarray(0, headerEnd).toString("ascii");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this._appendTrace(this._buffer.toString("utf8").trimEnd());
        this._buffer = Buffer.alloc(0);
        return;
      }
      const len = Number(match[1]);
      const start = headerEnd + 4;
      const end = start + len;
      if (this._buffer.length < end) return;
      const body = this._buffer.subarray(start, end).toString("utf8");
      this._buffer = this._buffer.subarray(end);
      let msg;
      try {
        msg = JSON.parse(body);
      } catch (_) {
        this._appendTrace(`[server] invalid JSON: ${ body }`);
        continue;
      }
      this._handleMessage(msg);
    }
  }

  _handleMessage(msg) {
    const mode = this._traceMode();
    if (mode === "verbose") {
      this._appendTrace(`[server→client] ${ JSON.stringify(msg) }`);
    } else if (mode === "messages") {
      const what = msg.method ? msg.method : (msg.id !== undefined ? "<response>" : "<message>");
      this._appendTrace(`[server→client] ${ what }`);
    }
    if (msg && msg.id !== undefined && !msg.method) {
      const pending = this._pending.get(msg.id);
      if (!pending) return;
      this._pending.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message || "LSP error"));
      else pending.resolve(msg.result);
      return;
    }
    if (!msg || typeof msg.method !== "string") return;
    if (msg.method === "textDocument/publishDiagnostics") {
      const uri = msg.params?.uri;
      const diags = Array.isArray(msg.params?.diagnostics) ? msg.params.diagnostics : [];
      if (!uri || typeof uri !== "string") return;
      const vscodeDiags = diags.map((d) => {
        const vd = new Diagnostic(toRange(d.range), String(d.message ?? ""), toVscodeSeverity(d.severity));
        if (d.source) vd.source = String(d.source);
        if (d.code !== undefined) vd.code = d.code;
        return vd;
      });
      this._diagnostics.set(Uri.parse(uri), vscodeDiags);
      return;
    }
    if (msg.method === "window/logMessage") {
      const t = msg.params?.message;
      if (typeof t === "string") this._appendTrace(`[server] ${ t }`);
      return;
    }
    if (msg.method === "window/showMessage") {
      const t = msg.params?.message;
      if (typeof t === "string") this._appendInfo(`[server] ${ t }`);
      return;
    }
    if (msg.id !== undefined) {
      this._handleServerRequest(msg).catch((err) => {
        this._sendResponse(msg.id, undefined, { code: -32603, message: String(err?.message ?? err) });
      });
    }
  }

  async _handleServerRequest(msg) {
    const { id, method, params } = msg;
    if (method === "workspace/configuration") {
      const items = Array.isArray(params?.items) ? params.items : [];
      const out = items.map((it) => {
        const section = typeof it?.section === "string" ? it.section : "";
        if (!section) return null;
        if (section === "hypatia.hls") {
          return {
            enabled: getCfgValue("enabled", true),
            path: getCfgValue("path", ""),
            args: getCfgValue("args", []),
            trace: getCfgValue("trace", "off"),
            shutdowndelay: getCfgValue("shutdowndelay", 5000),
          };
        }
        if (section === "hypatia.style") {
          const scfg = Utils.cfg.get("hypatia.style");
          return {
            autotheme: scfg.get("autotheme", false),
            autotokens: scfg.get("autotokens", "auto"),
            semantichighlighting: scfg.get("semantichighlighting", "inherit"),
            trace: Utils.cfg.get().get("hypatia.style.trace", false),
          };
        }
        return Utils.cfg.get().get(section);
      });
      this._sendResponse(id, out);
      return;
    }
    if (method === "workspace/workspaceFolders") {
      const folders = (workspace.workspaceFolders ?? []).map((f) => ({ uri: f.uri.toString(), name: f.name }));
      this._sendResponse(id, folders);
      return;
    }
    this._sendResponse(id, null);
  }

  _sendMessage(obj) {
    if (!this._proc || !this._proc.stdin || this._proc.killed) {
      throw new Error("HLS not running");
    }
    const json = JSON.stringify(obj);
    const bytes = Buffer.byteLength(json, "utf8");
    const payload = `Content-Length: ${ bytes }\r\n\r\n${ json }`;
    const mode = this._traceMode();
    if (mode === "verbose") {
      this._appendTrace(`[client→server] ${ json }`);
    } else if (mode === "messages") {
      const what = obj.method ? obj.method : (obj.id !== undefined ? "<response>" : "<message>");
      this._appendTrace(`[client→server] ${ what }`);
    }
    this._proc.stdin.write(payload, "utf8");
  }

  _sendResponse(id, result, error) {
    const msg = { jsonrpc: "2.0", id };
    if (error) msg.error = error;
    else msg.result = result;
    try {
      this._sendMessage(msg);
    } catch (_) { }
  }

  _sendNotification(method, params) {
    try {
      this._sendMessage({ jsonrpc: "2.0", method, params });
    } catch (_) { }
  }

  _sendRequest(method, params) {
    const id = this._nextId++;
    const msg = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject, method });
      try {
        this._sendMessage(msg);
      } catch (err) {
        this._pending.delete(id);
        reject(err);
        return;
      }
      setTimeout(() => {
        const pending = this._pending.get(id);
        if (!pending) return;
        this._pending.delete(id);
        reject(new Error(`LSP request timed out: ${ method }`));
      }, 15000);
    });
  }

  async _maybeDidOpen(doc) {
    if (!this._proc) return;
    const uri = doc.uri.toString();
    if (this._openDocs.has(uri)) return;
    this._openDocs.add(uri);
    this._sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "hypatia",
        version: doc.version,
        text: doc.getText(),
      },
    });
  }

  async _maybeDidChange(doc) {
    if (!this._proc) return;
    const uri = doc.uri.toString();
    if (!this._openDocs.has(uri)) return;
    this._sendNotification("textDocument/didChange", {
      textDocument: { uri, version: doc.version },
      contentChanges: [{ text: doc.getText() }],
    });
  }

  async _maybeDidSave(doc) {
    if (!this._proc) return;
    const uri = doc.uri.toString();
    if (!this._openDocs.has(uri)) return;
    this._sendNotification("textDocument/didSave", {
      textDocument: { uri },
    });
  }

  async _maybeDidClose(doc) {
    if (!this._proc) return;
    const uri = doc.uri.toString();
    if (!this._openDocs.has(uri)) return;
    this._openDocs.delete(uri);
    this._sendNotification("textDocument/didClose", {
      textDocument: { uri },
    });
  }
}

export function createHlsController(context) {
  return new HlsController(context);
}
