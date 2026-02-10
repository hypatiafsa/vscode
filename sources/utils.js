/*------------------------------------------------------------------------------
--                                                                            --
-- Hypatia-VSCode - Hypatia Language Support for VSCode                       --
--                                                                            --
-- utils.js                                                                   --
--                                                                            --
-- Copyright (C) 2025-2026, the Hypatia Development Team                      --
-- All rights reserved                                                        --
--                                                                            --
------------------------------------------------------------------------------*/

/* Begin of file utils.js */

import * as vscode from "vscode";
import { isDeepStrictEqual } from "node:util";

const { workspace, window, ColorThemeKind, ConfigurationTarget } = vscode;

// Configuration helpers -------------------------------------------------------

/**
 * Retrieves the configuration object for a given section and optional scope.
 * @param {string} section - The configuration section (e.g., "hypatia",
 * "editor").
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope
 * (document, workspace folder, etc.).
 * @returns {vscode.WorkspaceConfiguration} The configuration object.
 */
function cfg(section, scope) {
  return workspace.getConfiguration(section, scope);
}

/**
 * Gets the inspection object for a specific configuration key.
 * @param {string} section - The configuration section.
 * @param {string} key - The specific key within the section.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 * @returns {vscode.ConfigurationInspect | undefined} The inspection object or
 * undefined if not found.
 */
function inspectKey(section, key, scope) {
  return cfg(section, scope)?.inspect?.(key);
}

/**
 * Extracts the value of a key from an inspection object for a specific target.
 * @param {vscode.ConfigurationInspect | undefined} inspected - Object obtained
 * from inspectKey.
 * @param {ConfigurationTarget} target - Configuration target (Global,
 * Workspace, WorkspaceFolder).
 * @returns {*} The value at the specified target, or undefined if not present.
 */
function valueAtTarget(inspected, target) {
  if (!inspected) return undefined;
  if (target === ConfigurationTarget.WorkspaceFolder) return inspected.workspaceFolderValue;
  if (target === ConfigurationTarget.Workspace) return inspected.workspaceValue;
  return inspected.globalValue;
}

/**
 * Converts a string into a ConfigurationTarget.
 * @param {string} value - A string like "Global", "Workspace",
 * "WorkspaceFolder".
 * @returns {ConfigurationTarget | undefined} The corresponding target or
 * undefined if invalid.
 */
function parseTarget(value) {
  if (value === "WorkspaceFolder") return ConfigurationTarget.WorkspaceFolder;
  if (value === "Workspace") return ConfigurationTarget.Workspace;
  if (value === "Global") return ConfigurationTarget.Global;
  return undefined;
}

/**
 * Determines the configuration target where a specific key has a defined value,
 * searching first in WorkspaceFolder, then in Workspace. If not found, assumes
 * Global.
 * @param {string} section - The configuration section.
 * @param {string} key - The specific key.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 * @returns {ConfigurationTarget} The most specific target where the key has a
 * value.
 */
function pickTargetForKey(section, key, scope) {
  const inspected = inspectKey(section, key, scope);
  if (inspected?.workspaceFolderValue !== undefined) return ConfigurationTarget.WorkspaceFolder;
  if (inspected?.workspaceValue !== undefined) return ConfigurationTarget.Workspace;
  return ConfigurationTarget.Global;
}

/**
 * Serializes a ConfigurationTarget into a representative string.
 * @param {ConfigurationTarget} target - The target to serialize.
 * @returns {"Global" | "Workspace" | "WorkspaceFolder"} The representative
 * string.
 */
function serialiseTarget(target) {
  switch (target) {
    case ConfigurationTarget.WorkspaceFolder: return "WorkspaceFolder";
    case ConfigurationTarget.Workspace: return "Workspace";
    default: return "Global";
  }
}

/**
 * Updates a configuration setting, avoiding redundant writes.
 * @param {string} section - The configuration section.
 * @param {string} key - The specific key.
 * @param {*} value - The new value.
 * @param {Object} options - Options for the update.
 * @param {vscode.ConfigurationScope | null | undefined} [options.scope] -
 * Configuration scope.
 * @param {ConfigurationTarget} [options.target] - Specific target. If omitted,
 * uses pickTargetForKey.
 * @param {{ value: boolean }} [options.switchingRef] - Optional reference to
 * signal update status.
 */
async function updateSetting(section, key, value, { scope, target, switchingRef } = {}) {
  let t = target ?? pickTargetForKey(section, key, scope);
  if (t === ConfigurationTarget.WorkspaceFolder && scope === undefined) {
    logWarning(`Scope undefined for target WorkspaceFolder, falling back to Workspace for setting ${ section }.${ key }`);
    t = ConfigurationTarget.Workspace;
  }
  const c = cfg(section, scope);
  try {
    const inspected = inspectKey(section, key, scope);
    const currentAtTarget = valueAtTarget(inspected, t);
    if (isDeepStrictEqual(currentAtTarget, value)) return;
  } catch (err) {
    logError(err, "updateSetting");
  }
  if (switchingRef) switchingRef.value = true;
  try {
    await c.update(key, value, t);
  } finally {
    if (switchingRef) switchingRef.value = false;
  }
}

// GlobalState helpers ---------------------------------------------------------

/**
 * Gets a value from the extension's GlobalState.
 * @param {vscode.ExtensionContext | undefined} ctx - Extension context.
 * @param {string} k - Key.
 * @param {*} [d] - Default value.
 * @returns {*} The retrieved value or the default.
 */
function gsGet(ctx, k, d) {
  return ctx?.globalState?.get?.(k, d);
}

/**
 * Sets a value in the extension's GlobalState.
 * @param {vscode.ExtensionContext | undefined} ctx - Extension context.
 * @param {string} k - Key.
 * @param {*} v - Value to set.
 * @returns {Thenable<void>} Promise resolving when the update is complete.
 */
function gsSet(ctx, k, v) {
  return ctx?.globalState?.update?.(k, v);
}

// Editor helpers --------------------------------------------------------------

/**
 * Checks if an editor is associated with a Hypatia document.
 * @param {vscode.TextEditor | undefined} ed - The editor to check.
 * @returns {boolean} True if the editor contains a Hypatia document.
 */
function isHypatiaEditor(ed) {
  return !!(ed?.document?.languageId === "hypatia");
}

/**
 * Checks if a theme is light.
 * @param {ColorThemeKind} kind - The theme kind.
 * @returns {boolean} True if the theme is light.
 */
function isLightThemeKind(kind) {
  return kind === ColorThemeKind.Light || kind === ColorThemeKind.HighContrastLight;
}

// Output helpers --------------------------------------------------------------

/**
 * Logs an error to the console.
 * @param {any} err - The error to log.
 * @param {string} [prefix="hypatia"] - Prefix for the log message.
 */
function logError(err, prefix = "hypatia") {
  const msg = err instanceof Error ? (err.stack || err.message) : String(err);
  console.error(`[${ prefix }] ${ msg }`);
}

/**
 * Logs a warning to the console.
 * @param {any} warn - The warning to log.
 * @param {string} [prefix="hypatia"] - Prefix for the log message.
 */
function logWarning(warn, prefix = "hypatia") {
  const msg = warn instanceof Error ? (warn.stack || warn.message) : String(warn);
  console.warn(`[${ prefix }] ${ msg }`);
}

/**
 * Creates a tracer for writing lines to a VSCode output channel conditionally.
 * @param {vscode.ExtensionContext | undefined} context - Extension context for
 * registering the channel.
 * @param {string} channelName - Name of the output channel.
 * @param {Function} [enabledFn] - Predicate function to decide whether to log.
 * @param {Object} [opts] - Additional options.
 * @param {string} [opts.prefix=""] - Prefix to add to every line.
 * @returns {Object} An object with the `line` method.
 */
function createTracer(context, channelName, enabledFn, { prefix = "" } = {}) {
  const ch = window.createOutputChannel(channelName);
  if (context?.subscriptions) context.subscriptions.push(ch);
  return {
    line(line) {
      try {
        if (typeof enabledFn === "function" && !enabledFn()) return;
      } catch (err) {
        logError(err, "createTracer");
        return;
      }
      ch.appendLine(`${ prefix }${ String(line) }`);
    }
  };
}

// General helpers -------------------------------------------------------------

/**
 * Normalizes an enum value by checking it against a list of allowed values.
 * @param {*} value - Value to normalize.
 * @param {Array<any>} allowed - List of allowed values.
 * @param {*} fallback - Value to return if the input value is not allowed.
 * @returns {*} The original value if allowed, otherwise the fallback.
 */
function normaliseEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

/**
 * Returns a value only if it is a plain object and not an array.
 * @param {*} value - The value to check.
 * @param {Object} [fallback={}] - Object to return if value is not a plain
 * object.
 * @returns {Object} The original value or the fallback.
 */
function asPlainObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

/**
 * Checks if an array of rules contains at least one rule whose name starts with
 * a prefix.
 * @param {Array<any> | undefined} rules - Array of rules.
 * @param {string} namePrefix - Prefix to search for in the name.
 * @returns {boolean} True if at least one matching rule is found.
 */
function hasRulesWithNamePrefix(rules, namePrefix) {
  if (!Array.isArray(rules)) return false;
  return rules.some((r) => typeof r?.name === "string" && r.name.startsWith(namePrefix));
}

/**
 * Filters an array of rules, removing those whose name starts with a prefix.
 * @param {Array<any> | undefined} rules - Array of rules.
 * @param {string} namePrefix - Prefix to search for in the name.
 * @returns {Array<any>} New filtered array.
 */
function stripRulesWithNamePrefix(rules, namePrefix) {
  if (!Array.isArray(rules)) return [];
  return rules.filter((r) => !(typeof r?.name === "string" && r.name.startsWith(namePrefix)));
}

/**
 * Clones an array of TextMate rules and assigns them new names with a unique
 * prefix.
 * @param {Array<any> | undefined} rules - Original array of rules.
 * @param {string} namePrefix - Prefix to use for the new names.
 * @returns {Array<any>} New array of cloned rules with new names.
 */
function cloneTextMateRulesWithInjectedNames(rules, namePrefix) {
  if (!Array.isArray(rules)) return [];
  return rules.map((r, i) => {
    const clone = Object.assign({}, r);
    clone.name = `${ namePrefix }:${ i }`;
    if (Array.isArray(clone.scope)) clone.scope = clone.scope.slice();
    if (clone.settings && typeof clone.settings === "object") {
      clone.settings = Object.assign({}, clone.settings);
    }
    return clone;
  });
}

/**
 * Creates a serial queue to execute asynchronous tasks in order. Errors in a
 * single task do not stop the queue, they are handled.
 * @param {Function} [onError=(e) => logError(e, "hypatia")] - Callback for
 * error handling.
 * @returns {Object} An object with the `enqueue` method.
 */
function createSerialQueue(onError = (e) => logError(e, "hypatia")) {
  let chain = Promise.resolve();
  return {
    enqueue(task) {
      chain = chain.then(task).catch(onError);
      return chain;
    }
  };
}

// Export list -----------------------------------------------------------------

export default {

  cfg, inspectKey, valueAtTarget, parseTarget, pickTargetForKey,
  serialiseTarget, updateSetting,

  gsGet, gsSet,

  isHypatiaEditor, isLightThemeKind,

  logError, logWarning, createTracer,

  normaliseEnum, asPlainObject, hasRulesWithNamePrefix,
  stripRulesWithNamePrefix, cloneTextMateRulesWithInjectedNames,
  createSerialQueue

};

/* End of file utils.js */
