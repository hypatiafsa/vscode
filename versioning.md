# Hypatia-VSCode Versioning Policy

The Hypatia-VSCode software follows [Semantic Versioning](https://semver.org/)
to ensure clarity and consistency in version numbering.
Public releases are assigned versions in the format:

```text
MAJOR.MINOR.PATCH
```

Versioning starts at `0.0.0` and follows these rules:

1. **Breaking Changes**
   (`MAJOR.MINOR.PATCH -> (MAJOR + 1).0.0`)
   - The **MAJOR** version is incremented when changes break backward
   compatibility, requiring users to modify their work or adapt to the new
   version.

1. **New Features**
   (`MAJOR.MINOR.PATCH -> MAJOR.(MINOR + 1).0`)
   - The **MINOR** version is incremented when new features are added in a
   backward-compatible manner, including significant refinements or improvements
   that do not break existing functionality.

1. **Bug Fixes & Minor Improvements**
   (`MAJOR.MINOR.PATCH -> MAJOR.MINOR.(PATCH + 1)`)
   - The **PATCH** version is incremented for backward-compatible bug fixes,
   optimisations, and minor refinements that do not introduce significant new
   features or break existing functionality.

For further details, refer to the official
[Semantic Versioning Specification](https://semver.org/).
