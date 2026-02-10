/*------------------------------------------------------------------------------
--                                                                            --
-- Hypatia-VSCode - Hypatia Language Support for VSCode                       --
--                                                                            --
-- style.js                                                                   --
--                                                                            --
-- Copyright (C) 2025-2026, the Hypatia Development Team                      --
-- All rights reserved                                                        --
--                                                                            --
------------------------------------------------------------------------------*/

/* Begin of file style.js */

import * as vscode from "vscode";
import { readFile } from "node:fs/promises";

import utils from "./utils.js";

const { workspace, window } = vscode;

/*----------------------------------------------------------------------------*/

const CFG_ROOT = "hypatia.style";
const STYLE_CHANNEL = "Hypatia Style";

const THEME_LABEL_LIGHT = "Hypatia Light";
const THEME_FILE_LIGHT = "themes/hypatia-light.json";
const THEME_LABEL_DARK = "Hypatia Dark";
const THEME_FILE_DARK = "themes/hypatia-dark.json";

const KEY_STYLE_AUTOTHEME = `${ CFG_ROOT }.autotheme`;
const KEY_STYLE_AUTOTOKENS = `${ CFG_ROOT }.autotokens`;
const KEY_STYLE_VARIANT = `${ CFG_ROOT }.variant`;
const KEY_STYLE_SEMANTIC = `${ CFG_ROOT }.semantichighlighting`;
const KEY_STYLE_TRACE = `${ CFG_ROOT }.trace`;

const INJECTED_RULE_PREFIX = "hypatia_autotokens";

const STATE = {
  autotheme: {
    applied: `${ CFG_ROOT }.autotheme.applied`,
    savedTheme: `${ CFG_ROOT }.autotheme.savedWorkbenchTheme`,
    target: `${ CFG_ROOT }.autotheme.appliedTarget`,
    appliedThemeLabel: `${ CFG_ROOT }.autotheme.currentlyAppliedThemeLabel`,
    appliedScope: `${ CFG_ROOT }.autotheme.currentlyAppliedScope`
  },
  autotokens: {
    applied: `${ CFG_ROOT }.autotokens.applied`,
    savedCustomisations: `${ CFG_ROOT }.autotokens.savedTokenColorCustomizations`,
    target: `${ CFG_ROOT }.autotokens.appliedTarget`,
    lastVariant: `${ CFG_ROOT }.autotokens.lastVariant`,
    appliedVariant: `${ CFG_ROOT }.autotokens.currentlyAppliedVariant`,
    appliedScope: `${ CFG_ROOT }.autotokens.currentlyAppliedScope`
  },
  semantic: {
    applied: `${ CFG_ROOT }.semantichighlighting.applied`,
    savedEnabled: `${ CFG_ROOT }.semantichighlighting.savedEditorSemanticHighlightingEnabled`,
    target: `${ CFG_ROOT }.semantichighlighting.appliedTarget`,
    lastDesired: `${ CFG_ROOT }.semantichighlighting.lastDesired`,
    appliedValue: `${ CFG_ROOT }.semantichighlighting.currentlyAppliedValue`,
    appliedScope: `${ CFG_ROOT }.semantichighlighting.currentlyAppliedScope`
  }
};

/*----------------------------------------------------------------------------*/

/**
 * Creates a tracer specifically configured for the style output channel and
 * trace setting.
 * @param {vscode.ExtensionContext} context - The extension context, used for
 * creating and managing the output channel.
 * @returns {Object} An object with a `line` method for conditional logging.
 */
function makeTracer(context) {
  return utils.makeConfigBasedTracer(context, CFG_ROOT, STYLE_CHANNEL, "trace");
}

/*----------------------------------------------------------------------------*/

/**
 * Gets the configuration for the hypatia.style section.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 * @returns {vscode.WorkspaceConfiguration} The configuration.
 */
const styleCfg = (scope) => utils.cfg(CFG_ROOT, scope);

/**
 * Gets a value from the GlobalState of the extension.
 * @param {vscode.ExtensionContext | undefined} ctx - Extension context.
 * @param {string} k - Key.
 * @param {*} [d] - Default value.
 * @returns {*} The retrieved value or the default.
 */
const gsGet = (ctx, k, d) => utils.gsGet(ctx, k, d);

/**
 * Sets a value in the GlobalState of the extension.
 * @param {vscode.ExtensionContext | undefined} ctx - Extension context.
 * @param {string} k - Key.
 * @param {*} v - Value to set.
 * @returns {Thenable<void> | undefined} Promise resolving when the update is
 * complete, or undefined if context is invalid.
 */
const gsSet = (ctx, k, v) => utils.gsSet(ctx, k, v);

/**
 * Produces a stable, JSON-serialisable key for a configuration scope.
 * @param {vscode.ConfigurationScope | null | undefined} scope
 * @returns {string | undefined}
 */
function stableScopeKey(scope) {
  if (!scope) return undefined;
  try {
    if (scope instanceof vscode.Uri) return scope.toString();
    if (typeof scope === "object" && scope.uri instanceof vscode.Uri) return scope.uri.toString();
  } catch { }
  return String(scope);
}

/*----------------------------------------------------------------------------*/

/**
 * Checks if auto-theme application is enabled.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 * @returns {boolean} True if enabled.
 */
function getAutoThemeEnabled(scope) {
  return styleCfg(scope).get("autotheme", false) === true;
}

/**
 * Checks if auto-tokens application is enabled.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 * @returns {boolean} True if enabled.
 */
function getAutoTokensEnabled(scope) {
  return styleCfg(scope).get("autotokens", true) === true;
}

/**
 * Gets the theme variant setting (light/dark/auto).
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 * @returns {"light" | "dark" | "auto"} Selected variant.
 */
function getThemeVariant(scope) {
  const raw = styleCfg(scope).get("variant", "auto");
  return utils.normaliseEnum(String(raw ?? "auto"), ["light", "dark", "auto"], "auto");
}

/**
 * Resolves the theme variant based on the setting and the current theme.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 * @returns {"light" | "dark"} The resolved variant.
 */
function resolveVariant(scope) {
  const setting = getThemeVariant(scope);
  if (setting === "light" || setting === "dark") return setting;
  return currentThemeKindIsLight() ? "light" : "dark";
}

/**
 * Checks if the currently active theme is light.
 * @returns {boolean} True if the theme is light.
 */
function currentThemeKindIsLight() {
  return utils.isLightThemeKind(window.activeColorTheme.kind);
}

/**
 * Gets the theme label for a variant.
 * @param {"light" | "dark"} variant - The variant.
 * @returns {string} The theme label.
 */
function themeLabelForVariant(variant) {
  return variant === "light" ? THEME_LABEL_LIGHT : THEME_LABEL_DARK;
}

/**
 * Gets the theme file path for a variant.
 * @param {"light" | "dark"} variant - The variant.
 * @returns {string} The theme file path.
 */
function themeFileForVariant(variant) {
  return variant === "light" ? THEME_FILE_LIGHT : THEME_FILE_DARK;
}

/**
 * Gets the semantic highlighting mode.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 * @returns {"on" | "off" | "inherit"} Selected mode.
 */
function getSemanticMode(scope) {
  const raw = styleCfg(scope).get("semantichighlighting", "inherit");
  return utils.normaliseEnum(String(raw ?? "inherit"), ["on", "off", "inherit"], "inherit");
}

/*----------------------------------------------------------------------------*/

const _themeTokenColorsCache = new Map();

/**
 * Reads token colors from a specific theme file.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @param {"light" | "dark"} variant - The theme variant.
 * @param {Object | undefined} trace - Tracer object for logging.
 * @returns {Promise<Array<Object>>} Array of color rules.
 */
async function readTokenColorsFromThemeFile(context, variant, trace) {
  if (_themeTokenColorsCache.has(variant)) return _themeTokenColorsCache.get(variant).slice();
  const rel = themeFileForVariant(variant);
  const abs = context.asAbsolutePath(rel);
  try {
    const raw = await readFile(abs, "utf8");
    const json = JSON.parse(raw);
    const rules = Array.isArray(json.tokenColors) ? json.tokenColors : [];
    _themeTokenColorsCache.set(variant, rules);
    return rules.slice();
  } catch (err) {
    trace?.line(`AutoTokens: failed reading ${ rel }`);
    utils.logError(err, "hypatia.style");
    _themeTokenColorsCache.set(variant, []);
    return [];
  }
}

/**
 * Clones an array of TextMate rules and assigns them new names with a unique
 * prefix. Used to inject Hypatia-specific token rules.
 * @param {Array<any> | undefined} themeTokenColors - Original array of TextMate
 * rules.
 * @returns {Array<any>} New array of cloned rules with prefixed names.
 */
const buildInjectedRules = (themeTokenColors) =>
  utils.cloneTextMateRulesWithInjectedNames(themeTokenColors, INJECTED_RULE_PREFIX);

/**
 * Filters an array of TextMate rules, removing those whose name starts with the
 * injection prefix. Used to remove previously injected Hypatia-specific token
 * rules.
 * @param {Array<any> | undefined} rules - Array of TextMate rules.
 * @returns {Array<any>} New filtered array without injected rules.
 */
const stripInjectedRules = (rules) =>
  utils.stripRulesWithNamePrefix(rules, INJECTED_RULE_PREFIX);

/**
 * Checks if an array of TextMate rules contains at least one rule whose name
 * starts with the injection prefix. Used to detect if Hypatia-specific token
 * rules are already present.
 * @param {Array<any> | undefined} rules - Array of TextMate rules.
 * @returns {boolean} True if at least one injected rule is found.
 */
const hasInjectedRules = (rules) =>
  utils.hasRulesWithNamePrefix(rules, INJECTED_RULE_PREFIX);

/*----------------------------------------------------------------------------*/

/**
 * Sets the main VSCode workbench theme.
 * @param {string} themeLabel - Label of the theme to set.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {vscode.ConfigurationTarget} target - Configuration target.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 */
async function setWorkbenchTheme(themeLabel, switchingRef, target, scope) {
  const wb = utils.cfg("workbench", scope);
  const current = wb.get("colorTheme");
  if (!current || current === themeLabel) return;
  await utils.updateSetting("workbench", "colorTheme", themeLabel, { switchingRef, target, scope });
}

/**
 * Applies the whole theme if enabled and the required variant/state is
 * different from the applied one or if VSCode state differs. Prioritizes
 * checking the actual VSCode state to avoid unnecessary updates.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {Object | undefined} trace - Tracer object for logging.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 */
async function applyWholeTheme(context, switchingRef, trace, scope) {

  const scopeKey = stableScopeKey(scope);
  const isEnabled = getAutoThemeEnabled(scope);
  const appliedLabel = gsGet(context, STATE.autotheme.appliedThemeLabel);
  const appliedScopeKey = gsGet(context, STATE.autotheme.appliedScope);
  if (!isEnabled) {
    if (appliedLabel && appliedScopeKey === scopeKey) {
      await gsSet(context, STATE.autotheme.appliedThemeLabel, undefined);
      await gsSet(context, STATE.autotheme.appliedScope, undefined);
      trace?.line(`AutoTheme: disabled, cleared applied state in scope ${ scope || 'global' }`);
    }
    return;
  }

  const wb = utils.cfg("workbench", scope);
  const currentVscodeTheme = wb.get("colorTheme");
  const desiredVariant = resolveVariant(scope);
  const desiredThemeLabel = themeLabelForVariant(desiredVariant);
  if (currentVscodeTheme === desiredThemeLabel) {
    if (appliedLabel !== desiredThemeLabel || appliedScopeKey !== scopeKey) {
      await gsSet(context, STATE.autotheme.appliedThemeLabel, desiredThemeLabel);
      await gsSet(context, STATE.autotheme.appliedScope, scopeKey);
      if (!gsGet(context, STATE.autotheme.applied, false)) {
        await gsSet(context, STATE.autotheme.applied, true);
        const target = utils.pickTargetForKey("workbench", "colorTheme", scope);
        await gsSet(context, STATE.autotheme.target, utils.serialiseTarget(target));
      }
      trace?.line(`AutoTheme: theme ${ desiredThemeLabel } already active in VSCode, synced local state in scope ${ scope || 'global' }`);
    }
    return;
  }

  if (appliedLabel === desiredThemeLabel && appliedScopeKey !== scopeKey) {
    trace?.line(`AutoTheme: internal state says '${ desiredThemeLabel }' was applied in scope ${ scope || 'global' }, but VSCode shows '${ currentVscodeTheme }'. Will re-apply '${ desiredThemeLabel }'.`);
  }

  const currentIsHypatia = currentVscodeTheme === THEME_LABEL_DARK || currentVscodeTheme === THEME_LABEL_LIGHT;
  const storedTarget = utils.parseTarget(gsGet(context, STATE.autotheme.target));
  const target = storedTarget ?? utils.pickTargetForKey("workbench", "colorTheme", scope);
  if (!currentIsHypatia) {
    await setWorkbenchTheme(desiredThemeLabel, switchingRef, target, scope);
    await gsSet(context, STATE.autotheme.applied, true);
    await gsSet(context, STATE.autotheme.savedTheme, currentVscodeTheme);
    await gsSet(context, STATE.autotheme.target, utils.serialiseTarget(target));
    await gsSet(context, STATE.autotheme.appliedThemeLabel, desiredThemeLabel);
    await gsSet(context, STATE.autotheme.appliedScope, scopeKey);
    trace?.line(`AutoTheme: switched to ${ desiredThemeLabel } in scope ${ scope || 'global' } (saved ${ currentVscodeTheme })`);
    return;
  }

  await setWorkbenchTheme(desiredThemeLabel, switchingRef, target, scope);
  await gsSet(context, STATE.autotheme.appliedThemeLabel, desiredThemeLabel);
  await gsSet(context, STATE.autotheme.appliedScope, scopeKey);
  trace?.line(`AutoTheme: adjusted to ${ desiredThemeLabel } in scope ${ scope || 'global' }`);
  if (!storedTarget && gsGet(context, STATE.autotheme.applied, false) === true) {
    await gsSet(context, STATE.autotheme.target, utils.serialiseTarget(target));
  }

}

/**
 * Restores the previous theme if it was applied automatically.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {Object | undefined} trace - Tracer object for logging.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 */
async function restoreWholeTheme(context, switchingRef, trace, scope) {

  const scopeKey = stableScopeKey(scope);
  const autoApplied = gsGet(context, STATE.autotheme.applied, false) === true;
  if (!autoApplied) {
    const appliedLabel = gsGet(context, STATE.autotheme.appliedThemeLabel);
    const appliedScopeKey = gsGet(context, STATE.autotheme.appliedScope);
    if (appliedLabel && appliedScopeKey === scopeKey) {
      await gsSet(context, STATE.autotheme.appliedThemeLabel, undefined);
      await gsSet(context, STATE.autotheme.appliedScope, undefined);
      trace?.line(`AutoTheme: not marked as auto-applied, cleared local state for scope ${ scope || 'global' }`);
    }
    return;
  }

  const appliedLabel = gsGet(context, STATE.autotheme.appliedThemeLabel);
  const appliedScopeKey = gsGet(context, STATE.autotheme.appliedScope);
  if (appliedLabel === undefined || appliedScopeKey !== scopeKey) {
    trace?.line(`AutoTheme: nothing to restore in scope ${ scope || 'global' }`);
    if (appliedScopeKey === scopeKey) {
      await gsSet(context, STATE.autotheme.appliedThemeLabel, undefined);
      await gsSet(context, STATE.autotheme.appliedScope, undefined);
    }
    return;
  }

  const wb = utils.cfg("workbench", scope);
  const currentVscodeTheme = wb.get("colorTheme");
  const savedTheme = gsGet(context, STATE.autotheme.savedTheme);
  const target =
    utils.parseTarget(gsGet(context, STATE.autotheme.target)) ??
    utils.pickTargetForKey("workbench", "colorTheme", scope);
  try {
    if (currentVscodeTheme === appliedLabel && typeof savedTheme === "string" && savedTheme.length > 0) {
      await setWorkbenchTheme(savedTheme, switchingRef, target, scope);
      trace?.line(`AutoTheme: restored ${ savedTheme } in scope ${ scope || 'global' }`);
    } else {
      trace?.line(
        `AutoTheme: current theme in VSCode (${ currentVscodeTheme }) does not match the theme we applied (${ appliedLabel }), ` +
        `or saved theme is missing. Not restoring. Cleared our applied state for scope ${ scope || 'global' }.`
      );
    }
  } finally {
    await gsSet(context, STATE.autotheme.applied, false);
    await gsSet(context, STATE.autotheme.savedTheme, undefined);
    await gsSet(context, STATE.autotheme.target, undefined);
    await gsSet(context, STATE.autotheme.appliedThemeLabel, undefined);
    await gsSet(context, STATE.autotheme.appliedScope, undefined);
  }

}

/*----------------------------------------------------------------------------*/

/**
 * Applies the token color overlay if enabled.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {Object | undefined} trace - Tracer object for logging.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 */
async function applyTokenOverlay(context, switchingRef, trace, scope) {

  const scopeKey = stableScopeKey(scope);
  const editorCfg = utils.cfg("editor", scope);
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = utils.asPlainObject(rawCurrent, {});
  const currentlyHasInjected = hasInjectedRules(current.textMateRules);
  const variant = resolveVariant(scope);
  const autoApplied = gsGet(context, STATE.autotokens.applied, false) === true;
  const appliedVariant = gsGet(context, STATE.autotokens.appliedVariant);
  const appliedScopeKey = gsGet(context, STATE.autotokens.appliedScope);
  if (autoApplied && appliedVariant === variant && appliedScopeKey === scopeKey && currentlyHasInjected) {
    trace?.line(`AutoTokens: already applied for variant '${ variant }' in scope ${ scope || 'global' }`);
    return;
  }

  const storedTarget = utils.parseTarget(gsGet(context, STATE.autotokens.target));
  const target = storedTarget ?? utils.pickTargetForKey("editor", "tokenColorCustomizations", scope);
  if (!autoApplied) {
    const baseline = Object.assign({}, current, { textMateRules: stripInjectedRules(current.textMateRules) });
    await gsSet(context, STATE.autotokens.savedCustomisations, baseline);
    await gsSet(context, STATE.autotokens.applied, true);
    await gsSet(context, STATE.autotokens.target, utils.serialiseTarget(target));
  } else {
    const saved = gsGet(context, STATE.autotokens.savedCustomisations);
    if (saved === undefined) {
      const baseline = Object.assign({}, current, { textMateRules: stripInjectedRules(current.textMateRules) });
      await gsSet(context, STATE.autotokens.savedCustomisations, baseline);
    }
    if (!storedTarget) await gsSet(context, STATE.autotokens.target, utils.serialiseTarget(target));
  }

  const baseRules = stripInjectedRules(current.textMateRules);
  const base = Object.assign({}, current, { textMateRules: baseRules });
  const themeTokenColors = await readTokenColorsFromThemeFile(context, variant, trace);
  const injectedRules = buildInjectedRules(themeTokenColors);
  const next = Object.assign({}, base, { textMateRules: [...baseRules, ...injectedRules] });
  await utils.updateSetting("editor", "tokenColorCustomizations", next, { switchingRef, target, scope });
  await gsSet(context, STATE.autotokens.applied, true);
  await gsSet(context, STATE.autotokens.appliedVariant, variant);
  await gsSet(context, STATE.autotokens.appliedScope, scopeKey);
  await gsSet(context, STATE.autotokens.lastVariant, variant);
  trace?.line(`AutoTokens: applied variant '${ variant }' in scope ${ scope || 'global' }`);

}

/**
 * Restores the previous token colors if they were applied automatically.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {Object | undefined} trace - Tracer object for logging.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 */
async function restoreTokenOverlay(context, switchingRef, trace, scope) {

  const editorCfg = utils.cfg("editor", scope);
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = utils.asPlainObject(rawCurrent, {});
  const hadInjected = hasInjectedRules(current.textMateRules);
  const autoApplied = gsGet(context, STATE.autotokens.applied, false) === true;
  if (!autoApplied && !hadInjected) return;

  const storedTarget = utils.parseTarget(gsGet(context, STATE.autotokens.target));
  const target = storedTarget ?? utils.pickTargetForKey("editor", "tokenColorCustomizations", scope);
  let targetValue;
  if (autoApplied) {
    const saved = gsGet(context, STATE.autotokens.savedCustomisations);
    if (saved && typeof saved === "object") {
      const savedObj = utils.asPlainObject(saved, {});
      targetValue = Object.assign({}, savedObj, { textMateRules: stripInjectedRules(savedObj.textMateRules) });
    } else {
      targetValue = undefined;
    }
  } else {
    targetValue = Object.assign({}, current, { textMateRules: stripInjectedRules(current.textMateRules) });
  }

  await utils.updateSetting("editor", "tokenColorCustomizations", targetValue, { switchingRef, target, scope });
  await gsSet(context, STATE.autotokens.applied, false);
  await gsSet(context, STATE.autotokens.savedCustomisations, undefined);
  await gsSet(context, STATE.autotokens.target, undefined);
  await gsSet(context, STATE.autotokens.appliedVariant, undefined);
  await gsSet(context, STATE.autotokens.appliedScope, undefined);
  await gsSet(context, STATE.autotokens.lastVariant, undefined);
  trace?.line(`AutoTokens: restored/cleaned in scope ${ scope || 'global' }`);

}

/*----------------------------------------------------------------------------*/

/**
 * Applies the override for semantic highlighting if enabled.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {Object | undefined} trace - Tracer object for logging.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 */
async function applySemanticOverride(context, switchingRef, trace, scope) {

  const mode = getSemanticMode(scope);
  if (mode === "inherit") {
    if (gsGet(context, STATE.semantic.applied, false) === true) {
      await restoreSemanticOverride(context, switchingRef, trace, scope);
    } else {
      const appliedValue = gsGet(context, STATE.semantic.appliedValue);
      const appliedScopeKey = gsGet(context, STATE.semantic.appliedScope);
      if (appliedValue !== undefined && appliedScopeKey === stableScopeKey(scope)) {
        await gsSet(context, STATE.semantic.appliedValue, undefined);
        await gsSet(context, STATE.semantic.appliedScope, undefined);
      }
    }
    trace?.line(`Semantic: inherit mode in scope ${ scope || "global" }`);
    return;
  }

  const desired = mode === "on";
  const editorCfg = utils.cfg("editor", scope);
  const storedTarget = utils.parseTarget(gsGet(context, STATE.semantic.target));
  const target = storedTarget ?? utils.pickTargetForKey("editor", "semanticHighlighting.enabled", scope);
  const inspected = utils.inspectKey("editor", "semanticHighlighting.enabled", scope);
  const valueInTarget = utils.valueAtTarget(inspected, target);
  const autoApplied = gsGet(context, STATE.semantic.applied, false) === true;
  const appliedValue = gsGet(context, STATE.semantic.appliedValue);
  const appliedScopeKey = gsGet(context, STATE.semantic.appliedScope);
  const scopeKey = stableScopeKey(scope);
  if (appliedValue === desired && appliedScopeKey === scopeKey && valueInTarget === desired) {
    trace?.line(`Semantic: already forced ${ desired ? "on" : "off" } in scope ${ scope || "global" }`);
    return;
  }

  if (!autoApplied) {
    if (editorCfg.get("semanticHighlighting.enabled") === desired) return;
    await gsSet(context, STATE.semantic.savedEnabled, valueInTarget);
    await gsSet(context, STATE.semantic.applied, true);
    await gsSet(context, STATE.semantic.target, utils.serialiseTarget(target));
  } else {
    const lastDesired = gsGet(context, STATE.semantic.lastDesired);
    if (typeof lastDesired === "boolean" && valueInTarget !== lastDesired) {
      await gsSet(context, STATE.semantic.savedEnabled, valueInTarget);
    }
    if (!storedTarget) await gsSet(context, STATE.semantic.target, utils.serialiseTarget(target));
  }

  await utils.updateSetting("editor", "semanticHighlighting.enabled", desired, { switchingRef, target, scope });
  await gsSet(context, STATE.semantic.lastDesired, desired);
  await gsSet(context, STATE.semantic.appliedValue, desired);
  await gsSet(context, STATE.semantic.appliedScope, scopeKey);
  trace?.line(`Semantic: forced ${ desired ? `"on"` : `"off"` } in scope ${ scope || "global" }`);

}

/**
 * Restores the previous semantic highlighting if it was applied automatically.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {Object | undefined} trace - Tracer object for logging.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 */
async function restoreSemanticOverride(context, switchingRef, trace, scope) {

  const scopeKey = stableScopeKey(scope);
  const autoApplied = gsGet(context, STATE.semantic.applied, false) === true;
  if (!autoApplied) {
    const appliedScopeKey = gsGet(context, STATE.semantic.appliedScope);
    if (appliedScopeKey === scopeKey) {
      await gsSet(context, STATE.semantic.appliedValue, undefined);
      await gsSet(context, STATE.semantic.appliedScope, undefined);
    }
    return;
  }

  const storedTarget = utils.parseTarget(gsGet(context, STATE.semantic.target));
  const target = storedTarget ?? utils.pickTargetForKey("editor", "semanticHighlighting.enabled", scope);
  const saved = gsGet(context, STATE.semantic.savedEnabled);
  try {
    await utils.updateSetting("editor", "semanticHighlighting.enabled", saved ?? undefined, { switchingRef, target, scope });
    trace?.line(`Semantic: restored in scope ${ scope || "global" }`);
  } finally {
    await gsSet(context, STATE.semantic.applied, false);
    await gsSet(context, STATE.semantic.savedEnabled, undefined);
    await gsSet(context, STATE.semantic.target, undefined);
    await gsSet(context, STATE.semantic.lastDesired, undefined);
    await gsSet(context, STATE.semantic.appliedValue, undefined);
    await gsSet(context, STATE.semantic.appliedScope, undefined);
  }

}

/*----------------------------------------------------------------------------*/

/**
 * Main function that coordinates the application or restoration of styles.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @param {vscode.TextEditor | undefined} editor - Active editor.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {{value: boolean}} lastWasHypatiaRef - Reference for previous state.
 * @param {Object} reasonsRef - Object containing reasons for reconciliation.
 * @param {Object | undefined} trace - Tracer object for logging.
 * @param {Object | undefined} leaveRef - Reference to the leave
 * scheduling/cancellation mechanism.
 */
async function reconcile(context, editor, switchingRef, lastWasHypatiaRef, reasonsRef, trace, leaveRef) {

  if (switchingRef.value) return;

  const reasons = {
    init: !!reasonsRef.init,
    editor: !!reasonsRef.editor,
    theme: !!reasonsRef.theme,
    config: !!reasonsRef.config,
  };
  reasonsRef.init = false;
  reasonsRef.editor = false;
  reasonsRef.theme = false;
  reasonsRef.config = false;

  const lastWasHyp = lastWasHypatiaRef.value;
  const anyApplied =
    gsGet(context, STATE.autotheme.applied, false) === true ||
    gsGet(context, STATE.autotokens.applied, false) === true ||
    gsGet(context, STATE.semantic.applied, false) === true;
  if (!editor || !editor.document) {
    if (lastWasHyp || (reasons.init && anyApplied)) leaveRef?.scheduleNoActive?.();
    return;
  }

  const scope = undefined;
  const isHyp = utils.isHypatiaEditor(editor);
  if (isHyp) {
    leaveRef?.cancel?.();
    if (!lastWasHyp) {
      trace?.line("Entering Hypatia");
    } else {
      const needsReapply = reasons.init || reasons.theme || reasons.config;
      if (!needsReapply) return;
    }
    lastWasHypatiaRef.value = true;
    const semanticMode = getSemanticMode(scope);
    if (semanticMode === "inherit") await restoreSemanticOverride(context, switchingRef, trace, scope);
    else await applySemanticOverride(context, switchingRef, trace, scope);
    const autoTheme = getAutoThemeEnabled(scope);
    if (autoTheme) {
      await applyWholeTheme(context, switchingRef, trace, scope);
      await restoreTokenOverlay(context, switchingRef, trace, scope);
    } else {
      await restoreWholeTheme(context, switchingRef, trace, scope);
      if (!getAutoTokensEnabled(scope)) await restoreTokenOverlay(context, switchingRef, trace, scope);
      else await applyTokenOverlay(context, switchingRef, trace, scope);
    }
    return;
  }

  if (lastWasHyp || (reasons.init && anyApplied)) {
    leaveRef?.scheduleNonHyp?.();
  }

}

/*----------------------------------------------------------------------------*/

/**
 * Activates the style management.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @returns {vscode.Disposable} Object for deactivation.
 */
export function activateStyle(context) {

  const switchingRef = { value: false };
  const lastWasHypatiaRef = { value: false };
  const reasonsRef = { init: true, editor: false, theme: false, config: false };
  const trace = makeTracer(context);
  const queue = utils.createSerialQueue((err) => {
    try { trace?.line(`Error: ${ String(err?.message ?? err) }`); } catch { }
    utils.logError(err, "hypatia.style");
  });
  const disposables = [];
  const schedule = (fn) =>
    (typeof queueMicrotask === "function" ? queueMicrotask : (f) => Promise.resolve().then(f))(fn);
  const LEAVE_DEBOUNCE_MS = 75;
  let leaveTimer = undefined;
  let leaveSeq = 0;
  const cancelLeave = () => {
    leaveSeq += 1;
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = undefined; }
  };

  const enqueueLeaveRestore = (why) => {
    return queue.enqueue(async () => {
      try {
        trace?.line(`Leaving Hypatia (${ why })`);
        await restoreTokenOverlay(context, switchingRef, trace, undefined);
        await restoreSemanticOverride(context, switchingRef, trace, undefined);
        await restoreWholeTheme(context, switchingRef, trace, undefined);
      } finally {
        lastWasHypatiaRef.value = false;
      }
    });
  };

  const scheduleLeave = (why, shouldRestore) => {
    const seq = ++leaveSeq;
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      leaveTimer = undefined;
      if (seq !== leaveSeq) return;
      let ok = false;
      try { ok = shouldRestore(); } catch { ok = false; }
      if (ok) void enqueueLeaveRestore(why);
    }, LEAVE_DEBOUNCE_MS);
  };

  const leaveRef = {
    cancel: cancelLeave,
    scheduleNoActive: () =>
      scheduleLeave("no active editor", () => {
        const ed = window.activeTextEditor;
        if (ed && utils.isHypatiaEditor(ed)) return false;
        if (window.visibleTextEditors.some(utils.isHypatiaEditor)) return false;
        return !ed || !ed.document;
      }),
    scheduleNonHyp: () =>
      scheduleLeave("active editor not Hypatia", () => {
        const ed = window.activeTextEditor;
        if (!ed || !ed.document) return false;
        return !utils.isHypatiaEditor(ed);
      })
  };

  let pending = false;
  const requestReconcile = (reason) => {
    if (reason === "editor") reasonsRef.editor = true;
    else if (reason === "theme") reasonsRef.theme = true;
    else if (reason === "config") reasonsRef.config = true;
    else reasonsRef.init = true;
    if (pending) return;
    pending = true;
    schedule(() => {
      pending = false;
      const ed = window.activeTextEditor;
      queue.enqueue(() => reconcile(context, ed, switchingRef, lastWasHypatiaRef, reasonsRef, trace, leaveRef));
    });
  };

  disposables.push(window.onDidChangeActiveTextEditor(() => requestReconcile("editor")));
  disposables.push(window.onDidChangeActiveColorTheme(() => requestReconcile("theme")));
  disposables.push(workspace.onDidChangeConfiguration((e) => {
    if (switchingRef.value) return;
    const relevant =
      e.affectsConfiguration(KEY_STYLE_AUTOTOKENS) ||
      e.affectsConfiguration(KEY_STYLE_AUTOTHEME) ||
      e.affectsConfiguration(KEY_STYLE_VARIANT) ||
      e.affectsConfiguration(KEY_STYLE_SEMANTIC) ||
      e.affectsConfiguration(KEY_STYLE_TRACE) ||
      e.affectsConfiguration("editor.tokenColorCustomizations") ||
      e.affectsConfiguration("editor.semanticHighlighting.enabled") ||
      e.affectsConfiguration("workbench.colorTheme");
    if (relevant) requestReconcile("config");
  }));

  requestReconcile("init");

  const disposeAsync = async () => {
    cancelLeave();
    for (const d of disposables) { try { d.dispose(); } catch { } }
    await queue.enqueue(async () => {
      try {
        await restoreTokenOverlay(context, switchingRef, trace, undefined);
        await restoreSemanticOverride(context, switchingRef, trace, undefined);
        await restoreWholeTheme(context, switchingRef, trace, undefined);
      } catch (err) {
        utils.logError(err, `${ CFG_ROOT }.dispose`);
      } finally {
        lastWasHypatiaRef.value = false;
      }
    });
  };

  return {
    dispose() { void disposeAsync(); },
    disposeAsync
  };

}

/* End of file style.js */
