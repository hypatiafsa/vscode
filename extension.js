import { workspace, window, ColorThemeKind, ConfigurationTarget } from "vscode";
import { readFile } from "node:fs/promises";

const THEME_LABEL_LIGHT = "Hypatia Light";
const THEME_FILE_LIGHT = "themes/hypatia-light.json";
const THEME_LABEL_DARK = "Hypatia Dark";
const THEME_FILE_DARK = "themes/hypatia-dark.json";

const SET_AUTOTHEME = "hypatia.autotheme";
const SET_AUTOTOKENS = "hypatia.autotokens";
const SET_SEMANTIC = "hypatia.semantichighlighting";

const INJECTED_RULE_PREFIX = "__hypatia_autotokens__";

const STATE_AUTOTHEME_APPLIED = "hypatia.autotheme.autoApplied";
const STATE_AUTOTHEME_SAVED = "hypatia.autotheme.savedWorkbenchTheme";
const STATE_AUTOTHEME_TARGET = "hypatia.autotheme.appliedTarget";

const STATE_AUTOTOKENS_APPLIED = "hypatia.autotokens.autoApplied";
const STATE_AUTOTOKENS_SAVED = "hypatia.autotokens.savedTokenColorCustomizations";
const STATE_AUTOTOKENS_TARGET = "hypatia.autotokens.appliedTarget";

const STATE_SEMANTIC_APPLIED = "hypatia.semantichighlighting.autoApplied";
const STATE_SEMANTIC_SAVED = "hypatia.semantichighlighting.savedEditorSemanticHighlightingEnabled";
const STATE_SEMANTIC_TARGET = "hypatia.semantichighlighting.appliedTarget";
const STATE_SEMANTIC_LAST = "hypatia.semantichighlighting.lastDesired";

function cfg(section) {
  return workspace.getConfiguration(section);
}

function logError(err) {
  console.error("[hypatia]", err);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function serialiseTarget(target) {
  switch (target) {
    case ConfigurationTarget.WorkspaceFolder: return "WorkspaceFolder";
    case ConfigurationTarget.Workspace: return "Workspace";
    default: return "Global";
  }
}
function parseTarget(value) {
  if (value === "WorkspaceFolder") return ConfigurationTarget.WorkspaceFolder;
  if (value === "Workspace") return ConfigurationTarget.Workspace;
  if (value === "Global") return ConfigurationTarget.Global;
  return undefined;
}
function pickTargetForKey(cfg, key) {
  const inspected = cfg.inspect(key);
  if (inspected && inspected.workspaceFolderValue !== undefined) return ConfigurationTarget.WorkspaceFolder;
  if (inspected && inspected.workspaceValue !== undefined) return ConfigurationTarget.Workspace;
  return ConfigurationTarget.Global;
}

async function updateSetting(cfg, key, value, switchingRef, target) {
  switchingRef.value = true;
  try {
    await cfg.update(key, value, target);
  } finally {
    switchingRef.value = false;
  }
}

function getAutoThemeEnabled() {
  const v = cfg("hypatia").get("autotheme", false);
  return typeof v === "boolean" ? v : false;
}

function normaliseAutoTokensSetting(val) {
  return val === "off" || val === "auto" || val === "light" || val === "dark" ? val : "auto";
}
function getAutoTokensSetting() {
  const val = cfg("hypatia").get("autotokens", "auto");
  return typeof val === "string" ? normaliseAutoTokensSetting(val) : "auto";
}

function normaliseSemanticModeSetting(val) {
  return val === "inherit" || val === "on" || val === "off" ? val : "inherit";
}
function getSemanticMode() {
  const val = cfg("hypatia").get("semantichighlighting", "inherit");
  return typeof val === "string" ? normaliseSemanticModeSetting(val) : "inherit";
}

function isHypatiaEditor(ed) {
  return !!(ed && ed.document && ed.document.languageId === "hypatia");
}

function currentThemeKindIsLight() {
  const kind = window.activeColorTheme.kind;
  return kind === ColorThemeKind.Light || kind === ColorThemeKind.HighContrastLight;
}
function chooseVariant() {
  const mode = getAutoTokensSetting();
  if (mode === "dark" || mode === "light") return mode;
  return currentThemeKindIsLight() ? "light" : "dark";
}
function themeLabelForVariant(variant) {
  return variant === "light" ? THEME_LABEL_LIGHT : THEME_LABEL_DARK;
}
function themeFileForVariant(variant) {
  return variant === "light" ? THEME_FILE_LIGHT : THEME_FILE_DARK;
}

const _themeTokenColorsCache = new Map();

async function readTokenColorsFromThemeFile(context, variant) {
  if (_themeTokenColorsCache.has(variant)) {
    return _themeTokenColorsCache.get(variant).slice();
  }
  const rel = themeFileForVariant(variant);
  const abs = context.asAbsolutePath(rel);
  try {
    const raw = await readFile(abs, "utf8");
    const json = JSON.parse(raw);
    const rules = Array.isArray(json.tokenColors) ? json.tokenColors : [];
    _themeTokenColorsCache.set(variant, rules);
    return rules.slice();
  } catch (err) {
    logError(err);
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
  return rules.filter((r) => {
    const name = r && typeof r.name === "string" ? r.name : "";
    return !name.startsWith(INJECTED_RULE_PREFIX);
  });
}
function hasInjectedRules(rules) {
  if (!Array.isArray(rules)) return false;
  return rules.some((r) => {
    const name = r && typeof r.name === "string" ? r.name : "";
    return name.startsWith(INJECTED_RULE_PREFIX);
  });
}

async function setWorkbenchTheme(themeLabel, switchingRef, target) {
  const wb = cfg("workbench");
  const current = wb.get("colorTheme");
  if (!current || current === themeLabel) return;
  await updateSetting(wb, "colorTheme", themeLabel, switchingRef, target);
}

async function applyWholeTheme(context, switchingRef) {
  const wb = cfg("workbench");
  const current = wb.get("colorTheme");
  if (!current) return;
  const desired = themeLabelForVariant(chooseVariant());
  const currentIsHypatia = current === THEME_LABEL_DARK || current === THEME_LABEL_LIGHT;
  const autoApplied = context.globalState.get(STATE_AUTOTHEME_APPLIED, false);
  const storedTarget = parseTarget(context.globalState.get(STATE_AUTOTHEME_TARGET));
  const target = storedTarget ?? pickTargetForKey(wb, "colorTheme");
  if (!currentIsHypatia) {
    const prevSaved = context.globalState.get(STATE_AUTOTHEME_SAVED);
    const prevApplied = autoApplied;
    const prevTarget = context.globalState.get(STATE_AUTOTHEME_TARGET);
    try {
      await context.globalState.update(STATE_AUTOTHEME_SAVED, current);
      await setWorkbenchTheme(desired, switchingRef, target);
      await context.globalState.update(STATE_AUTOTHEME_APPLIED, true);
      await context.globalState.update(STATE_AUTOTHEME_TARGET, serialiseTarget(target));
    } catch (err) {
      try {
        await context.globalState.update(STATE_AUTOTHEME_SAVED, prevSaved);
        await context.globalState.update(STATE_AUTOTHEME_APPLIED, prevApplied);
        await context.globalState.update(STATE_AUTOTHEME_TARGET, prevTarget);
      } catch (_) {
      }
      throw err;
    }
    return;
  }
  if (current !== desired) {
    await setWorkbenchTheme(desired, switchingRef, target);
  }
  if (!autoApplied) return;
  if (!storedTarget) {
    await context.globalState.update(STATE_AUTOTHEME_TARGET, serialiseTarget(target));
  }
}

async function restoreWholeTheme(context, switchingRef) {
  const autoApplied = context.globalState.get(STATE_AUTOTHEME_APPLIED, false);
  if (!autoApplied) return;
  const wb = cfg("workbench");
  const current = wb.get("colorTheme");
  const saved = context.globalState.get(STATE_AUTOTHEME_SAVED);
  const target = parseTarget(context.globalState.get(STATE_AUTOTHEME_TARGET)) ?? pickTargetForKey(wb, "colorTheme");
  try {
    if (
      current &&
      (current === THEME_LABEL_DARK || current === THEME_LABEL_LIGHT) &&
      typeof saved === "string" &&
      saved.length > 0
    ) {
      await setWorkbenchTheme(saved, switchingRef, target);
    }
  } finally {
    await context.globalState.update(STATE_AUTOTHEME_APPLIED, false);
    await context.globalState.update(STATE_AUTOTHEME_SAVED, undefined);
    await context.globalState.update(STATE_AUTOTHEME_TARGET, undefined);
  }
}

async function applyTokenOverlay(context, switchingRef) {
  const editorCfg = cfg("editor");
  const variant = chooseVariant();
  const themeTokenColors = await readTokenColorsFromThemeFile(context, variant);
  const injectedRules = buildInjectedRules(themeTokenColors);
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = rawCurrent && typeof rawCurrent === "object" ? rawCurrent : {};
  const baseRules = stripInjectedRules(current.textMateRules);
  const base = Object.assign({}, current, { textMateRules: baseRules });
  const autoApplied = context.globalState.get(STATE_AUTOTOKENS_APPLIED, false);
  const storedTarget = parseTarget(context.globalState.get(STATE_AUTOTOKENS_TARGET));
  const target = storedTarget ?? pickTargetForKey(editorCfg, "tokenColorCustomizations");
  await context.globalState.update(STATE_AUTOTOKENS_SAVED, cloneJson(base));
  const next = Object.assign({}, base, {
    textMateRules: [...baseRules, ...injectedRules],
  });
  try {
    await updateSetting(editorCfg, "tokenColorCustomizations", next, switchingRef, target);
    if (!autoApplied) {
      await context.globalState.update(STATE_AUTOTOKENS_APPLIED, true);
    }
    if (!storedTarget) {
      await context.globalState.update(STATE_AUTOTOKENS_TARGET, serialiseTarget(target));
    }
  } catch (err) {
    if (!autoApplied) {
      try {
        await context.globalState.update(STATE_AUTOTOKENS_APPLIED, false);
        await context.globalState.update(STATE_AUTOTOKENS_TARGET, undefined);
      } catch (_) { }
    }
    throw err;
  }
}

async function restoreTokenOverlay(context, switchingRef) {
  const editorCfg = cfg("editor");
  const rawCurrent = editorCfg.get("tokenColorCustomizations");
  const current = rawCurrent && typeof rawCurrent === "object" ? rawCurrent : {};
  const hadInjected = hasInjectedRules(current.textMateRules);
  const autoApplied = context.globalState.get(STATE_AUTOTOKENS_APPLIED, false);
  const saved = context.globalState.get(STATE_AUTOTOKENS_SAVED);
  const target = parseTarget(context.globalState.get(STATE_AUTOTOKENS_TARGET)) ?? pickTargetForKey(editorCfg, "tokenColorCustomizations");
  let valueToRestore;
  if (autoApplied) {
    valueToRestore = saved ?? undefined;
  } else if (hadInjected) {
    valueToRestore = Object.assign({}, current, { textMateRules: stripInjectedRules(current.textMateRules) });
  } else {
    return;
  }
  try {
    await updateSetting(editorCfg, "tokenColorCustomizations", valueToRestore, switchingRef, target);
  } finally {
    if (autoApplied) {
      await context.globalState.update(STATE_AUTOTOKENS_APPLIED, false);
      await context.globalState.update(STATE_AUTOTOKENS_SAVED, undefined);
      await context.globalState.update(STATE_AUTOTOKENS_TARGET, undefined);
    }
  }
}

async function applySemanticOverride(context, switchingRef) {
  const mode = getSemanticMode();
  if (mode === "inherit") return;
  const desired = mode === "on";
  const editorCfg = cfg("editor");
  const effectiveCurrent = editorCfg.get("semanticHighlighting.enabled");
  const autoApplied = context.globalState.get(STATE_SEMANTIC_APPLIED, false);
  const storedTarget = parseTarget(context.globalState.get(STATE_SEMANTIC_TARGET));
  const target = storedTarget ?? pickTargetForKey(editorCfg, "semanticHighlighting.enabled");
  const inspected = editorCfg.inspect("semanticHighlighting.enabled");
  const valueInTarget =
    target === ConfigurationTarget.WorkspaceFolder ? inspected?.workspaceFolderValue :
      target === ConfigurationTarget.Workspace ? inspected?.workspaceValue :
        inspected?.globalValue;
  if (!autoApplied) {
    if (effectiveCurrent === desired) return;
    await context.globalState.update(STATE_SEMANTIC_SAVED, valueInTarget);
  } else {
    const lastDesired = context.globalState.get(STATE_SEMANTIC_LAST);
    if (typeof lastDesired === "boolean" && valueInTarget !== lastDesired) {
      await context.globalState.update(STATE_SEMANTIC_SAVED, valueInTarget);
    }
  }
  try {
    await updateSetting(editorCfg, "semanticHighlighting.enabled", desired, switchingRef, target);
    await context.globalState.update(STATE_SEMANTIC_LAST, desired);
    if (!autoApplied) {
      await context.globalState.update(STATE_SEMANTIC_APPLIED, true);
    }
    if (!storedTarget) {
      await context.globalState.update(STATE_SEMANTIC_TARGET, serialiseTarget(target));
    }
  } catch (err) {
    if (!autoApplied) {
      try {
        await context.globalState.update(STATE_SEMANTIC_APPLIED, false);
        await context.globalState.update(STATE_SEMANTIC_TARGET, undefined);
        await context.globalState.update(STATE_SEMANTIC_LAST, undefined);
      } catch (_) { }
    }
    throw err;
  }
}

async function restoreSemanticOverride(context, switchingRef) {
  const autoApplied = context.globalState.get(STATE_SEMANTIC_APPLIED, false);
  if (!autoApplied) return;
  const editorCfg = cfg("editor");
  const saved = context.globalState.get(STATE_SEMANTIC_SAVED);
  const storedTarget = parseTarget(context.globalState.get(STATE_SEMANTIC_TARGET));
  const target = storedTarget ?? pickTargetForKey(editorCfg, "semanticHighlighting.enabled");
  try {
    await updateSetting(editorCfg, "semanticHighlighting.enabled", saved ?? undefined, switchingRef, target);
  } finally {
    await context.globalState.update(STATE_SEMANTIC_APPLIED, false);
    await context.globalState.update(STATE_SEMANTIC_SAVED, undefined);
    await context.globalState.update(STATE_SEMANTIC_TARGET, undefined);
    await context.globalState.update(STATE_SEMANTIC_LAST, undefined);
  }
}

async function reconcile(context, editor, switchingRef, lastWasHypatiaRef) {
  if (switchingRef.value) return;
  const lastWasHyp = lastWasHypatiaRef.value;
  if (!editor || !editor.document) {
    if (lastWasHyp) {
      lastWasHypatiaRef.value = false;
      await restoreTokenOverlay(context, switchingRef);
      await restoreSemanticOverride(context, switchingRef);
      await restoreWholeTheme(context, switchingRef);
    }
    return;
  }
  const isHyp = isHypatiaEditor(editor);
  if (isHyp) {
    lastWasHypatiaRef.value = true;
    const semanticMode = getSemanticMode();
    if (semanticMode === "inherit") {
      await restoreSemanticOverride(context, switchingRef);
    } else {
      await applySemanticOverride(context, switchingRef);
    }
    const autoTheme = getAutoThemeEnabled();
    if (autoTheme) {
      await applyWholeTheme(context, switchingRef);
      await restoreTokenOverlay(context, switchingRef);
    } else {
      await restoreWholeTheme(context, switchingRef);
      const autoTokens = getAutoTokensSetting();
      if (autoTokens === "off") {
        await restoreTokenOverlay(context, switchingRef);
      } else {
        await applyTokenOverlay(context, switchingRef);
      }
    }
    return;
  }
  lastWasHypatiaRef.value = false;
  if (lastWasHyp) {
    await restoreTokenOverlay(context, switchingRef);
    await restoreSemanticOverride(context, switchingRef);
    await restoreWholeTheme(context, switchingRef);
  }
}

export function activate(context) {
  const switchingRef = { value: false };
  const lastWasHypatiaRef = { value: false };
  let chain = Promise.resolve();
  const enqueue = (task) => {
    chain = chain.then(task).catch(logError);
  };
  const enqueueReconcile = (ed) => {
    enqueue(() => reconcile(context, ed, switchingRef, lastWasHypatiaRef));
  };
  context.subscriptions.push(
    window.onDidChangeActiveTextEditor((ed) => {
      enqueueReconcile(ed);
    })
  );
  context.subscriptions.push(
    window.onDidChangeActiveColorTheme(() => {
      const ed = window.activeTextEditor;
      if (!ed || !isHypatiaEditor(ed)) return;
      enqueueReconcile(ed);
    })
  );
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((e) => {
      if (switchingRef.value) return;
      const relevant =
        e.affectsConfiguration(SET_AUTOTOKENS) ||
        e.affectsConfiguration(SET_AUTOTHEME) ||
        e.affectsConfiguration(SET_SEMANTIC) ||
        e.affectsConfiguration("editor.tokenColorCustomizations") ||
        e.affectsConfiguration("editor.semanticHighlighting.enabled") ||
        e.affectsConfiguration("workbench.colorTheme");
      if (relevant) {
        enqueueReconcile(window.activeTextEditor);
      }
    })
  );
  enqueueReconcile(window.activeTextEditor);
}

export function deactivate() { }
