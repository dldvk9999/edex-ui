# 6. Build & Deployment Pipeline

## 6.1 Dual `package.json` Structure and Why

| | root `package.json` | `src/package.json` |
|---|---|---|
| Purpose | **Build toolchain** | **Runtime dependencies** (what the actual app code `require()`s) |
| Representative deps | `electron`, `electron-builder`, `terser`, `clean-css` | `xterm`, `node-pty`, `systeminformation`, `ws`, `nan`, etc. |
| electron-builder's `directories.app` | `prebuild-src` (generated at build time) | — |

At build time, `src/` is copied into `prebuild-src/` (rsync/xcopy) → minified via `prebuild-minify.js` (JS/CSS/JSON) → a **separate** `npm install` is run inside `prebuild-src` (this install produces the `node_modules` that actually ships in the app bundle) → `electron-builder` packages `prebuild-src`. The root's `node_modules` (electron-builder, etc.) never end up in the shipped distributable.

## 6.2 Native Modules

- **`node-pty`**: pty (pseudo-terminal) bindings, a native C++ addon → requires a `node-gyp` build, and must be rebuilt against Electron's V8/Node ABI (`npmRebuild: true`)
- **`osx-temperature-sensor`**: macOS-only optional dependency, for reading temperature sensors
- Both native modules depend on `nan` (Native Abstractions for Node) — pinned to `^2.20.0` in a recent maintenance pass for Node 18 V8 API compatibility (`GetBackingStore`). `node-pty`'s originally-resolved `nan@2.14.0` used the old `GetContents()` API, which fails to compile under Node 18+

## 6.3 Platform Build Targets

| Platform | Architectures | Output | Notes |
|---|---|---|---|
| Linux | x64, ia32, arm64, armv7l | `.AppImage` | ARM builds run under QEMU emulation inside dedicated Docker containers |
| macOS | x64, **arm64** (added in a recent maintenance pass) | `.dmg` | Unsigned (no code signing) — intentional, no Apple Developer certificate available |
| Windows | x64, ia32 | NSIS `.exe` installer | Allows changing the install path, deletes app data on uninstall |

## 6.4 CI (GitHub Actions) — `build-binaries.yaml`

Five parallel jobs: `build-linux`, `build-linux-arm32`, `build-linux-arm64`, `build-windows`, `build-darwin`. Each job carried several layers of legacy toolchain issues (all resolved in a recent maintenance pass):

- Node 14/18 pinning combined with per-OS native build tool (node-gyp) version mismatches
- Windows: pinned to the `windows-2022` runner image, and node-gyp was replaced wholesale with a modern version (9.x) to fix VS2022 detection
- macOS: worked around Python 3.12+/3.14 dropping `distutils` (via installing `setuptools`), worked around a missing `openssl_fips` gyp variable, and bumped `electron-builder` 22→23 to fix a hardcoded `/usr/bin/python` call that no longer exists on modern macOS runner images
- Common: replaced deprecated GitHub Actions (`actions/cache@v2`, `actions/upload-artifact@v2`, etc.) with their current major versions across the board
