# 10. Feature TODO / Proposals

A list of features worth considering for future work, gathered by researching community requests (GitHub issues/discussions on the archived upstream repo) and by direct analysis of the current codebase. None of these are implemented yet.

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
| **In-app settings UI** | `settings.json`/`shortcuts.json` must currently be edited by hand in a text editor — there is no GUI settings panel at all. Likely the highest-impact usability improvement. | Medium-high (new module + IPC surface expansion) |
| **In-terminal search (Find)** | `xterm.js` officially supports `xterm-addon-search`, but this project doesn't use it. Would let users search terminal scrollback for text. | Low (just wire up an existing addon) |
| **Session/layout save & restore** | Open tabs and their CWDs are lost on every app restart. An option to restore the last session would help. | Medium |
| **Tab renaming / reordering** | Tabs are currently fixed-numbered; there's no way to give them a custom name. | Low |
| **SSH profile manager** | Save frequently-used SSH hosts for one-click connect — a common feature in terminal emulators that's missing here. | Medium |
| **Split panes** | Only tabs exist today; no way to view multiple terminals side-by-side in one screen. | High (needs a new layout engine) |
| **Accessibility (a11y) improvements** | No screen-reader support, no full keyboard-only navigation. | Medium-high |

## 10.3 Building on the Existing CI/Build Pipeline

- `updateChecker.class.js` only polls GitHub Releases to *notify* about new versions — it doesn't actually download/apply updates in-app. Since the project already uses `electron-builder`, wiring in `electron-updater` (same ecosystem) for real auto-update would be a relatively low-friction addition.

## 10.4 Suggested Starting Points

If picking a place to start, the best effort-to-impact ratio is likely:
1. **In-terminal search** — low effort, immediately useful, existing xterm.js addon does the heavy lifting.
2. **In-app settings UI** — higher effort, but addresses the single biggest usability gap (hand-editing JSON to change any setting).

The plugin/module system is the most-requested item historically, but requires a real architecture change (a stable module API, sandboxing considerations, etc.) rather than an incremental feature, so it's a bigger undertaking than the others on this list.
