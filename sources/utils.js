
import * as vscode from "vscode";

const { workspace, ConfigurationTarget } = vscode;

// -- Configuration helpers ------------------------------------------------- //

function cfg(section, scope) {
  return workspace.getConfiguration(section, scope);
}

function inspectKey(section, key, scope) {
  return cfg(section, scope)?.inspect?.(key);
}

function parseTarget(value) {
  if (value === "WorkspaceFolder") return ConfigurationTarget.WorkspaceFolder;
  if (value === "Workspace") return ConfigurationTarget.Workspace;
  if (value === "Global") return ConfigurationTarget.Global;
  return undefined;
}

function pickTargetForKey(section, key, scope) {
  const inspected = inspectKey(section, key, scope);
  if (inspected?.workspaceFolderValue !== undefined) return ConfigurationTarget.WorkspaceFolder;
  if (inspected?.workspaceValue !== undefined) return ConfigurationTarget.Workspace;
  return ConfigurationTarget.Global;
}

function serialiseTarget(target) {
  switch (target) {
    case ConfigurationTarget.WorkspaceFolder: return "WorkspaceFolder";
    case ConfigurationTarget.Workspace: return "Workspace";
    default: return "Global";
  }
}

async function updateSetting(section, key, value, { scope, target, switchingRef } = {}) {
  let t = target ?? pickTargetForKey(section, key, scope);
  if (t === ConfigurationTarget.WorkspaceFolder && scope === undefined) t = ConfigurationTarget.Workspace;
  const c = cfg(section, scope);
  if (switchingRef) switchingRef.value = true;
  try { await c.update(key, value, t); }
  finally { if (switchingRef) switchingRef.value = false; }
}

// -- Output helpers -------------------------------------------------------- //

function logError(err, prefix = "hypatia") {
  const msg = err instanceof Error ? (err.stack || err.message) : String(err);
  console.error(`[${ prefix }] ${ msg }`);
}

// -- Editor helpers -------------------------------------------------------- //

function isHypatiaEditor(ed) {
  return !!(ed?.document?.languageId === "hypatia");
}

// -- General helpers ------------------------------------------------------- //

function normaliseEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function createSerialQueue(onError = (e) => logError(e, "hypatia")) {
  let chain = Promise.resolve();
  return {
    enqueue(task) {
      chain = chain.then(task).catch(onError);
      return chain;
    }
  };
}

// -- Export list ----------------------------------------------------------- //

export default {
  cfg, inspectKey, parseTarget, pickTargetForKey, serialiseTarget,
  updateSetting, logError, isHypatiaEditor, normaliseEnum, createSerialQueue
};
