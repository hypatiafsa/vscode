# Hypatia-VSCode

Hypatia Language Support for VSCode

---

### Table of Contents

1. [**The Extension**](#the-extension)
2. [**Versioning**](#versioning)
3. [**Installation**](#installation)
4. [**Change Log**](#change-log)
5. [**To Do**](#to-do)
6. [**Support**](#support)
7. [**Contributing**](#contributing)
8. [**Contributors**](#contributors)

---

## The Extension

**Hypatia-VSCode** provides editor support for the Hypatia language in VSCode.
Its goal is to make Hypatia documents pleasant to read and write by offering
sensible defaults and language-aware editor behaviour.

This extension provides syntax highlighting for Hypatia files (`*.hyp` and
`*.hypatia`) and includes bundled light and dark colour themes.
It can also apply Hypatia-specific token colours without changing the user's
global VSCode theme.
Specifically, while a Hypatia editor is active, the extension can optionally
automate style choices: it can enable a token-colour overlay that leaves the
current theme untouched or switch the whole theme between its bundled light/dark
variants.

By default, the extension automatically applies Hypatia token colours while a
Hypatia file is active and restores the previous settings when switching to a
different file type.
This behaviour is controlled by the `hypatia.style.autotokens` setting (default:
`true`).

Automatic switching of the whole VSCode colour theme can be enabled while a
Hypatia file is active.
This behaviour is controlled by the `hypatia.style.autotheme` setting (default:
`false`).

The theme variant used by Hypatia's style automation can be selected explicitly,
or left to follow the current VSCode theme kind.
This behaviour is controlled by the `hypatia.style.variant` setting, which
accepts `light`, `dark`, or `auto` (default: `auto`).

Semantic highlighting can be forced on or off while a Hypatia file is active, or
left unchanged to inherit the current VSCode configuration.
This behaviour is controlled by the `hypatia.style.semantichighlighting`
setting, which accepts `on`, `off`, or `inherit` (default: `inherit`).

For troubleshooting, the extension can emit detailed logs about style automation
to the *Hypatia Style* output channel.
This behaviour is controlled by the `hypatia.style.trace` setting (default:
`false`).

---

## Versioning

For details on the versioning scheme used for this extension, please refer to
the [Versioning Policy](./versioning.md).

---

## Installation

You can install **Hypatia-VSCode** in one of the following ways.

### Install from the VSCode Marketplace

1. Open the **Extensions** view (`Ctrl+Shift+X`).
2. Search for **Hypatia-VSCode** (or **Hypatia**).
3. Click **Install** and reload VSCode if prompted.

### Install from a VSIX package

If you have a `.vsix` release file (for example from the GitHub Releases page):

- In VSCode:

  open the **Extensions** view → click the `...` menu → **Install from VSIX…**

- From the terminal:

  ```shell
  code --install-extension hypatia-<version>.vsix
  ```

---

## Change Log

For a complete history of updates and modifications, please refer to the
[Change Log](./changelog.md) file.

---

## To Do

The list of upcoming features and improvements is tracked in the
[To Do](./todo.md) file.

---

## Support

For support with Hypatia-VSCode, please refer to the
[Support Guidelines](../../../.github/blob/master/support.md).

For general discussions, check out GitHub Discussions on the
[Hypatia Organisation webpage](https://github.com/hypatiafsa).

---

## Contributing

We welcome contributions of all kinds, from bug reports and feature requests to
documentation improvements and code enhancements.
If you would like to contribute, please read the
[Contributing Guidelines](../../../.github/blob/master/contributing.md) and
check both the [repository](./todo.md) and
[organisation](../../../.github/blob/master/todo.md) to do files for planned
tasks.

---

## Contributors

For the list of contributors, please refer to the
[Contributors](./contributors.txt) file.
