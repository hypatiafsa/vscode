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

import { activateStyle } from "./sources/style.js";

import cfg from "./sources/utils.js";

/*----------------------------------------------------------------------------*/

let styleHandle = undefined;

export function activate(context) {
  try {
    styleHandle = activateStyle(context);
    if (styleHandle) context.subscriptions.push(styleHandle);
  } catch (err) {
    cfg.logError(err);
  }
}

export function deactivate() {
  if (!styleHandle) return undefined;
  const hnd = styleHandle;
  styleHandle = undefined;
  try {
    if (typeof hnd.disposeAsync === "function") {
      const prm = hnd.disposeAsync();
      return Promise.resolve(prm).catch((err) => cfg.logError(err));
    }
    if (typeof hnd.dispose === "function") {
      hnd.dispose();
    }
  } catch (err) {
    cfg.logError(err);
  }
  return undefined;
}

/* End of file extension.js */
