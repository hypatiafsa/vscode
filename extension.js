/*------------------------------------------------------------------------------
--                                                                            --
-- Hypatia-VSCode - Hypatia Language Support for VSCode                       --
--                                                                            --
-- extension.js                                                               --
--                                                                            --
-- Copyright (C) 2025-2026, the Hypatia Development Team                      --
-- All rights reserved                                                        --
--                                                                            --
------------------------------------------------------------------------------*/

/* Begin of file extension.js */

import utils from "./sources/utils.js";

import { activateStyle } from "./sources/style.js";
import { activateHLS } from "./sources/hls.js";

/*----------------------------------------------------------------------------*/

let styleHandle = undefined;
let hlsHandle = undefined;

/**
 * Activates the extension and initialises all language support features.
 * @param {vscode.ExtensionContext} context - The extension context provided by
 * VSCode, used to manage subscriptions and resources
 * @returns {void}
 * @throws {Error} Errors are caught and logged via utils.logError()
 */
export function activate(context) {
  try {
    styleHandle = activateStyle(context);
    if (styleHandle) context.subscriptions.push(styleHandle);
  } catch (err) {
    utils.logError(err);
  }
  try {
    hlsHandle = activateHLS(context);
    if (hlsHandle) context.subscriptions.push(hlsHandle);
  } catch (err) {
    utils.logError(err);
  }
}

/**
 * Deactivates the extension and cleans up resources.
 * @returns {Promise<void>|undefined} A Promise if async disposal is performed,
 * undefined otherwise.
 * @throws {Error} Errors are caught and logged via utils.logError()
 */
export async function deactivate() {
  const allHandles = [hlsHandle, styleHandle].filter(Boolean);
  const asyncHandles = allHandles.filter(hnd => typeof hnd?.disposeAsync === "function");
  if (asyncHandles.length > 0) {
    const results = await Promise.allSettled(asyncHandles.map(hnd => hnd.disposeAsync()));
    results.forEach(rst => { if (rst.status === "rejected") utils.logError(rst.reason); });
  }
  for (const hnd of allHandles) {
    try {
      if (typeof hnd?.dispose === "function") hnd.dispose();
    } catch (err) {
      utils.logError(err);
    }
  }
  hlsHandle = undefined;
  styleHandle = undefined;
  return undefined;
}

/* End of file extension.js */
