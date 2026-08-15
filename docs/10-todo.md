# 10. Feature TODO / Proposals

A list of features worth considering for future work, gathered by researching community requests (GitHub issues/discussions on the archived upstream repo) and by direct analysis of the current codebase.

## 10.0 Completed

| Feature | Notes |
|---|---|
| ~~In-terminal search (Find)~~ | Done — `xterm-addon-search` wired into the `Terminal` client class, bound to `Ctrl+Shift+G` via a new `TerminalSearch` modal. See `src/classes/terminalSearch.class.js`. |
| ~~Tab renaming~~ | Done — double-click a shell tab to give it a custom name via a rename modal (`window.renameShellTab`/`window.tabNames` in `src/_renderer.js`). Custom names survive process/cwd changes but are **not persisted across app restarts** — see 10.2 below, this was split out as a separate follow-up rather than done as part of the same change. |
| ~~Session/layout save & restore~~ | Done — opt-in via the new `restoreSession` setting (off by default, toggleable from the in-app Settings editor or by hand-editing `settings.json`). On every tab open/close/rename and on unload, the renderer writes `lastSession.json` (main tab cwd, each open extra tab's cwd + custom name, and the focused tab). On next launch, if enabled: `_boot.js` reads it before spawning the main tty to restore its cwd, and `_renderer.js` recreates extra tabs (1-4) at their saved cwd/name via an extended `ttyspawn` IPC call (now accepts an optional target cwd, falling back to the pre-existing "inherit main tab's cwd" behavior when omitted). Custom tab names (10.0 above) are restored as part of this. |

## 10.1 Long-Requested by the Community (never implemented upstream)

| Feature | Description | Source |
|---|---|---|
| **Theme editor GUI** | Themes currently require hand-editing raw JSON. An in-app tool with color pickers/live preview would lower the barrier to making custom themes. | [Discussion #1028](https://github.com/GitSquared/edex-ui/discussions/1028), [Discussion #481](https://github.com/GitSquared/edex-ui/discussions/481) — a recurring request |
| **Plugin / external module system** | The 18 modules are currently hardcoded into the app. Users have asked for a way to write and load their own modules (e.g. a Git GUI, home-automation integration). | [Discussion #334](https://github.com/GitSquared/edex-ui/discussions/334) |
| **Network interface selector dropdown** | The netstat module only watches a single auto-detected interface; users want to pick one from settings. | [Issue #403](https://github.com/GitSquared/edex-ui/issues/403) |
| **Lock screen module** | A screensaver-style module that asks for a password and can trigger a warning/alarm after repeated failed attempts. | [Discussion #481](https://github.com/GitSquared/edex-ui/discussions/481), [Issue #464](https://github.com/GitSquared/edex-ui/issues/464) |
| **Volume control module** | Display and adjust system volume from within the UI. | [Discussion #481](https://github.com/GitSquared/edex-ui/discussions/481) |
| **More popular color-scheme themes (e.g. Dracula)** | Community frequently asks for well-known color schemes to be ported as built-in themes. | [Discussion #1149](https://github.com/GitSquared/edex-ui/discussions/1149) |

## 10.2 Gaps Found via Direct Codebase Analysis

| Feature | Description | Estimated effort |
|---|---|---|
| **Editable shortcuts UI** | `settings.json` already has an in-app editor (`Ctrl+Shift+S` → `window.openSettings`/`writeSettingsFile` in `src/_renderer.js`) — an earlier version of this doc missed it and incorrectly called it "no GUI settings panel at all". `shortcuts.json` is the actual remaining gap: its help screen (`Ctrl+Shift+K`) only *displays* current bindings in disabled inputs, with no way to change or add a shortcut without hand-editing the JSON file. | Medium (extend the existing shortcuts help modal into an editable form + a "Save to Disk" write-back, mirroring the settings editor's pattern) |
| **Tab reordering (drag-and-drop)** | Split out from the original "Tab renaming / reordering" item once renaming was implemented — reordering turned out to be a bigger job than initially estimated: tabs 1-4 are bound to fixed websocket ports/array indices, and the `TAB_1`..`TAB_5` keyboard shortcuts assume a fixed number-to-tab mapping. Doing this properly means decoupling tab *display order* from the underlying port/index, not just a low-effort UI tweak. | Medium (re-estimated from the original "Low") |
| **SSH profile manager** | Save frequently-used SSH hosts for one-click connect — a common feature in terminal emulators that's missing here. | Medium |
| **Split panes** | Only tabs exist today; no way to view multiple terminals side-by-side in one screen. | High (needs a new layout engine) |
| **Accessibility (a11y) improvements** | No screen-reader support, no full keyboard-only navigation. | Medium-high |

## 10.3 Building on the Existing CI/Build Pipeline

- `updateChecker.class.js` only polls GitHub Releases to *notify* about new versions — it doesn't actually download/apply updates in-app. Since the project already uses `electron-builder`, wiring in `electron-updater` (same ecosystem) for real auto-update would be a relatively low-friction addition.

## 10.4 Suggested Starting Points

Remaining low/medium effort items, roughly in order:
1. **Editable shortcuts UI** — `settings.json` is already editable in-app; `shortcuts.json` is the real remaining hand-edit-only gap.
2. **Tab reordering** — now understood to need real port/index decoupling, so treat as its own scoped task rather than bundling it with quick wins.
3. **SSH profile manager** — Medium effort, common terminal-emulator feature that's currently missing.

The plugin/module system is the most-requested item historically, but requires a real architecture change (a stable module API, sandboxing considerations, etc.) rather than an incremental feature, so it's a bigger undertaking than the others on this list.

