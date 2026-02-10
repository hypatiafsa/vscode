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

import cfg from "./utils.js";

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
  return cfg.makeConfigBasedTracer(context, CFG_ROOT, STYLE_CHANNEL, "trace");
}

/*----------------------------------------------------------------------------*/

/**
 * Gets the configuration for the hypatia.style section.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 * @returns {vscode.WorkspaceConfiguration} The configuration.
 */
const styleCfg = (scope) => cfg.cfg(CFG_ROOT, scope);

/**
 * Gets a value from the GlobalState of the extension.
 * @param {vscode.ExtensionContext | undefined} ctx - Extension context.
 * @param {string} k - Key.
 * @param {*} [d] - Default value.
 * @returns {*} The retrieved value or the default.
 */
const gsGet = (ctx, k, d) => cfg.gsGet(ctx, k, d);

/**
 * Sets a value in the GlobalState of the extension.
 * @param {vscode.ExtensionContext | undefined} ctx - Extension context.
 * @param {string} k - Key.
 * @param {*} v - Value to set.
 * @returns {Thenable<void> | undefined} Promise resolving when the update is
 * complete, or undefined if context is invalid.
 */
const gsSet = (ctx, k, v) => cfg.gsSet(ctx, k, v);

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
  return cfg.normaliseEnum(String(raw ?? "auto"), ["light", "dark", "auto"], "auto");
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
  return cfg.isLightThemeKind(window.activeColorTheme.kind);
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
  return cfg.normaliseEnum(String(raw ?? "inherit"), ["on", "off", "inherit"], "inherit");
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
    trace?.line(`Autotokens: failed reading ${ rel }`);
    cfg.logError(err, "hypatia.style");
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
  cfg.cloneTextMateRulesWithInjectedNames(themeTokenColors, INJECTED_RULE_PREFIX);

/**
 * Filters an array of TextMate rules, removing those whose name starts with the
 * injection prefix. Used to remove previously injected Hypatia-specific token
 * rules.
 * @param {Array<any> | undefined} rules - Array of TextMate rules.
 * @returns {Array<any>} New filtered array without injected rules.
 */
const stripInjectedRules = (rules) =>
  cfg.stripRulesWithNamePrefix(rules, INJECTED_RULE_PREFIX);

/**
 * Checks if an array of TextMate rules contains at least one rule whose name
 * starts with the injection prefix. Used to detect if Hypatia-specific token
 * rules are already present.
 * @param {Array<any> | undefined} rules - Array of TextMate rules.
 * @returns {boolean} True if at least one injected rule is found.
 */
const hasInjectedRules = (rules) =>
  cfg.hasRulesWithNamePrefix(rules, INJECTED_RULE_PREFIX);

/*----------------------------------------------------------------------------*/

/**
 * Sets the main VSCode workbench theme.
 * @param {string} themeLabel - Label of the theme to set.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {vscode.ConfigurationTarget} target - Configuration target.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 */
async function setWorkbenchTheme(themeLabel, switchingRef, target, scope) {
  const wb = cfg.cfg("workbench", scope);
  const current = wb.get("colorTheme");
  if (!current || current === themeLabel) return;
  await cfg.updateSetting("workbench", "colorTheme", themeLabel, { switchingRef, target, scope });
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

  const scopeK = stableScopeKey(scope);

  const isEnabled = getAutoThemeEnabled(scope);
  const appliedLabel = gsGet(context, STATE.autotheme.appliedThemeLabel);
  const appliedScope = gsGet(context, STATE.autotheme.appliedScope);
  if (!isEnabled) {
    if (appliedLabel && appliedScope === scopeK) {
      await gsSet(context, STATE.autotheme.appliedThemeLabel, undefined);
      await gsSet(context, STATE.autotheme.appliedScope, undefined);
      trace?.line(`AutoTheme: disabled, cleared applied state in scope ${ scope || 'global' }`);
    }
    return;
  }

  const wb = cfg.cfg("workbench", scope);
  const currentVscodeTheme = wb.get("colorTheme");
  const desiredVariant = resolveVariant(scope);
  const desiredThemeLabel = themeLabelForVariant(desiredVariant);
  if (currentVscodeTheme === desiredThemeLabel) {
    if (appliedLabel !== desiredThemeLabel || appliedScope !== scopeK) {
      await gsSet(context, STATE.autotheme.appliedThemeLabel, desiredThemeLabel);
      await gsSet(context, STATE.autotheme.appliedScope, scopeK);
      if (!gsGet(context, STATE.autotheme.applied, false)) {
        await gsSet(context, STATE.autotheme.applied, true);
        const target = cfg.pickTargetForKey("workbench", "colorTheme", scope);
        await gsSet(context, STATE.autotheme.target, cfg.serialiseTarget(target));
      }
      trace?.line(`AutoTheme: theme ${ desiredThemeLabel } already active in VSCode, synced local state in scope ${ scope || 'global' }`);
    }
    return;
  }

  if (appliedLabel === desiredThemeLabel && appliedScope === scopeK) {
    trace?.line(`AutoTheme: internal state says '${ desiredThemeLabel }' was applied in scope ${ scope || 'global' }, but VSCode shows '${ currentVscodeTheme }'. Will re-apply '${ desiredThemeLabel }'.`);
  }

  const currentIsHypatia = currentVscodeTheme === THEME_LABEL_DARK || currentVscodeTheme === THEME_LABEL_LIGHT;
  const storedTarget = cfg.parseTarget(gsGet(context, STATE.autotheme.target));
  const target = storedTarget ?? cfg.pickTargetForKey("workbench", "colorTheme", scope);
  if (!currentIsHypatia) {
    await gsSet(context, STATE.autotheme.savedTheme, currentVscodeTheme);
    await setWorkbenchTheme(desiredThemeLabel, switchingRef, target, scope);
    await gsSet(context, STATE.autotheme.applied, true);
    await gsSet(context, STATE.autotheme.target, cfg.serialiseTarget(target));
    await gsSet(context, STATE.autotheme.appliedThemeLabel, desiredThemeLabel);
    await gsSet(context, STATE.autotheme.appliedScope, scopeK);
    trace?.line(`AutoTheme: switched to ${ desiredThemeLabel } in scope ${ scope || 'global' } (saved ${ currentVscodeTheme })`);
    return;
  }

  await setWorkbenchTheme(desiredThemeLabel, switchingRef, target, scope);
  await gsSet(context, STATE.autotheme.appliedThemeLabel, desiredThemeLabel);
  await gsSet(context, STATE.autotheme.appliedScope, scopeK);
  trace?.line(`AutoTheme: adjusted to ${ desiredThemeLabel } in scope ${ scope || 'global' }`);
  if (!storedTarget && gsGet(context, STATE.autotheme.applied, false) === true) {
    await gsSet(context, STATE.autotheme.target, cfg.serialiseTarget(target));
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

  const scopeK = stableScopeKey(scope);

  const autoApplied = gsGet(context, STATE.autotheme.applied, false) === true;
  if (!autoApplied) {
    const appliedLabel = gsGet(context, STATE.autotheme.appliedThemeLabel);
    const appliedScope = gsGet(context, STATE.autotheme.appliedScope);
    if (appliedLabel && appliedScope === scopeK) {
      await gsSet(context, STATE.autotheme.appliedThemeLabel, undefined);
      await gsSet(context, STATE.autotheme.appliedScope, undefined);
      trace?.line(`AutoTheme: not marked as auto-applied, cleared local state for scope ${ scope || 'global' }`);
    }
    return;
  }

  const appliedLabel = gsGet(context, STATE.autotheme.appliedThemeLabel);
  const appliedScope = gsGet(context, STATE.autotheme.appliedScope);
  if (appliedLabel === undefined || appliedScope !== scopeK) {
    trace?.line(`AutoTheme: nothing to restore in scope ${ scope || 'global' }`);
    if (appliedScope === scopeK) {
      await gsSet(context, STATE.autotheme.appliedThemeLabel, undefined);
      await gsSet(context, STATE.autotheme.appliedScope, undefined);
    }
    return;
  }

  const wb = cfg.cfg("workbench", scope);
  const currentVscodeTheme = wb.get("colorTheme");
  const savedTheme = gsGet(context, STATE.autotheme.savedTheme);
  const target =
    cfg.parseTarget(gsGet(context, STATE.autotheme.target)) ??
    cfg.pickTargetForKey("workbench", "colorTheme", scope);

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
    await gsSet(context, STATE.autotheme.appliedThemeLabel, undefined);
    await gsSet(context, STATE.autotheme.appliedScope, undefined);
    await gsSet(context, STATE.autotheme.applied, false);
    await gsSet(context, STATE.autotheme.savedTheme, undefined);
    await gsSet(context, STATE.autotheme.target, undefined);
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

  const scopeK = stableScopeKey(scope);

  const variant = resolveVariant(scope);
  const editorCfg = cfg.cfg("editor", scope);
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = cfg.asPlainObject(rawCurrent, undefined);
  const injectedPresent = !!(current && hasInjectedRules(current.textMateRules));
  const autoApplied = gsGet(context, STATE.autotokens.applied, false) === true;
  const appliedVariant = gsGet(context, STATE.autotokens.appliedVariant);
  const appliedScope = gsGet(context, STATE.autotokens.appliedScope);
  if (autoApplied && appliedVariant === variant && appliedScope === scopeK && injectedPresent) {
    trace?.line(`AutoTokens: no change needed for variant '${ variant }' in scope ${ scope || 'global' }`);
    return;
  }

  const baseRules = stripInjectedRules(current?.textMateRules) ?? [];
  const base = Object.assign({}, current ?? {}, { textMateRules: baseRules });
  if (!autoApplied) {
    const saved = current ? Object.assign({}, current, { textMateRules: baseRules }) : undefined;
    await gsSet(context, STATE.autotokens.savedCustomisations, saved);
  }

  const storedTarget = cfg.parseTarget(gsGet(context, STATE.autotokens.target));
  const target = storedTarget ?? cfg.pickTargetForKey("editor", "tokenColorCustomizations", scope);
  const themeTokenColors = await readTokenColorsFromThemeFile(context, variant, trace);
  const injectedRules = buildInjectedRules(themeTokenColors);
  const next = Object.assign({}, base, { textMateRules: [...baseRules, ...injectedRules] });

  await cfg.updateSetting("editor", "tokenColorCustomizations", next, { switchingRef, target, scope });
  await gsSet(context, STATE.autotokens.applied, true);
  if (!storedTarget) await gsSet(context, STATE.autotokens.target, cfg.serialiseTarget(target));
  await gsSet(context, STATE.autotokens.lastVariant, variant);
  await gsSet(context, STATE.autotokens.appliedVariant, variant);
  await gsSet(context, STATE.autotokens.appliedScope, scopeK);
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

  const scopeK = stableScopeKey(scope);

  const editorCfg = cfg.cfg("editor", scope);
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = cfg.asPlainObject(rawCurrent, undefined);
  const storedTarget = cfg.parseTarget(gsGet(context, STATE.autotokens.target));
  const target = storedTarget ?? cfg.pickTargetForKey("editor", "tokenColorCustomizations", scope);
  const autoApplied = gsGet(context, STATE.autotokens.applied, false) === true;
  if (!autoApplied) {
    if (current && hasInjectedRules(current.textMateRules)) {
      const baseRules = stripInjectedRules(current.textMateRules) ?? [];
      const cleaned = Object.assign({}, current, { textMateRules: baseRules });
      await cfg.updateSetting("editor", "tokenColorCustomizations", cleaned, { switchingRef, target, scope });
      trace?.line(`AutoTokens: cleaned injected rules (not marked as auto-applied) in scope ${ scope || 'global' }`);
    }
    const appliedScope = gsGet(context, STATE.autotokens.appliedScope);
    if (appliedScope === scopeK) {
      await gsSet(context, STATE.autotokens.appliedVariant, undefined);
      await gsSet(context, STATE.autotokens.appliedScope, undefined);
    }
    await gsSet(context, STATE.autotokens.applied, false);
    await gsSet(context, STATE.autotokens.savedCustomisations, undefined);
    await gsSet(context, STATE.autotokens.target, undefined);
    return;
  }

  const appliedVariant = gsGet(context, STATE.autotokens.appliedVariant);
  const appliedScope = gsGet(context, STATE.autotokens.appliedScope);
  if (appliedVariant === undefined || appliedScope !== scopeK) {
    trace?.line(`AutoTokens: nothing to restore in scope ${ scope || 'global' }`);
    if (appliedScope === scopeK) {
      await gsSet(context, STATE.autotokens.appliedVariant, undefined);
      await gsSet(context, STATE.autotokens.appliedScope, undefined);
      await gsSet(context, STATE.autotokens.applied, false);
      await gsSet(context, STATE.autotokens.savedCustomisations, undefined);
      await gsSet(context, STATE.autotokens.target, undefined);
    }
    return;
  }

  if (current && !hasInjectedRules(current.textMateRules)) {
    trace?.line(`AutoTokens: current customisations do not contain injected rules; not restoring in scope ${ scope || 'global' }`);
  } else {
    const saved = gsGet(context, STATE.autotokens.savedCustomisations);
    const restored =
      saved && typeof saved === "object"
        ? Object.assign({}, saved, { textMateRules: stripInjectedRules(saved.textMateRules) })
        : saved;

    await cfg.updateSetting("editor", "tokenColorCustomizations", restored ?? undefined, { switchingRef, target, scope });
    trace?.line(`AutoTokens: restored in scope ${ scope || 'global' }`);
  }

  await gsSet(context, STATE.autotokens.appliedVariant, undefined);
  await gsSet(context, STATE.autotokens.appliedScope, undefined);
  await gsSet(context, STATE.autotokens.applied, false);
  await gsSet(context, STATE.autotokens.savedCustomisations, undefined);
  await gsSet(context, STATE.autotokens.target, undefined);
  await gsSet(context, STATE.autotokens.lastVariant, undefined);

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

  const scopeK = stableScopeKey(scope);

  const mode = getSemanticMode(scope);
  if (mode === "inherit") {
    await restoreSemanticOverride(context, switchingRef, trace, scope);
    return;
  }

  const desired = mode === "on";
  const editorCfg = cfg.cfg("editor", scope);
  const storedTarget = cfg.parseTarget(gsGet(context, STATE.semantic.target));
  const target = storedTarget ?? cfg.pickTargetForKey("editor", "semanticHighlighting.enabled", scope);
  const inspected = cfg.inspectKey("editor", "semanticHighlighting.enabled", scope);
  const valueInTarget = cfg.valueAtTarget(inspected, target);
  const autoApplied = gsGet(context, STATE.semantic.applied, false) === true;
  const appliedValue = gsGet(context, STATE.semantic.appliedValue);
  const appliedScope = gsGet(context, STATE.semantic.appliedScope);
  if (autoApplied && appliedValue === desired && appliedScope === scopeK && valueInTarget === desired) {
    trace?.line(`Semantic: no change needed for value '${ desired }' in scope ${ scope || 'global' }`);
    return;
  }
  if (!autoApplied && editorCfg.get("semanticHighlighting.enabled") === desired) return;
  if (!autoApplied) {
    await gsSet(context, STATE.semantic.savedEnabled, valueInTarget);
  } else {
    const lastDesired = gsGet(context, STATE.semantic.lastDesired);
    if (typeof lastDesired === "boolean" && valueInTarget !== lastDesired) {
      await gsSet(context, STATE.semantic.savedEnabled, valueInTarget);
    }
  }

  await cfg.updateSetting("editor", "semanticHighlighting.enabled", desired, { switchingRef, target, scope });
  await gsSet(context, STATE.semantic.lastDesired, desired);
  await gsSet(context, STATE.semantic.appliedValue, desired);
  await gsSet(context, STATE.semantic.appliedScope, scopeK);
  if (!autoApplied) await gsSet(context, STATE.semantic.applied, true);
  if (!storedTarget) await gsSet(context, STATE.semantic.target, cfg.serialiseTarget(target));
  trace?.line(`Semantic: forced ${ desired ? `"on"` : `"off"` } in scope ${ scope || 'global' }`);

}

/**
 * Restores the previous semantic highlighting if it was applied automatically.
 * @param {vscode.ExtensionContext} context - Extension context.
 * @param {{value: boolean}} switchingRef - Reference for update status.
 * @param {Object | undefined} trace - Tracer object for logging.
 * @param {vscode.ConfigurationScope | null | undefined} scope - Optional scope.
 */
async function restoreSemanticOverride(context, switchingRef, trace, scope) {

  const scopeK = stableScopeKey(scope);

  const autoApplied = gsGet(context, STATE.semantic.applied, false) === true;
  if (!autoApplied) {
    const appliedScope = gsGet(context, STATE.semantic.appliedScope);
    if (appliedScope === scopeK) {
      await gsSet(context, STATE.semantic.appliedValue, undefined);
      await gsSet(context, STATE.semantic.appliedScope, undefined);
    }
    await gsSet(context, STATE.semantic.applied, false);
    await gsSet(context, STATE.semantic.savedEnabled, undefined);
    await gsSet(context, STATE.semantic.target, undefined);
    await gsSet(context, STATE.semantic.lastDesired, undefined);
    return;
  }

  const appliedValue = gsGet(context, STATE.semantic.appliedValue);
  const appliedScope = gsGet(context, STATE.semantic.appliedScope);
  if (appliedValue === undefined || appliedScope !== scopeK) {
    trace?.line(`Semantic: nothing to restore in scope ${ scope || 'global' }`);
    if (appliedScope === scopeK) {
      await gsSet(context, STATE.semantic.appliedValue, undefined);
      await gsSet(context, STATE.semantic.appliedScope, undefined);
    }
    return;
  }

  const saved = gsGet(context, STATE.semantic.savedEnabled);
  const target =
    cfg.parseTarget(gsGet(context, STATE.semantic.target)) ??
    cfg.pickTargetForKey("editor", "semanticHighlighting.enabled", scope);

  try {
    await cfg.updateSetting("editor", "semanticHighlighting.enabled", saved ?? undefined, { switchingRef, target, scope });
    trace?.line(`Semantic: restored in scope ${ scope || 'global' }`);
  } finally {
    await gsSet(context, STATE.semantic.appliedValue, undefined);
    await gsSet(context, STATE.semantic.appliedScope, undefined);
    await gsSet(context, STATE.semantic.applied, false);
    await gsSet(context, STATE.semantic.savedEnabled, undefined);
    await gsSet(context, STATE.semantic.target, undefined);
    await gsSet(context, STATE.semantic.lastDesired, undefined);
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
 */
async function reconcile(context, editor, switchingRef, lastWasHypatiaRef, reasonsRef, leaveCtl, trace) {

  if (switchingRef.value) return;

  // Snapshot and reset reasons for this reconciliation cycle.
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
  const anyHypVisible = window.visibleTextEditors.some(cfg.isHypatiaEditor);

  if (!editor || !editor.document) {
    if (!lastWasHyp) {
      leaveCtl?.disarm?.();
      return;
    }
    if (anyHypVisible) return;
    if (leaveCtl && !leaveCtl.armed) {
      leaveCtl.arm();
      trace?.line("Leaving Hypatia (arming): no active editor");
      return;
    }
    if (leaveCtl && !leaveCtl.confirmed) return;
    leaveCtl?.disarm?.();
    lastWasHypatiaRef.value = false;
    trace?.line("Leaving Hypatia: no active editor");
    await restoreTokenOverlay(context, switchingRef, trace, undefined);
    await restoreSemanticOverride(context, switchingRef, trace, undefined);
    await restoreWholeTheme(context, switchingRef, trace, undefined);
    return;
  }

  const scope = undefined;
  const isHyp = cfg.isHypatiaEditor(editor);

  if (isHyp) {
    leaveCtl?.disarm?.();
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

    // Apply whole theme based on autotheme setting and resolved variant
    if (getAutoThemeEnabled(scope)) await applyWholeTheme(context, switchingRef, trace, scope);
    else await restoreWholeTheme(context, switchingRef, trace, scope);

    // Apply token overlay based on autotokens setting and resolved variant
    if (!getAutoTokensEnabled(scope)) await restoreTokenOverlay(context, switchingRef, trace, scope);
    else await applyTokenOverlay(context, switchingRef, trace, scope);

    return;
  }

  if (!lastWasHyp) {
    leaveCtl?.disarm?.();
    lastWasHypatiaRef.value = false;
    return;
  }

  if (leaveCtl && !leaveCtl.armed) {
    leaveCtl.arm();
    trace?.line("Leaving Hypatia (arming)");
    return;
  }
  if (leaveCtl && !leaveCtl.confirmed) return;
  leaveCtl?.disarm?.();

  lastWasHypatiaRef.value = false;
  trace?.line("Leaving Hypatia");
  await restoreTokenOverlay(context, switchingRef, trace, scope);
  await restoreSemanticOverride(context, switchingRef, trace, scope);
  await restoreWholeTheme(context, switchingRef, trace, scope);

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
  const queue = cfg.createSerialQueue((err) => {
    try { trace.line(`Error: ${ String(err?.message ?? err) }`); } catch { }
    cfg.logError(err, "hypatia.style");
  });

  const leaveCtl = {
    armed: false,
    confirmed: false,
    timer: undefined,
    arm() {
      if (this.armed) return;
      this.armed = true;
      this.confirmed = false;
      this.timer = setTimeout(() => {
        this.confirmed = true;
        requestReconcile("editor");
      }, 75);
    },
    disarm() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      this.armed = false;
      this.confirmed = false;
    }
  };

  const disposables = [];

  const schedule = (fn) =>
    (typeof queueMicrotask === "function" ? queueMicrotask : (f) => Promise.resolve().then(f))(fn);

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
      queue.enqueue(() => reconcile(context, ed, switchingRef, lastWasHypatiaRef, reasonsRef, leaveCtl, trace));
    });
  };

  disposables.push(window.onDidChangeActiveTextEditor(() => requestReconcile("editor")));
  disposables.push(window.onDidChangeVisibleTextEditors(() => requestReconcile("editor")));
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

  return {
    dispose() {
      for (const d of disposables) { try { d.dispose(); } catch { } }
      leaveCtl.disarm();
      queue.enqueue(async () => {
        try {
          await restoreTokenOverlay(context, switchingRef, trace, undefined);
          await restoreSemanticOverride(context, switchingRef, trace, undefined);
          await restoreWholeTheme(context, switchingRef, trace, undefined);
        } catch (err) {
          cfg.logError(err, `${ CFG_ROOT }.dispose`);
        }
      });
    }
  };

}

/* End of file style.js */
