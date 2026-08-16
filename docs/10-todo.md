# 10. Feature TODO / Proposals

A list of features worth considering for future work, gathered by researching community requests (GitHub issues/discussions on the archived upstream repo) and by direct analysis of the current codebase.

## 10.0 Completed

| Feature | Notes |
|---|---|
| ~~In-terminal search (Find)~~ | Done — `xterm-addon-search` wired into the `Terminal` client class, bound to `Ctrl+Shift+G` via a new `TerminalSearch` modal. See `src/classes/terminalSearch.class.js`. |
| ~~Tab renaming~~ | Done — double-click a shell tab to give it a custom name via a rename modal (`window.renameShellTab`/`window.tabNames` in `src/_renderer.js`). Custom names survive process/cwd changes but are **not persisted across app restarts** — see 10.2 below, this was split out as a separate follow-up rather than done as part of the same change. |
| ~~Session/layout save & restore~~ | Done — opt-in via the new `restoreSession` setting (off by default, toggleable from the in-app Settings editor or by hand-editing `settings.json`). On every tab open/close/rename and on unload, the renderer writes `lastSession.json` (main tab cwd, each open extra tab's cwd + custom name, and the focused tab). On next launch, if enabled: `_boot.js` reads it before spawning the main tty to restore its cwd, and `_renderer.js` recreates extra tabs (1-4) at their saved cwd/name via an extended `ttyspawn` IPC call (now accepts an optional target cwd, falling back to the pre-existing "inherit main tab's cwd" behavior when omitted). Custom tab names (10.0 above) are restored as part of this. |
| ~~Editable shortcuts UI~~ | Done — the shortcuts help screen (`Ctrl+Shift+K`, `window.openShortcutsHelp` in `src/_renderer.js`) is now a live editor instead of a read-only listing. App-type (built-in action) rows allow editing trigger + enabled; custom shell-command rows are fully editable and can be added/removed via `window.addCustomShortcutRow`. "Save to Disk" (`window.saveShortcuts`) rewrites `shortcuts.json` and re-registers shortcuts immediately (`globalShortcut.unregisterAll()` + `registerKeyboardShortcuts()`), no reload needed. `registerKeyboardShortcuts` also gained a try/catch per entry so one malformed accelerator (now user-typable, previously only ever hand-edited by technical users) can't take the rest down with it. |
| ~~Tab reordering~~ | Done — extra tabs (slots 1-4) can be drag-and-dropped into a new order via native HTML5 drag & drop (`window.tabDragStart`/`tabDragOver`/`tabDrop`/`tabDragEnd`, `window.renderTabOrder` in `src/_renderer.js`). The main tab (slot 0) is pinned first and isn't reorderable - this sidestepped most of the port/index coupling risk called out below, since slot *identity* (port/process/name) never moves, only which DOM position it renders at. `window.tabOrder` (an array of slot numbers, persisted as part of `lastSession.json` when `restoreSession` is on) tracks visual order; `focusShellTab`'s active-tab highlighting was switched from `nth-child` CSS selectors (which assumed DOM position === slot number) to ID-based lookups so it stays correct regardless of reordering. `TAB_1`..`TAB_5`/`NEXT_TAB`/`PREVIOUS_TAB` shortcuts now resolve *visual position* to slot through `window.tabOrder` instead of assuming a fixed number-to-slot mapping. |
| ~~SSH profile manager~~ | Done — new `Ctrl+Shift+O` opens `window.openSSHProfiles`, an editable table of saved profiles (name/host/port/username/identity file, stored in `sshProfiles.json`) with a native file picker for the identity file (`window.browseSSHIdentityFile`). "Connect" builds an `ssh` command line, opens it in a free extra tab (spawning one if needed, named after the profile) via the new generic `window.runShellCommand` helper, and falls back to running in the currently focused tab if all 4 are already open. Writing to a *freshly spawned* tab needed a new `window._waitForSocketOpen` helper - `Terminal.write()`/`writelr()` call `this.socket.send()` directly, which throws if the websocket isn't `OPEN` yet, and `spawnShellTab`'s promise had been resolving right after construction, well before the handshake completes. |
| ~~More popular color-scheme themes (Dracula)~~ | Done — added `src/assets/themes/dracula.json` using the standard Dracula palette (`#282a36` background, `#bd93f9` accent). No code changes needed: themes are discovered dynamically at runtime (`fs.readdirSync(themesDir)` in `src/_renderer.js`, copied from `src/assets/themes` on first launch by `src/_boot.js`), so a new theme is just a JSON file matching the schema in `docs/05-design-theme.md`. |

## 10.1 Long-Requested by the Community (never implemented upstream)

| Feature | Description | Source |
|---|---|---|
| **Theme editor GUI** | Themes currently require hand-editing raw JSON. An in-app tool with color pickers/live preview would lower the barrier to making custom themes. | [Discussion #1028](https://github.com/GitSquared/edex-ui/discussions/1028), [Discussion #481](https://github.com/GitSquared/edex-ui/discussions/481) — a recurring request |
| **Plugin / external module system** | The 18 modules are currently hardcoded into the app. Users have asked for a way to write and load their own modules (e.g. a Git GUI, home-automation integration). | [Discussion #334](https://github.com/GitSquared/edex-ui/discussions/334) |
| **Network interface selector dropdown** | The netstat module only watches a single auto-detected interface; users want to pick one from settings. | [Issue #403](https://github.com/GitSquared/edex-ui/issues/403) |
| **Lock screen module** | A screensaver-style module that asks for a password and can trigger a warning/alarm after repeated failed attempts. | [Discussion #481](https://github.com/GitSquared/edex-ui/discussions/481), [Issue #464](https://github.com/GitSquared/edex-ui/issues/464) |
| **Volume control module** | Display and adjust system volume from within the UI. | [Discussion #481](https://github.com/GitSquared/edex-ui/discussions/481) |

## 10.2 Gaps Found via Direct Codebase Analysis

| Feature | Description | Estimated effort |
|---|---|---|
| **Split panes** | Only tabs exist today; no way to view multiple terminals side-by-side in one screen. | High (needs a new layout engine) |
| **Accessibility (a11y) improvements** | No screen-reader support, no full keyboard-only navigation. | Medium-high |

## 10.3 Building on the Existing CI/Build Pipeline

- `updateChecker.class.js` only polls GitHub Releases to *notify* about new versions — it doesn't actually download/apply updates in-app. Since the project already uses `electron-builder`, wiring in `electron-updater` (same ecosystem) for real auto-update would be a relatively low-friction addition. **Update:** the CI now actually publishes built binaries to GitHub Releases on a tag push (`--publish`, see `docs/06-build-and-deployment.md` 6.5) - this was a prerequisite (`electron-updater` needs published release assets to check against), not the `electron-updater` integration itself, which is still not done.

## 10.4 Suggested Starting Points

All low/medium effort items from this list are now done (see 10.0 above). What's left - split panes, accessibility, the plugin/module system, and full in-app auto-update (10.3) - are each either High effort (new layout engine, real architecture change) or a bigger cross-cutting undertaking, not incremental follow-ups.

