# 1. Project Overview

**eDEX-UI** is a fullscreen, cross-platform terminal emulator and system monitor inspired by science-fiction movie interfaces (most notably TRON: Legacy). It is a desktop app built on [Electron](https://www.electronjs.org/) that runs a real shell (bash/zsh/PowerShell/etc.) as its backend, wrapped in a sci-fi-styled GUI (on-screen keyboard, file browser, system/network monitoring panels, a 3D globe widget, and more).

- **Upstream repository**: [GitSquared/edex-ui](https://github.com/GitSquared/edex-ui) — publicly archived on October 18, 2021
- **License**: GPL-3.0
- **Runtime**: Electron 12 (Chromium + embedded Node.js)
- **Last upstream release**: 2.2.8

## Top-Level Directory Structure

```
edex-ui/
├── LICENSE, README.md, SECURITY.md
├── package.json              # Build toolchain only (electron-builder, electron, etc.)
├── prebuild-minify.js        # Pre-build JS/CSS/JSON minification script
├── file-icons-generator.js   # File icon matcher generator script
├── file-icons/                # Git submodule (icon font collection)
├── media/                     # Logo, screenshots, app icons (.icns/.ico)
├── docs/                      # (this documentation)
└── src/                       # Actual application source (Electron main + renderer)
    ├── package.json           # App runtime dependencies
    ├── _boot.js                # Electron main process entry point
    ├── _multithread.js         # Worker cluster dedicated to systeminformation calls
    ├── _renderer.js             # Renderer process bootstrap (~1200 lines)
    ├── ui.html                  # Renderer HTML shell (defines CSS/JS load order)
    ├── classes/                  # 18 UI module classes (terminal, keyboard, filesystem, etc.)
    └── assets/                   # CSS, fonts, audio, themes, keyboard layouts, icons, third-party vendor scripts
```

`src/` is effectively a **separate npm package** from the repository root (`src/package.json` is independent from the root one). This is because electron-builder's actual packaging scope is limited to `src/` (copied into `prebuild-src/` at build time), keeping the root's build-tooling dependencies (electron-builder itself, etc.) out of the final shipped bundle.
