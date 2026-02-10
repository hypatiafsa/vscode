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

export function activate(context) {
  try {
    const style = activateStyle(context);
    context.subscriptions.push(style);
  } catch (err) {
    cfg.logError(err);
  }
}

export function deactivate() { }

/* End of file extension.js */
