# 4. Feature Catalog

## 4.1 Terminal
- Full emulation of a real shell process (user-configurable: bash/zsh/fish/PowerShell/etc.), built on `xterm.js`
- Full support for colors, mouse events, and `curses`-based TUI apps (vim, htop, ranger, etc.)
- Multiple tabs (1 default + up to 4 extra, each tab backed by its own independent pty process/websocket) — extra tabs can be drag-and-dropped to reorder
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
- Auto-detects the first external, IPv4-connected interface with a MAC address; can be overridden to a specific interface via the `iface` setting (Settings editor → `iface` dropdown, populated live from `si.networkInterfaces()`)
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
- **Themes**: 22 built-in themes (JSON, defining colors/fonts/terminal/globe colors) — tron, matrix, blade, cyborg, nord, dracula, red, apollo, interstellar, chalkboard, navy, and more, many with variant suffixes (`-notype`, `-disrupted`, `-ligatures`, `-focus`, etc.)
- **Keyboard override**: runtime hot-swap
- **CSS injection**: arbitrary CSS can be injected via a theme JSON's `injectCSS` field
- **Shortcut customization**: `shortcuts.json` — supports both app actions and arbitrary shell command execution, editable in-app via `Ctrl+Shift+K` (add/remove custom command shortcuts, edit triggers, toggle enabled - takes effect immediately, no reload needed) as well as by hand-editing the file
- **Sound pack**: toggleable sound effects with volume control (13 wav files — boot, keypress, access granted/denied, alarm, panel switching, etc.)
- **Proxy support** (`#1050`, added in a recent session): `settings.proxy` or standard `HTTP(S)_PROXY` environment variables for use on restricted networks

## 4.8 Other
- Fuzzy finder (Ctrl+Shift+F) — quick file/command search
- SSH profile manager (Ctrl+Shift+O) — save host/port/username/identity file per profile, one-click connect opens a new tab and runs `ssh` immediately
- Real in-app auto-update on Windows/Linux packaged builds (`electron-updater`, checks on startup, downloads/installs only after explicit confirmation each step) — skipped on macOS (unsigned builds, electron-updater's macOS backend needs code signing) and dev runs, where the app instead falls back to a lightweight GitHub-Releases-polling notification with a manual download link
- Boot intro animation (skippable via the `--nointro` flag)
- Multi-monitor support (`settings.monitor` index selection)
- Switchable between forced fullscreen and windowed mode (`allowWindowed`)
- Session restore (opt-in, `settings.restoreSession`) — reopens the same shell tabs at their last working directory (and any custom tab names) on next launch
- System volume widget next to the clock — get/set/mute the OS output volume (macOS via `osascript`, Linux via `pactl`/`amixer`, Windows via a PowerShell + Core Audio COM interop helper); degrades to a disabled "N/A" state if no supported backend is found
- Lock screen (Ctrl+Shift+Z) — password-protected privacy overlay; blanks the screen and blocks all other shortcuts until the correct password is entered, with a warning alarm after 3 failed attempts. The password is stored as a PBKDF2 hash + salt (never plaintext), set via the Settings editor. **Not a real security boundary** — see `docs/07-security.md`
