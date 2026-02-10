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

/*----------------------------------------------------------------------------*/

let styleHandle = undefined;

/**
 * Activates the extension and initialises all language support features.
 *
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
}

/**
 * Deactivates the extension and cleans up resources.
 *
 * @returns {Promise<void>|undefined} A Promise if async disposal is performed,
 * undefined otherwise.
 * @throws {Error} Errors are caught and logged via utils.logError()
 */
export function deactivate() {
  if (!styleHandle) return undefined;
  const hnd = styleHandle;
  styleHandle = undefined;
  try {
    if (typeof hnd.disposeAsync === "function") {
      const prm = hnd.disposeAsync();
      return Promise.resolve(prm).catch((err) => utils.logError(err));
    }
    if (typeof hnd.dispose === "function") {
      hnd.dispose();
    }
  } catch (err) {
    utils.logError(err);
  }
  return undefined;
}

/* End of file extension.js */
