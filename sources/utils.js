
import { workspace, window, ConfigurationTarget } from "vscode";

// -- Language helpers ---------------------------------------------------------

const LANG_ID = "hypatia";

// -- Configuration helpers ----------------------------------------------------

function cfg(section, scope) {
  return workspace.getConfiguration(section, scope);
}

function inspectKey(section, key, scope) {
  return cfg(section, scope)?.inspect?.(key);
}

function pickTargetForKey(section, key, scope) {
  const inspected = inspectKey(section, key, scope);
  if (inspected?.workspaceFolderValue !== undefined) return ConfigurationTarget.WorkspaceFolder;
  if (inspected?.workspaceValue !== undefined) return ConfigurationTarget.Workspace;
  return ConfigurationTarget.Global;
}

function serialiseTarget(target) {
  switch (target) {
    case ConfigurationTarget.WorkspaceFolder:
      return "WorkspaceFolder";
    case ConfigurationTarget.Workspace:
      return "Workspace";
    default:
      return "Global";
  }
}

function parseTarget(value) {
  if (value === "WorkspaceFolder") return ConfigurationTarget.WorkspaceFolder;
  if (value === "Workspace") return ConfigurationTarget.Workspace;
  if (value === "Global") return ConfigurationTarget.Global;
  return undefined;
}

async function updateSetting(section, key, value, opts = {}) {
  const { scope, switchingRef } = opts;
  let { target } = opts;
  const cfgObj = cfg(section, scope);
  if (target === undefined) {
    target = pickTargetForKey(section, key, scope);
  }
  if (target === ConfigurationTarget.WorkspaceFolder && scope === undefined) {
    target = ConfigurationTarget.Workspace;
  }
  if (switchingRef) switchingRef.value = true;
  try {
    await cfgObj.update(key, value, target);
  } finally {
    if (switchingRef) switchingRef.value = false;
  }
}

// -- JSON helpers -------------------------------------------------------------

function clone(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch (_) { }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    if (Array.isArray(value)) return value.slice();
    if (value && typeof value === "object") return { ...value };
    return value;
  }
}

function stableEquals(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// -- Output helpers -----------------------------------------------------------

const _outputChannels = new Map();
const _subscribedOutputs = new WeakSet();

function output(context, name) {
  let ch = _outputChannels.get(name);
  if (!ch) {
    ch = window.createOutputChannel(name);
    _outputChannels.set(name, ch);
  }
  if (context?.subscriptions && !_subscribedOutputs.has(ch)) {
    context.subscriptions.push(ch);
    _subscribedOutputs.add(ch);
  }
  return ch;
}

function disposeOutputs() {
  for (const ch of _outputChannels.values()) {
    try { ch.dispose(); } catch (_) { /* ignore */ }
  }
  _outputChannels.clear();
}

function makeTracer(context, channelName, flagKeyOrFn, prefix = "") {
  const ch = output(context, channelName);
  const raw = () => {
    if (typeof flagKeyOrFn === "function") return flagKeyOrFn();
    return cfg().get(flagKeyOrFn, false);
  };
  const enabledValue = (v) => {
    if (v === false || v === undefined || v === null) return false;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "" || s === "off" || s === "none" || s === "false" || s === "0" || s === "disabled")
        return false;
      return true;
    }
    return !!v;
  };
  const levelValue = (v) => {
    if (v === false || v === undefined || v === null) return 0;
    if (v === true) return 1;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "verbose" || s === "debug" || s === "all") return 2;
      if (s === "messages" || s === "message" || s === "info" || s === "on" || s === "true") return 1;
      if (s === "off" || s === "none" || s === "false") return 0;
      return 1;
    }
    return 1;
  };
  const fmt = (line) => (prefix ? `[${ prefix }] ${ line }` : line);
  return {
    enabled: () => enabledValue(raw()),
    level: () => levelValue(raw()),
    verbose: () => levelValue(raw()) >= 2,
    show(preserveFocus = true) {
      if (enabledValue(raw())) ch.show(preserveFocus);
    },
    line(line) {
      if (!enabledValue(raw())) return;
      ch.appendLine(fmt(String(line)));
    },
  };
}

function logError(err, prefix = "hypatia") {
  const msg =
    err instanceof Error ? `${ err.message }${ err.stack ? `\n${ err.stack }` : "" }` : String(err);
  console.error(`[${ prefix }] ${ msg }`);
}

// -- Document helpers ---------------------------------------------------------

function isHypatiaDoc(doc) {
  return !!(doc && doc.languageId === LANG_ID);
}

// -- Editor helpers -----------------------------------------------------------

function isHypatiaEditor(ed) {
  return !!(ed && ed.document && isHypatiaDoc(ed.document));
}

function anyHypatiaEditors() {
  return window.visibleTextEditors.some((ed) => isHypatiaEditor(ed));
}

// -- System helpers -----------------------------------------------------------

function isWindows() {
  return process.platform === "win32";
}

// -- Generic helpers ----------------------------------------------------------

function normaliseEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function asFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function debounce(ms, fn) {
  let t;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function createSerialQueue(onError = (e) => logError(e, "hypatia.queue")) {
  let chain = Promise.resolve();
  return {
    enqueue(task) {
      chain = chain.then(task).catch((e) => {
        try { onError(e); } catch (e2) { logError(e2, "hypatia.queue"); }
      });
      return chain;
    },
  };
}

// -- Exports ------------------------------------------------------------------

const Utils = {

  lang: { id: LANG_ID },

  cfg: { get: cfg, inspectKey, pickTargetForKey, serialiseTarget, parseTarget, updateSetting },

  json: { clone, stableEquals },

  out: { output, disposeOutputs, makeTracer, logError },

  doc: { isHypatiaDoc },

  editor: { isHypatiaEditor, anyHypatiaEditors },

  sys: { isWindows },

  util: { normaliseEnum, asFiniteNumber, debounce, createSerialQueue }

};

export default Utils;
