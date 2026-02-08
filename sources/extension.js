
import { createHlsController } from "./hls.js";
import { activateStyle } from "./style.js";

export function activate(context) {
  const hls = createHlsController(context);
  context.subscriptions.push(hls);
  hls.activate();
  const style = activateStyle(context);
  context.subscriptions.push(style);
}

export function deactivate() { }
