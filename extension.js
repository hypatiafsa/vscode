
import { activateStyle } from "./sources/style.js";

export function activate(context) {
  try {
    const style = activateStyle(context);
    context.subscriptions.push(style);
  } catch (err) {
    console.error("[hypatia] Style activation failed!", err);
  }
}

export function deactivate() { }
