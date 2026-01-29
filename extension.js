const vscode = require("vscode");
const fs = require("fs");

const THEME_LABEL_DARK = "Hypatia Dark";
const THEME_FILE_DARK = "themes/hypatia-dark.json";
const THEME_LABEL_LIGHT = "Hypatia Light";
const THEME_FILE_LIGHT = "themes/hypatia-light.json";

const SET_AUTOTOKENS_AUTOAPPLY = "hypatia.autotokens.autoapply";
const SET_AUTOTHEME_AUTOSWITCH = "hypatia.autotheme.autoswitch";
const SET_VARIANT_MODE = "hypatia.autotokens.mode";
const SET_SEMANTIC_MODE = "hypatia.semantichighlighting.mode";

const INJECTED_RULE_PREFIX = "__hypatia_autotokens__";

const STATE_AUTOTHEME_APPLIED = "hypatia.autotheme.autoApplied";
const STATE_AUTOTHEME_SAVED_THEME = "hypatia.autotheme.savedWorkbenchTheme";
const STATE_AUTOTOKENS_APPLIED = "hypatia.autotokens.autoApplied";
const STATE_AUTOTOKENS_SAVED_CUSTOM = "hypatia.autotokens.savedTokenColorCustomizations";
const STATE_SEMANTIC_APPLIED = "hypatia.semantichighlighting.autoApplied";
const STATE_SEMANTIC_SAVED_VALUE = "hypatia.semantichighlighting.savedEditorSemanticHighlightingEnabled";

function cfg() {
  return vscode.workspace.getConfiguration();
}

function getBooleanSetting(key, def) {
  const v = cfg().get(key);
  return typeof v === "boolean" ? v : def;
}

function getStringSetting(primaryKey, fallbackKey, def) {
  const c = cfg();
  const v = c.get(primaryKey);
  if (typeof v === "string") return v;
  const vf = c.get(fallbackKey);
  if (typeof vf === "string") return vf;
  return def;
}

function getAutoTokensAutoApply() {
  return getBooleanSetting(SET_AUTOTOKENS_AUTOAPPLY, true);
}


function getAutoThemeAutoSwitch() {
  return getBooleanSetting(SET_AUTOTHEME_AUTOSWITCH, false);
}

function getVariantMode() {
  const mode = cfg().get(SET_VARIANT_MODE, "auto");
  return mode === "dark" || mode === "light" || mode === "auto" ? mode : "auto";
}

function getSemanticMode() {
  const v = cfg().get(SET_SEMANTIC_MODE, "inherit");
  return v === "inherit" || v === "on" || v === "off" ? v : "inherit";
}

function isHypatiaEditor(ed) {
  return !!(ed && ed.document && ed.document.languageId === "hypatia");
}

function currentThemeKindIsLight() {
  const k = vscode.window.activeColorTheme.kind;
  return (
    k === vscode.ColorThemeKind.Light ||
    k === vscode.ColorThemeKind.HighContrastLight
  );
}

function chooseVariant() {
  const mode = getVariantMode();
  if (mode === "dark" || mode === "light") return mode;
  return currentThemeKindIsLight() ? "light" : "dark";
}

function themeLabelForVariant(variant) {
  return variant === "light" ? THEME_LABEL_LIGHT : THEME_LABEL_DARK;
}

function themeFileForVariant(variant) {
  return variant === "light" ? THEME_FILE_LIGHT : THEME_FILE_DARK;
}

function readTokenColorsFromThemeFile(context, variant) {
  const rel = themeFileForVariant(variant);
  const abs = context.asAbsolutePath(rel);
  const raw = fs.readFileSync(abs, "utf8");
  const json = JSON.parse(raw);
  const rules = json.tokenColors || [];
  return Array.isArray(rules) ? rules : [];
}

function buildInjectedRules(themeTokenColors) {
  return themeTokenColors.map((r, i) => {
    const clone = Object.assign({}, r);
    clone.name = `${ INJECTED_RULE_PREFIX }:${ i }`;
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

async function setWorkbenchTheme(themeLabel, switchingRef) {
  const wb = vscode.workspace.getConfiguration("workbench");
  const current = wb.get("colorTheme");
  if (!current || current === themeLabel) return;
  switchingRef.value = true;
  try {
    await wb.update("colorTheme", themeLabel, vscode.ConfigurationTarget.Global);
  } finally {
    switchingRef.value = false;
  }
}

async function applyWholeTheme(context, switchingRef) {
  const wb = vscode.workspace.getConfiguration("workbench");
  const current = wb.get("colorTheme");
  if (!current) return;
  const autoApplied = context.globalState.get(STATE_AUTOTHEME_APPLIED, false);
  if (!autoApplied) {
    await context.globalState.update(STATE_AUTOTHEME_SAVED_THEME, current);
    await context.globalState.update(STATE_AUTOTHEME_APPLIED, true);
  }
  const variant = chooseVariant();
  await setWorkbenchTheme(themeLabelForVariant(variant), switchingRef);
}

async function restoreWholeTheme(context, switchingRef) {
  const autoApplied = context.globalState.get(STATE_AUTOTHEME_APPLIED, false);
  if (!autoApplied) return;
  const wb = vscode.workspace.getConfiguration("workbench");
  const current = wb.get("colorTheme");
  const saved = context.globalState.get(STATE_AUTOTHEME_SAVED_THEME);
  if (
    current &&
    (current === THEME_LABEL_DARK || current === THEME_LABEL_LIGHT) &&
    saved
  ) {
    await setWorkbenchTheme(saved, switchingRef);
  }
  await context.globalState.update(STATE_AUTOTHEME_APPLIED, false);
  await context.globalState.update(STATE_AUTOTHEME_SAVED_THEME, undefined);
}

async function applyTokenOverlay(context, switchingRef) {
  const editorCfg = vscode.workspace.getConfiguration("editor");
  const variant = chooseVariant();
  const themeTokenColors = readTokenColorsFromThemeFile(context, variant);
  const injectedRules = buildInjectedRules(themeTokenColors);
  const autoApplied = context.globalState.get(STATE_AUTOTOKENS_APPLIED, false);
  if (!autoApplied) {
    const current = editorCfg.get("tokenColorCustomizations");
    await context.globalState.update(STATE_AUTOTOKENS_SAVED_CUSTOM, current);
    await context.globalState.update(STATE_AUTOTOKENS_APPLIED, true);
  }
  const current = editorCfg.get("tokenColorCustomizations") || {};
  const existingRules = stripInjectedRules(current.textMateRules);
  const next = Object.assign({}, current, {
    textMateRules: [...existingRules, ...injectedRules],
  });
  switchingRef.value = true;
  try {
    await editorCfg.update(
      "tokenColorCustomizations",
      next,
      vscode.ConfigurationTarget.Global
    );
  } finally {
    switchingRef.value = false;
  }
}

async function restoreTokenOverlay(context, switchingRef) {
  const editorCfg = vscode.workspace.getConfiguration("editor");
  const current = editorCfg.get("tokenColorCustomizations") || {};
  const hadInjected = hasInjectedRules(current.textMateRules);
  const autoApplied = context.globalState.get(STATE_AUTOTOKENS_APPLIED, false);
  const saved = context.globalState.get(STATE_AUTOTOKENS_SAVED_CUSTOM);
  let target;
  if (autoApplied) {
    target = saved ?? undefined;
  } else if (hadInjected) {
    target = Object.assign({}, current, {
      textMateRules: stripInjectedRules(current.textMateRules),
    });
  } else {
    return;
  }
  switchingRef.value = true;
  try {
    await editorCfg.update(
      "tokenColorCustomizations",
      target,
      vscode.ConfigurationTarget.Global
    );
  } finally {
    switchingRef.value = false;
  }
  if (autoApplied) {
    await context.globalState.update(STATE_AUTOTOKENS_APPLIED, false);
    await context.globalState.update(STATE_AUTOTOKENS_SAVED_CUSTOM, undefined);
  }
}

async function applySemanticOverride(context, switchingRef) {
  const mode = getSemanticMode();
  if (mode === "inherit") return;
  const editorCfg = vscode.workspace.getConfiguration("editor");
  const autoApplied = context.globalState.get(STATE_SEMANTIC_APPLIED, false);
  if (!autoApplied) {
    const current = editorCfg.get("semanticHighlighting.enabled");
    await context.globalState.update(STATE_SEMANTIC_SAVED_VALUE, current);
    await context.globalState.update(STATE_SEMANTIC_APPLIED, true);
  }
  const desired = mode === "on";
  switchingRef.value = true;
  try {
    await editorCfg.update(
      "semanticHighlighting.enabled",
      desired,
      vscode.ConfigurationTarget.Global
    );
  } finally {
    switchingRef.value = false;
  }
}

async function restoreSemanticOverride(context, switchingRef) {
  const autoApplied = context.globalState.get(STATE_SEMANTIC_APPLIED, false);
  if (!autoApplied) return;
  const editorCfg = vscode.workspace.getConfiguration("editor");
  const saved = context.globalState.get(STATE_SEMANTIC_SAVED_VALUE);
  switchingRef.value = true;
  try {
    await editorCfg.update(
      "semanticHighlighting.enabled",
      saved ?? undefined,
      vscode.ConfigurationTarget.Global
    );
  } finally {
    switchingRef.value = false;
  }
  await context.globalState.update(STATE_SEMANTIC_APPLIED, false);
  await context.globalState.update(STATE_SEMANTIC_SAVED_VALUE, undefined);
}

async function reconcile(context, editor, switchingRef, lastWasHypatiaRef) {
  if (switchingRef.value) return;
  if (!editor || !editor.document) return;
  const isHyp = isHypatiaEditor(editor);
  const lastWasHyp = lastWasHypatiaRef.value;
  const autoTheme = getAutoThemeAutoSwitch();
  const autoTokens = getAutoTokensAutoApply();
  const semanticMode = getSemanticMode();
  if (isHyp) {
    lastWasHypatiaRef.value = true;
    if (semanticMode === "inherit") {
      await restoreSemanticOverride(context, switchingRef);
    } else {
      await applySemanticOverride(context, switchingRef);
    }
    if (autoTheme) {
      await applyWholeTheme(context, switchingRef);
      await restoreTokenOverlay(context, switchingRef);
    } else {
      await restoreWholeTheme(context, switchingRef);
      if (autoTokens) {
        await applyTokenOverlay(context, switchingRef);
      } else {
        await restoreTokenOverlay(context, switchingRef);
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

function activate(context) {
  const switchingRef = { value: false };
  const lastWasHypatiaRef = { value: false };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      void reconcile(context, ed, switchingRef, lastWasHypatiaRef);
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || !isHypatiaEditor(ed)) return;
      void reconcile(context, ed, switchingRef, lastWasHypatiaRef);
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (switchingRef.value) return;
      const relevant =
        e.affectsConfiguration(SET_AUTOTOKENS_AUTOAPPLY) ||
        e.affectsConfiguration(SET_AUTOTHEME_AUTOSWITCH) ||
        e.affectsConfiguration(SET_VARIANT_MODE) ||
        e.affectsConfiguration(SET_SEMANTIC_MODE);
      if (relevant) {
        void reconcile(context, vscode.window.activeTextEditor, switchingRef, lastWasHypatiaRef);
      }
      if (e.affectsConfiguration("workbench.colorTheme")) {
        const ed = vscode.window.activeTextEditor;
        if (ed && isHypatiaEditor(ed) && getAutoThemeAutoSwitch()) {
          const wb = vscode.workspace.getConfiguration("workbench");
          const current = wb.get("colorTheme");
          const desired = themeLabelForVariant(chooseVariant());
          if (current && current !== THEME_LABEL_DARK && current !== THEME_LABEL_LIGHT) {
            void context.globalState.update(STATE_AUTOTHEME_SAVED_THEME, current);
            void context.globalState.update(STATE_AUTOTHEME_APPLIED, true);
            void setWorkbenchTheme(desired, switchingRef);
          } else if (current && current !== desired) {
            void setWorkbenchTheme(desired, switchingRef);
          }
        }
      }
    })
  );
  void reconcile(context, vscode.window.activeTextEditor, switchingRef, lastWasHypatiaRef);
}

function deactivate() { }

module.exports = { activate, deactivate };
