# 4. Feature Catalog

## 4.1 Terminal
- Full emulation of a real shell process (user-configurable: bash/zsh/fish/PowerShell/etc.), built on `xterm.js`
- Full support for colors, mouse events, and `curses`-based TUI apps (vim, htop, ranger, etc.)
- Multiple tabs (1 default + up to 4 extra, each tab backed by its own independent pty process/websocket)
- CWD (current working directory) tracking → live-linked to the file browser panel (not supported on Windows for technical reasons; falls back to a "detached mode")
- Custom color filters (theme's `colorFilter` array — chainable negate/grayscale/lighten/darken/saturate/etc.)
- Font ligature support (`xterm-addon-ligatures`)
- WebGL-accelerated rendering (`xterm-addon-webgl`)

## 4.2 System Monitoring
- Live CPU usage graph (sparkline built on `smoothie.js`)
- RAM/swap usage
- Hardware inspector (temperature sensors, etc. — on macOS, via the `osx-temperature-sensor` optional dependency)
- Process list (toplist) — similar to `top`/`htop`, with sorting/thread-exclusion options

## 4.3 Network Monitoring
- Active connection list, transfer rates
- GeoIP lookups (`geolite2-redist` + `maxmind` — automatically downloads the MaxMind GeoLite2-City DB on first run)
- External IP lookup (via the `myexternalip.com` API)
- Real-time connection location visualization as markers on a 3D globe widget (`encom-globe.js`, a ~980K bundled third-party vendor script)

## 4.4 File Browser
- Live directory listing that follows the terminal's CWD
- File-type icons (based on the `file-icons` git submodule and a 3.1MB `file-icons.json` matching table)
- Toggleable list/grid view, toggleable dotfile visibility
- Clicking a file inputs its path into the terminal (especially useful in Windows' detached mode)

## 4.5 On-Screen Keyboard
- 19 built-in layouts: US/GB/DE/FR(+BEPO)/ES(+LAT)/IT/PT-BR/NL/SV/DA/HU/TR(Q/F) plus alternate English layouts (DVORAK/COLEMAK/NORMAN/WORKMAN)
- Touchscreen support (touch-event handling)
- Passmode support (visually hides input feedback while typing passwords), bound to a keyboard shortcut

## 4.6 Media/Document Viewers
- Built-in media player (audio playback via `howler.js`)
- PDF reader (`pdfjs-dist` — Mozilla PDF.js)

## 4.7 Customization
- **Themes**: 21 built-in themes (JSON, defining colors/fonts/terminal/globe colors) — tron, matrix, blade, cyborg, nord, red, apollo, interstellar, chalkboard, navy, and more, many with variant suffixes (`-notype`, `-disrupted`, `-ligatures`, `-focus`, etc.)
- **Keyboard override**: runtime hot-swap
- **CSS injection**: arbitrary CSS can be injected via a theme JSON's `injectCSS` field
- **Shortcut customization**: `shortcuts.json` — supports both app actions and arbitrary shell command execution
- **Sound pack**: toggleable sound effects with volume control (13 wav files — boot, keypress, access granted/denied, alarm, panel switching, etc.)
- **Proxy support** (`#1050`, added in a recent session): `settings.proxy` or standard `HTTP(S)_PROXY` environment variables for use on restricted networks

## 4.8 Other
- Fuzzy finder (Ctrl+Shift+F) — quick file/command search
- Update checker (polls GitHub Releases)
- Boot intro animation (skippable via the `--nointro` flag)
- Multi-monitor support (`settings.monitor` index selection)
- Switchable between forced fullscreen and windowed mode (`allowWindowed`)
- Session restore (opt-in, `settings.restoreSession`) — reopens the same shell tabs at their last working directory (and any custom tab names) on next launch
