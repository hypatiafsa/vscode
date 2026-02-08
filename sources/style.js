
import * as vscode from "vscode";
import { readFile } from "node:fs/promises";

import cfg from "./utils.js";

const { workspace, window, ColorThemeKind, ConfigurationTarget } = vscode;

const CFG_ROOT = "hypatia.style";

const STYLE_CHANNEL = "Hypatia Style";

const THEME_LABEL_LIGHT = "Hypatia Light";
const THEME_FILE_LIGHT = "themes/hypatia-light.json";
const THEME_LABEL_DARK = "Hypatia Dark";
const THEME_FILE_DARK = "themes/hypatia-dark.json";

const KEY_STYLE_AUTOTHEME = `${ CFG_ROOT }.autotheme`;
const KEY_STYLE_AUTOTOKENS = `${ CFG_ROOT }.autotokens`;
const KEY_STYLE_SEMANTIC = `${ CFG_ROOT }.semantichighlighting`;
const KEY_STYLE_TRACE = `${ CFG_ROOT }.trace`;

const INJECTED_RULE_PREFIX = "__hypatia_autotokens__";

const STATE = {
  autotheme: {
    applied: `${ CFG_ROOT }.autotheme.applied`,
    savedTheme: `${ CFG_ROOT }.autotheme.savedWorkbenchTheme`,
    target: `${ CFG_ROOT }.autotheme.appliedTarget`
  },
  autotokens: {
    applied: `${ CFG_ROOT }.autotokens.applied`,
    savedCustomisations: `${ CFG_ROOT }.autotokens.savedTokenColorCustomizations`,
    target: `${ CFG_ROOT }.autotokens.appliedTarget`
  },
  semantic: {
    applied: `${ CFG_ROOT }.semantichighlighting.applied`,
    savedEnabled: `${ CFG_ROOT }.semantichighlighting.savedEditorSemanticHighlightingEnabled`,
    target: `${ CFG_ROOT }.semantichighlighting.appliedTarget`,
    lastDesired: `${ CFG_ROOT }.semantichighlighting.lastDesired`
  }
};

function makeTracer(context) {
  const ch = window.createOutputChannel(STYLE_CHANNEL);
  context.subscriptions.push(ch);
  const enabled = () => workspace.getConfiguration("hypatia").get("style.trace", false) === true;
  return {
    line(line) {
      if (!enabled()) return;
      ch.appendLine(`[style] ${ String(line) }`);
    },
  };
}

function styleCfg(scope) {
  return workspace.getConfiguration("hypatia", scope);
}

function getAutoThemeEnabled(scope) {
  return styleCfg(scope).get("style.autotheme", false) === true;
}

function getAutoTokensSetting(scope) {
  const raw = styleCfg(scope).get("style.autotokens", "auto");
  return cfg.normaliseEnum(String(raw ?? "auto"), ["off", "auto", "dark", "light"], "auto");
}
function currentThemeKindIsLight() {
  const kind = window.activeColorTheme.kind;
  return kind === ColorThemeKind.Light || kind === ColorThemeKind.HighContrastLight;
}
function chooseVariant(scope) {
  const mode = getAutoTokensSetting(scope);
  if (mode === "dark" || mode === "light") return mode;
  return currentThemeKindIsLight() ? "light" : "dark";
}
function themeLabelForVariant(variant) {
  return variant === "light" ? THEME_LABEL_LIGHT : THEME_LABEL_DARK;
}
function themeFileForVariant(variant) {
  return variant === "light" ? THEME_FILE_LIGHT : THEME_FILE_DARK;
}

function getSemanticMode(scope) {
  const raw = styleCfg(scope).get("style.semantichighlighting", "inherit");
  return cfg.normaliseEnum(String(raw ?? "inherit"), ["on", "off", "inherit"], "inherit");
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const _themeTokenColorsCache = new Map();

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
    trace?.line(`autotokens: failed reading ${ rel }`);
    cfg.logError(err, CFG_ROOT);
    _themeTokenColorsCache.set(variant, []);
    return [];
  }
}

function buildInjectedRules(themeTokenColors) {
  return themeTokenColors.map((r, i) => {
    const clone = Object.assign({}, r);
    clone.name = `${ INJECTED_RULE_PREFIX }:${ i }`;
    if (Array.isArray(clone.scope)) clone.scope = clone.scope.slice();
    if (clone.settings && typeof clone.settings === "object") clone.settings = Object.assign({}, clone.settings);
    return clone;
  });
}

function stripInjectedRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules.filter((r) => !(typeof r?.name === "string" && r.name.startsWith(INJECTED_RULE_PREFIX)));
}

function hasInjectedRules(rules) {
  if (!Array.isArray(rules)) return false;
  return rules.some((r) => typeof r?.name === "string" && r.name.startsWith(INJECTED_RULE_PREFIX));
}

const gsGet = (ctx, k, d) => ctx.globalState.get(k, d);
const gsSet = (ctx, k, v) => ctx.globalState.update(k, v);

function parseTarget(value) {
  return cfg.parseTarget(value);
}

async function updateSetting(section, key, value, switchingRef, target, scope) {
  await cfg.updateSetting(section, key, value, { scope, target, switchingRef });
}

function pickTargetForKey(section, key, scope) {
  return cfg.pickTargetForKey(section, key, scope);
}

async function setWorkbenchTheme(themeLabel, switchingRef, target, scope) {
  const wb = cfg.cfg("workbench", scope);
  const current = wb.get("colorTheme");
  if (!current || current === themeLabel) return;
  await updateSetting("workbench", "colorTheme", themeLabel, switchingRef, target, scope);
}

async function applyWholeTheme(context, switchingRef, trace, scope) {
  const wb = cfg.cfg("workbench", scope);
  const current = wb.get("colorTheme");
  if (typeof current !== "string" || current.length === 0) return;
  const desired = themeLabelForVariant(currentThemeKindIsLight() ? "light" : "dark");
  const currentIsHypatia = current === THEME_LABEL_DARK || current === THEME_LABEL_LIGHT;
  const autoApplied = gsGet(context, STATE.autotheme.applied, false) === true;
  const storedTarget = parseTarget(gsGet(context, STATE.autotheme.target));
  const target = storedTarget ?? pickTargetForKey("workbench", "colorTheme", scope);
  if (!currentIsHypatia) {
    await gsSet(context, STATE.autotheme.savedTheme, current);
    await setWorkbenchTheme(desired, switchingRef, target, scope);
    await gsSet(context, STATE.autotheme.applied, true);
    await gsSet(context, STATE.autotheme.target, cfg.serialiseTarget(target));
    trace?.line(`autotheme: switched to ${ desired } (saved ${ current })`);
    return;
  }
  if (current !== desired) {
    await setWorkbenchTheme(desired, switchingRef, target, scope);
    trace?.line(`autotheme: adjusted to ${ desired }`);
  }
  if (!autoApplied) return;
  if (!storedTarget) await gsSet(context, STATE.autotheme.target, cfg.serialiseTarget(target));
}

async function restoreWholeTheme(context, switchingRef, trace, scope) {
  const autoApplied = gsGet(context, STATE.autotheme.applied, false) === true;
  if (!autoApplied) return;
  const wb = cfg.cfg("workbench", scope);
  const current = wb.get("colorTheme");
  const saved = gsGet(context, STATE.autotheme.savedTheme);
  const target = parseTarget(gsGet(context, STATE.autotheme.target)) ?? pickTargetForKey("workbench", "colorTheme", scope);
  try {
    if (
      typeof current === "string" &&
      (current === THEME_LABEL_DARK || current === THEME_LABEL_LIGHT) &&
      typeof saved === "string" &&
      saved.length > 0
    ) {
      await setWorkbenchTheme(saved, switchingRef, target, scope);
      trace?.line(`autotheme: restored ${ saved }`);
    }
  } finally {
    await gsSet(context, STATE.autotheme.applied, false);
    await gsSet(context, STATE.autotheme.savedTheme, undefined);
    await gsSet(context, STATE.autotheme.target, undefined);
  }
}

async function applyTokenOverlay(context, switchingRef, trace, scope) {
  const editorCfg = cfg.cfg("editor", scope);
  const variant = chooseVariant(scope);
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = rawCurrent && typeof rawCurrent === "object" ? rawCurrent : {};
  const baseRules = stripInjectedRules(current.textMateRules);
  const base = Object.assign({}, current, { textMateRules: baseRules });
  const autoApplied = gsGet(context, STATE.autotokens.applied, false) === true;
  const storedTarget = parseTarget(gsGet(context, STATE.autotokens.target));
  const target = storedTarget ?? pickTargetForKey("editor", "tokenColorCustomizations", scope);
  await gsSet(context, STATE.autotokens.savedCustomisations, cloneJson(base));
  const themeTokenColors = await readTokenColorsFromThemeFile(context, variant, trace);
  const injectedRules = buildInjectedRules(themeTokenColors);
  const next = Object.assign({}, base, { textMateRules: [...baseRules, ...injectedRules] });
  await updateSetting("editor", "tokenColorCustomizations", next, switchingRef, target, scope);
  if (!autoApplied) {
    await gsSet(context, STATE.autotokens.applied, true);
    await gsSet(context, STATE.autotokens.target, cfg.serialiseTarget(target));
  } else if (!storedTarget) {
    await gsSet(context, STATE.autotokens.target, cfg.serialiseTarget(target));
  }
  trace?.line(`autotokens: applied (${ variant })`);
}

async function restoreTokenOverlay(context, switchingRef, trace, scope) {
  const editorCfg = cfg.cfg("editor", scope);
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = rawCurrent && typeof rawCurrent === "object" ? rawCurrent : {};
  const hadInjected = hasInjectedRules(current.textMateRules);
  const autoApplied = gsGet(context, STATE.autotokens.applied, false) === true;
  const saved = gsGet(context, STATE.autotokens.savedCustomisations);
  const target =
    parseTarget(gsGet(context, STATE.autotokens.target)) ??
    pickTargetForKey("editor", "tokenColorCustomizations", scope);
  let valueToRestore;
  if (autoApplied) valueToRestore = saved ?? undefined;
  else if (hadInjected) valueToRestore = Object.assign({}, current, { textMateRules: stripInjectedRules(current.textMateRules) });
  else return;
  try {
    await updateSetting("editor", "tokenColorCustomizations", valueToRestore, switchingRef, target, scope);
    trace?.line("autotokens: restored");
  } finally {
    if (autoApplied) {
      await gsSet(context, STATE.autotokens.applied, false);
      await gsSet(context, STATE.autotokens.savedCustomisations, undefined);
      await gsSet(context, STATE.autotokens.target, undefined);
    }
  }
}

async function applySemanticOverride(context, switchingRef, trace, scope) {
  const mode = getSemanticMode(scope);
  if (mode === "inherit") return;
  const desired = mode === "on";
  const editorCfg = cfg.cfg("editor", scope);
  const storedTarget = parseTarget(gsGet(context, STATE.semantic.target));
  const target = storedTarget ?? pickTargetForKey("editor", "semanticHighlighting.enabled", scope);
  const inspected = cfg.inspectKey("editor", "semanticHighlighting.enabled", scope);
  const valueInTarget =
    target === ConfigurationTarget.WorkspaceFolder ? inspected?.workspaceFolderValue :
      target === ConfigurationTarget.Workspace ? inspected?.workspaceValue :
        inspected?.globalValue;
  const autoApplied = gsGet(context, STATE.semantic.applied, false) === true;
  if (!autoApplied) {
    if (editorCfg.get("semanticHighlighting.enabled") === desired) return;
    await gsSet(context, STATE.semantic.savedEnabled, valueInTarget);
  } else {
    const lastDesired = gsGet(context, STATE.semantic.lastDesired);
    if (typeof lastDesired === "boolean" && valueInTarget !== lastDesired) {
      await gsSet(context, STATE.semantic.savedEnabled, valueInTarget);
    }
  }
  await updateSetting("editor", "semanticHighlighting.enabled", desired, switchingRef, target, scope);
  await gsSet(context, STATE.semantic.lastDesired, desired);
  if (!autoApplied) await gsSet(context, STATE.semantic.applied, true);
  if (!storedTarget) await gsSet(context, STATE.semantic.target, cfg.serialiseTarget(target));
  trace?.line(`semantic: forced ${ desired ? "on" : "off" }`);
}

async function restoreSemanticOverride(context, switchingRef, trace, scope) {
  const autoApplied = gsGet(context, STATE.semantic.applied, false) === true;
  if (!autoApplied) return;
  const saved = gsGet(context, STATE.semantic.savedEnabled);
  const target =
    parseTarget(gsGet(context, STATE.semantic.target)) ??
    pickTargetForKey("editor", "semanticHighlighting.enabled", scope);
  try {
    await updateSetting("editor", "semanticHighlighting.enabled", saved ?? undefined, switchingRef, target, scope);
    trace?.line("semantic: restored");
  } finally {
    await gsSet(context, STATE.semantic.applied, false);
    await gsSet(context, STATE.semantic.savedEnabled, undefined);
    await gsSet(context, STATE.semantic.target, undefined);
    await gsSet(context, STATE.semantic.lastDesired, undefined);
  }
}

async function reconcile(context, editor, switchingRef, lastWasHypatiaRef, trace) {
  if (switchingRef.value) return;
  const lastWasHyp = lastWasHypatiaRef.value;
  if (!editor || !editor.document) {
    if (lastWasHyp) {
      lastWasHypatiaRef.value = false;
      trace?.line("leave hypatia: no active editor");
      await restoreTokenOverlay(context, switchingRef, trace, undefined);
      await restoreSemanticOverride(context, switchingRef, trace, undefined);
      await restoreWholeTheme(context, switchingRef, trace, undefined);
    }
    return;
  }
  const scope = undefined;
  const isHyp = cfg.isHypatiaEditor(editor);
  if (isHyp) {
    if (!lastWasHyp) trace?.line("enter hypatia");
    lastWasHypatiaRef.value = true;
    const semanticMode = getSemanticMode(scope);
    if (semanticMode === "inherit") await restoreSemanticOverride(context, switchingRef, trace, scope);
    else await applySemanticOverride(context, switchingRef, trace, scope);
    const autoTheme = getAutoThemeEnabled(scope);
    if (autoTheme) {
      // When autotheme is ON, rely on the Hypatia theme itself for token colours.
      await applyWholeTheme(context, switchingRef, trace, scope);
      await restoreTokenOverlay(context, switchingRef, trace, scope);
    } else {
      await restoreWholeTheme(context, switchingRef, trace, scope);
      const autoTokens = getAutoTokensSetting(scope);
      if (autoTokens === "off") await restoreTokenOverlay(context, switchingRef, trace, scope);
      else await applyTokenOverlay(context, switchingRef, trace, scope);
    }
    return;
  }
  lastWasHypatiaRef.value = false;
  if (lastWasHyp) {
    trace?.line("leave hypatia");
    await restoreTokenOverlay(context, switchingRef, trace, scope);
    await restoreSemanticOverride(context, switchingRef, trace, scope);
    await restoreWholeTheme(context, switchingRef, trace, scope);
  }
}

export function activateStyle(context) {
  const switchingRef = { value: false };
  const lastWasHypatiaRef = { value: false };
  const trace = makeTracer(context);
  const queue = cfg.createSerialQueue((err) => {
    try { trace.line(`error: ${ String(err?.message ?? err) }`); } catch { }
    cfg.logError(err, CFG_ROOT);
  });
  const disposables = [];
  const enqueueReconcile = () => {
    const ed = window.activeTextEditor;
    queue.enqueue(() => reconcile(context, ed, switchingRef, lastWasHypatiaRef, trace));
  };
  disposables.push(window.onDidChangeActiveTextEditor(() => enqueueReconcile()));
  disposables.push(window.onDidChangeActiveColorTheme(() => {
    const ed = window.activeTextEditor;
    if (!ed || !cfg.isHypatiaEditor(ed)) return;
    enqueueReconcile();
  }));
  disposables.push(workspace.onDidChangeConfiguration((e) => {
    if (switchingRef.value) return;
    const relevant =
      e.affectsConfiguration(KEY_STYLE_AUTOTOKENS) ||
      e.affectsConfiguration(KEY_STYLE_AUTOTHEME) ||
      e.affectsConfiguration(KEY_STYLE_SEMANTIC) ||
      e.affectsConfiguration(KEY_STYLE_TRACE) ||
      e.affectsConfiguration("editor.tokenColorCustomizations") ||
      e.affectsConfiguration("editor.semanticHighlighting.enabled") ||
      e.affectsConfiguration("workbench.colorTheme");
    if (relevant) enqueueReconcile();
  }));
  enqueueReconcile();
  return {
    dispose() {
      for (const d of disposables) {
        try { d.dispose(); } catch { }
      }
      queue.enqueue(async () => {
        try {
          await restoreTokenOverlay(context, switchingRef, trace, undefined);
          await restoreSemanticOverride(context, switchingRef, trace, undefined);
          await restoreWholeTheme(context, switchingRef, trace, undefined);
        } catch (err) {
          cfg.logError(err, `${ CFG_ROOT }.dispose`);
        }
      });
    },
  };
}
