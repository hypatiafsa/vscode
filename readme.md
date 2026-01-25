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

---

## The Extension

**Hypatia-VSCode** provides editor support for the Hypatia language in VSCode.
Its goal is to make Hypatia documents pleasant to read and write by offering
sensible defaults and language-aware editor behaviour.

This extension ships with an optional bundled colour theme.
When enabled, it can automatically switch to the Hypatia theme while a Hypatia
file is active and restore your previous theme when you switch to another file
type.
This behaviour can be toggled via the `hypatia.autotheme.enabled` setting
(default: `true`).

> Note: VSCode themes are window-wide (not per tab).
> While a Hypatia file is active, the Hypatia theme applies to the whole window;
> when you leave Hypatia, the extension restores the previously active theme.

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
