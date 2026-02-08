
import { workspace, window, ColorThemeKind, ConfigurationTarget } from "vscode";
import { readFile } from "node:fs/promises";

import Utils from "./utils.js";

const CFG_ROOT = "hypatia.style";

const STYLE_CHANNEL = "Hypatia Style";

const THEME_LABEL_LIGHT = "Hypatia Light";
const THEME_FILE_LIGHT = "themes/hypatia-light.json";
const THEME_LABEL_DARK = "Hypatia Dark";
const THEME_FILE_DARK = "themes/hypatia-dark.json";

const KEY_STYLE_AUTOTHEME = `${ CFG_ROOT }.autotheme`;
const KEY_STYLE_AUTOTOKENS = `${ CFG_ROOT }.autotokens`;
const KEY_STYLE_SEMANTIC = `${ CFG_ROOT }.semantichighlighting`;

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
    target: `${ CFG_ROOT }.autotokens.appliedTarget`,
    lastVariant: `${ CFG_ROOT }.autotokens.lastVariant`
  },
  semantic: {
    applied: `${ CFG_ROOT }.semantichighlighting.applied`,
    savedEnabled: `${ CFG_ROOT }.semantichighlighting.savedEditorSemanticHighlightingEnabled`,
    target: `${ CFG_ROOT }.semantichighlighting.appliedTarget`,
    lastDesired: `${ CFG_ROOT }.semantichighlighting.lastDesired`
  }
};

const hypCfg = (scope) => Utils.cfg.cfg("hypatia", scope);

const gsGet = (ctx, k, d) => ctx.globalState.get(k, d);
const gsSet = (ctx, k, v) => ctx.globalState.update(k, v);

function getAutoThemeEnabled(scope) {
  return hypCfg(scope).get("style.autotheme", false) === true;
}

function getAutoTokensSetting(scope) {
  const raw = hypCfg(scope).get("style.autotokens", "auto");
  return Utils.util.normaliseEnum(String(raw ?? "auto"), ["off", "auto", "dark", "light"], "auto");
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
  const raw = hypCfg(scope).get("style.semantichighlighting", "inherit");
  return Utils.util.normaliseEnum(String(raw ?? "inherit"), ["on", "off", "inherit"], "inherit");
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
    Utils.out.logError(err, "hypatia.style");
    _themeTokenColorsCache.set(variant, []);
    return [];
  }
}

function buildInjectedRules(themeTokenColors) {
  return themeTokenColors.map((r, i) => {
    const clone = Object.assign({}, r);
    clone.name = `${ INJECTED_RULE_PREFIX }:${ i }`;
    if (Array.isArray(clone.scope)) clone.scope = clone.scope.slice();
    if (clone.settings && typeof clone.settings === "object") {
      clone.settings = Object.assign({}, clone.settings);
    }
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

function valueAtTarget(inspected, target) {
  if (!inspected) return undefined;
  if (target === ConfigurationTarget.WorkspaceFolder) return inspected.workspaceFolderValue;
  if (target === ConfigurationTarget.Workspace) return inspected.workspaceValue;
  return inspected.globalValue;
}

async function update(section, key, value, switchingRef, target, scope) {
  await Utils.cfg.updateSetting(section, key, value, { switchingRef, target, scope });
}

async function setWorkbenchTheme(themeLabel, switchingRef, target, scope) {
  const wb = Utils.cfg.cfg("workbench", scope);
  const current = wb.get("colorTheme");
  if (!current || current === themeLabel) return;
  await update("workbench", "colorTheme", themeLabel, switchingRef, target, scope);
}

async function applyWholeTheme(context, switchingRef, trace, scope) {
  if (!getAutoThemeEnabled(scope)) return;
  const wb = Utils.cfg.cfg("workbench", scope);
  const current = wb.get("colorTheme");
  if (typeof current !== "string" || current.length === 0) return;
  const desired = themeLabelForVariant(currentThemeKindIsLight() ? "light" : "dark");
  const currentIsHypatia = current === THEME_LABEL_DARK || current === THEME_LABEL_LIGHT;
  const storedTarget = Utils.cfg.parseTarget(gsGet(context, STATE.autotheme.target));
  const target = storedTarget ?? Utils.cfg.pickTargetForKey("workbench", "colorTheme", scope);
  if (!currentIsHypatia) {
    await gsSet(context, STATE.autotheme.savedTheme, current);
    await setWorkbenchTheme(desired, switchingRef, target, scope);
    await gsSet(context, STATE.autotheme.applied, true);
    await gsSet(context, STATE.autotheme.target, Utils.cfg.serialiseTarget(target));
    trace?.line(`autotheme: switched to ${ desired } (saved ${ current })`);
    return;
  }
  if (current !== desired) {
    await setWorkbenchTheme(desired, switchingRef, target, scope);
    trace?.line(`autotheme: adjusted to ${ desired }`);
  }
  if (!storedTarget && gsGet(context, STATE.autotheme.applied, false) === true) {
    await gsSet(context, STATE.autotheme.target, Utils.cfg.serialiseTarget(target));
  }
}

async function restoreWholeTheme(context, switchingRef, trace, scope) {
  const autoApplied = gsGet(context, STATE.autotheme.applied, false) === true;
  if (!autoApplied) return;
  const wb = Utils.cfg.cfg("workbench", scope);
  const current = wb.get("colorTheme");
  const saved = gsGet(context, STATE.autotheme.savedTheme);
  const target =
    Utils.cfg.parseTarget(gsGet(context, STATE.autotheme.target)) ??
    Utils.cfg.pickTargetForKey("workbench", "colorTheme", scope);
  try {
    if (
      typeof current === "string" &&
      (current === THEME_LABEL_DARK || current === THEME_LABEL_LIGHT) &&
      typeof saved === "string" && saved.length > 0
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
  const variant = chooseVariant(scope);
  const themeTokenColors = await readTokenColorsFromThemeFile(context, variant, trace);
  const injectedRules = buildInjectedRules(themeTokenColors);
  const editorCfg = Utils.cfg.cfg("editor", scope);
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = rawCurrent && typeof rawCurrent === "object" ? rawCurrent : {};
  const baseRules = stripInjectedRules(current.textMateRules);
  const base = Object.assign({}, current, { textMateRules: baseRules });
  const storedTarget = Utils.cfg.parseTarget(gsGet(context, STATE.autotokens.target));
  const target = storedTarget ?? Utils.cfg.pickTargetForKey("editor", "tokenColorCustomizations", scope);
  await gsSet(context, STATE.autotokens.savedCustomisations, Utils.json.clone(base));
  const next = Object.assign({}, base, { textMateRules: [...baseRules, ...injectedRules] });
  if (!Utils.json.stableEquals(current, next)) {
    await update("editor", "tokenColorCustomizations", next, switchingRef, target, scope);
    trace?.line(`autotokens: applied overlay (${ variant })`);
  }
  if (gsGet(context, STATE.autotokens.applied, false) !== true) {
    await gsSet(context, STATE.autotokens.applied, true);
  }
  if (!storedTarget) await gsSet(context, STATE.autotokens.target, Utils.cfg.serialiseTarget(target));
  await gsSet(context, STATE.autotokens.lastVariant, variant);
}

async function restoreTokenOverlay(context, switchingRef, trace, scope) {
  const editorCfg = Utils.cfg.cfg("editor", scope);
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = rawCurrent && typeof rawCurrent === "object" ? rawCurrent : {};
  const hadInjected = hasInjectedRules(current.textMateRules);
  const autoApplied = gsGet(context, STATE.autotokens.applied, false) === true;
  const saved = gsGet(context, STATE.autotokens.savedCustomisations);
  const target =
    Utils.cfg.parseTarget(gsGet(context, STATE.autotokens.target)) ??
    Utils.cfg.pickTargetForKey("editor", "tokenColorCustomizations", scope);
  let valueToRestore;
  if (autoApplied) valueToRestore = saved ?? undefined;
  else if (hadInjected) valueToRestore = Object.assign({}, current, { textMateRules: stripInjectedRules(current.textMateRules) });
  else return;
  try {
    await update("editor", "tokenColorCustomizations", valueToRestore, switchingRef, target, scope);
    trace?.line("autotokens: restored");
  } finally {
    if (autoApplied) {
      await gsSet(context, STATE.autotokens.applied, false);
      await gsSet(context, STATE.autotokens.savedCustomisations, undefined);
      await gsSet(context, STATE.autotokens.target, undefined);
      await gsSet(context, STATE.autotokens.lastVariant, undefined);
    }
  }
}

async function applySemanticOverride(context, switchingRef, trace, scope) {
  const mode = getSemanticMode(scope);
  if (mode === "inherit") return;
  const desired = mode === "on";
  const editorCfg = Utils.cfg.cfg("editor", scope);
  const storedTarget = Utils.cfg.parseTarget(gsGet(context, STATE.semantic.target));
  const target = storedTarget ?? Utils.cfg.pickTargetForKey("editor", "semanticHighlighting.enabled", scope);
  const inspected = Utils.cfg.inspectKey("editor", "semanticHighlighting.enabled", scope);
  const valueInTarget = valueAtTarget(inspected, target);
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
  await update("editor", "semanticHighlighting.enabled", desired, switchingRef, target, scope);
  await gsSet(context, STATE.semantic.lastDesired, desired);
  if (!autoApplied) await gsSet(context, STATE.semantic.applied, true);
  if (!storedTarget) await gsSet(context, STATE.semantic.target, Utils.cfg.serialiseTarget(target));
  trace?.line(`semantic: forced ${ desired ? "on" : "off" }`);
}

async function restoreSemanticOverride(context, switchingRef, trace, scope) {
  const autoApplied = gsGet(context, STATE.semantic.applied, false) === true;
  if (!autoApplied) return;
  const saved = gsGet(context, STATE.semantic.savedEnabled);
  const target =
    Utils.cfg.parseTarget(gsGet(context, STATE.semantic.target)) ??
    Utils.cfg.pickTargetForKey("editor", "semanticHighlighting.enabled", scope);
  try {
    await update("editor", "semanticHighlighting.enabled", saved ?? undefined, switchingRef, target, scope);
  } finally {
    trace?.line("semantic: restored");
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
  const scope = editor.document.uri;
  const isHyp = Utils.editor.isHypatiaEditor(editor);
  if (isHyp) {
    if (!lastWasHyp) trace?.line("enter hypatia");
    lastWasHypatiaRef.value = true;
    const semanticMode = getSemanticMode(scope);
    if (semanticMode === "inherit") await restoreSemanticOverride(context, switchingRef, trace, scope);
    else await applySemanticOverride(context, switchingRef, trace, scope);
    if (getAutoThemeEnabled(scope)) await applyWholeTheme(context, switchingRef, trace, scope);
    else await restoreWholeTheme(context, switchingRef, trace, scope);
    if (getAutoTokensSetting(scope) === "off") await restoreTokenOverlay(context, switchingRef, trace, scope);
    else await applyTokenOverlay(context, switchingRef, trace, scope);
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

export function activatestyle(context) {
  const switchingRef = { value: false };
  const lastWasHypatiaRef = { value: false };
  const trace = Utils.out.makeTracer(
    context,
    STYLE_CHANNEL,
    () => hypCfg().get("style.trace", false),
    "style"
  );
  const queue = Utils.util.createSerialQueue((err) => {
    try { trace.line(`error: ${ String(err?.message ?? err) }`); } catch { }
    Utils.out.logError(err, "hypatia.style");
  });
  const disposables = [];
  const enqueueReconcile = (ed) => queue.enqueue(() => reconcile(context, ed, switchingRef, lastWasHypatiaRef, trace));
  disposables.push(window.onDidChangeActiveTextEditor((ed) => enqueueReconcile(ed)));
  disposables.push(window.onDidChangeActiveColorTheme(() => {
    const ed = window.activeTextEditor;
    if (ed && Utils.editor.isHypatiaEditor(ed)) enqueueReconcile(ed);
  }));
  disposables.push(workspace.onDidChangeConfiguration((e) => {
    if (switchingRef.value) return;
    const relevant =
      e.affectsConfiguration(KEY_STYLE_AUTOTOKENS) ||
      e.affectsConfiguration(KEY_STYLE_AUTOTHEME) ||
      e.affectsConfiguration(KEY_STYLE_SEMANTIC) ||
      e.affectsConfiguration("${ CFG_ROOT }.trace") ||
      e.affectsConfiguration("editor.tokenColorCustomizations") ||
      e.affectsConfiguration("editor.semanticHighlighting.enabled") ||
      e.affectsConfiguration("workbench.colorTheme");
    if (relevant) enqueueReconcile(window.activeTextEditor);
  }));
  enqueueReconcile(window.activeTextEditor);
  return {
    dispose() {
      for (const d of disposables) { try { d.dispose(); } catch { } }
      queue.enqueue(async () => {
        try {
          const scope = window.activeTextEditor?.document?.uri;
          await restoreTokenOverlay(context, switchingRef, trace, scope);
          await restoreSemanticOverride(context, switchingRef, trace, scope);
          await restoreWholeTheme(context, switchingRef, trace, scope);
        } catch (err) {
          Utils.out.logError(err, "${ CFG_ROOT }.dispose");
        }
      });
    },
  };
}
