const vscode = require("vscode");

const HYPATIA_THEME_LABEL = "hypatia";
const STATE_LAST_THEME = "hypatia.autotheme.lastNonHypatiaTheme";
const STATE_AUTO_APPLIED = "hypatia.autotheme.autoApplied";

function getAutoThemeEnabled() {
  return vscode.workspace.getConfiguration().get("hypatia.autotheme.enabled", true);
}

function getWorkbenchConfig() {
  return vscode.workspace.getConfiguration("workbench");
}

function getCurrentTheme() {
  return getWorkbenchConfig().get("colorTheme");
}

function isHypatiaEditor(ed) {
  return !!(ed && ed.document && ed.document.languageId === "hypatia");
}

async function setTheme(themeLabel, target = vscode.ConfigurationTarget.Global) {
  const workbench = getWorkbenchConfig();
  const current = workbench.get("colorTheme");
  if (!current || current === themeLabel) return;
  await workbench.update("colorTheme", themeLabel, target);
}

async function restoreIfAutoApplied(context, switchingRef) {
  const currentTheme = getCurrentTheme();
  if (!currentTheme) return;
  const autoApplied = context.globalState.get(STATE_AUTO_APPLIED, false);
  const lastNonHypatiaTheme = context.globalState.get(STATE_LAST_THEME);
  if (currentTheme === HYPATIA_THEME_LABEL && autoApplied && lastNonHypatiaTheme) {
    switchingRef.value = true;
    try {
      await setTheme(lastNonHypatiaTheme, vscode.ConfigurationTarget.Global);
    } finally {
      switchingRef.value = false;
    }
    await context.globalState.update(STATE_AUTO_APPLIED, false);
  }
}

async function onActiveEditorChanged(context, editor, switchingRef, lastWasHypatiaRef) {
  if (switchingRef.value) return;
  if (!editor || !editor.document) return;
  if (!getAutoThemeEnabled()) return;
  const currentTheme = getCurrentTheme();
  if (!currentTheme) return;
  const autoApplied = context.globalState.get(STATE_AUTO_APPLIED, false);
  const lastNonHypatiaTheme = context.globalState.get(STATE_LAST_THEME);
  const isHyp = isHypatiaEditor(editor);
  const lastWasHyp = lastWasHypatiaRef.value;
  if (isHyp) {
    lastWasHypatiaRef.value = true;
    if (currentTheme !== HYPATIA_THEME_LABEL) {
      await context.globalState.update(STATE_LAST_THEME, currentTheme);
      await context.globalState.update(STATE_AUTO_APPLIED, true);
      switchingRef.value = true;
      try {
        await setTheme(HYPATIA_THEME_LABEL, vscode.ConfigurationTarget.Global);
      } finally {
        switchingRef.value = false;
      }
    }
    return;
  }
  lastWasHypatiaRef.value = false;
  if (lastWasHyp && currentTheme === HYPATIA_THEME_LABEL && autoApplied && lastNonHypatiaTheme) {
    switchingRef.value = true;
    try {
      await setTheme(lastNonHypatiaTheme, vscode.ConfigurationTarget.Global);
    } finally {
      switchingRef.value = false;
    }
    await context.globalState.update(STATE_AUTO_APPLIED, false);
  }
}

function activate(context) {
  const switchingRef = { value: false };
  const lastWasHypatiaRef = { value: false };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      void onActiveEditorChanged(context, ed, switchingRef, lastWasHypatiaRef);
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (switchingRef.value) return;
      if (e.affectsConfiguration("hypatia.autotheme.enabled")) {
        if (!getAutoThemeEnabled()) {
          void restoreIfAutoApplied(context, switchingRef);
        } else {
          void onActiveEditorChanged(context, vscode.window.activeTextEditor, switchingRef, lastWasHypatiaRef);
        }
        return;
      }
      if (!e.affectsConfiguration("workbench.colorTheme")) return;
      const ed = vscode.window.activeTextEditor;
      if (!ed || !ed.document) return;
      const currentTheme = getCurrentTheme();
      if (!currentTheme) return;
      if (!isHypatiaEditor(ed) && currentTheme !== HYPATIA_THEME_LABEL) {
        void context.globalState.update(STATE_LAST_THEME, currentTheme);
        void context.globalState.update(STATE_AUTO_APPLIED, false);
      }
    })
  );
  void onActiveEditorChanged(context, vscode.window.activeTextEditor, switchingRef, lastWasHypatiaRef);
}

function deactivate() { }

module.exports = { activate, deactivate };
