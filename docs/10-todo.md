# 10. Feature TODO / Proposals

A list of features worth considering for future work, gathered by researching community requests (GitHub issues/discussions on the archived upstream repo) and by direct analysis of the current codebase.

> Completed items are no longer listed here in detail — see git history / release notes (in-terminal search, tab renaming, session restore, editable shortcuts UI, tab reordering, SSH profile manager, Dracula theme, network interface selector, volume control, lock screen, a11y first pass, real in-app auto-update, the two bugs fixed in 10.0 below, and the fork migration/release pipeline itself).

## 10.1 Priority Order (remaining work, easiest first)

Roughly sequenced by how self-contained/low-risk each item is, not by user impact.

1. ~~**"Preferences" menu item does nothing**~~ — ✅ done.
2. ~~**Boot title shift** (layout jump on boot)~~ — ✅ done.
3. ~~**On-screen keyboard show/hide toggle**~~ — ✅ done, see below.
4. **Accessibility — remaining gaps** (10.3): file browser, on-screen keyboard, fuzzy finder/process list. Medium-high, but incremental (one module at a time, same pattern as the completed first pass).
5. **Theme editor GUI** (10.2) — Medium-high, self-contained (new settings panel), no architecture change needed.
6. **Program-launcher tab** (10.4) — High. Needs per-platform installed-app discovery (Windows registry/Start Menu, macOS `/Applications`, Linux `.desktop` files) before any UI work.
7. **Plugin / external module system** (10.2) — High. Real architecture change (the 18 modules are currently hardcoded).
8. **Split panes** (10.3) — High. Needs a new layout engine.

## 10.0 Recently Fixed (this pass)

| Bug | Fix |
|---|---|
| ~~"Preferences" menu item does nothing when clicked~~ | Fixed — `registerApplicationMenu()` in `src/_boot.js` now sets a real `Menu.setApplicationMenu()` (macOS app-menu item + Windows/Linux File-menu item, both `CmdOrCtrl+,`) that sends an `open-settings` IPC message to the renderer, which calls the existing `window.openSettings()`. |
| ~~Slight upward shift right after the "eDEX-UI" boot title box appears~~ | Fixed — `displayTitleScreen()` in `src/_renderer.js` now reserves the title's full 5px border on all four sides (three sides transparent) starting from the first inline-style step, so the following step only changes border-*color*, never border-*width/sides*. Removes the layout height jump previously caused by a top border appearing out of nowhere. |
| ~~On-screen keyboard show/hide toggle (10.4)~~ | Done — a `⌨` button fixed at the bottom of the screen (always visible/clickable regardless of keyboard state, unlike a control placed inside the keyboard itself) and a new `TOGGLE_KEYBOARD` app shortcut (default `Ctrl+Shift+B`) both call `window.toggleKeyboard()` in `src/_renderer.js`. Toggling adds/removes a new `kb_collapsed` CSS class (opacity/transform slide-down, independent of the boot-only, forward-only `animation_state_1`/`2` reveal classes - see `docs/02-architecture.md`), then applies `display:none` once the transition finishes so the keyboard's flex-layout space is actually reclaimed rather than just left invisible. Persisted via a new `settings.keyboardHidden` field, so a hidden keyboard stays hidden across restarts (`initUI()` skips the reveal animation/sound entirely in that case, rather than playing it and immediately hiding it again).

## 10.2 Long-Requested by the Community (never implemented upstream)

| Feature | Description | Source |
|---|---|---|
| **Theme editor GUI** | Themes currently require hand-editing raw JSON. An in-app tool with color pickers/live preview would lower the barrier to making custom themes. | [Discussion #1028](https://github.com/GitSquared/edex-ui/discussions/1028), [Discussion #481](https://github.com/GitSquared/edex-ui/discussions/481) — a recurring request |
| **Plugin / external module system** | The 18 modules are currently hardcoded into the app. Users have asked for a way to write and load their own modules (e.g. a Git GUI, home-automation integration). | [Discussion #334](https://github.com/GitSquared/edex-ui/discussions/334) |

## 10.3 Gaps Found via Direct Codebase Analysis

| Feature | Description | Estimated effort |
|---|---|---|
| **Split panes** | Only tabs exist today; no way to view multiple terminals side-by-side in one screen. | High (needs a new layout engine) |
| **Accessibility (a11y) improvements — remaining gaps** | The first pass (see 10.0) covered modals, the shell tab bar, and the newest settings/shortcuts/SSH-profile UIs. Still not covered: the **file browser** (`classes/filesystem.class.js` - file/folder entries are click-only `<div>`s, no keyboard navigation or `role="grid"`/`role="listbox"` semantics), the **on-screen keyboard** (`classes/keyboard.class.js` - a real hardware keyboard already bypasses it, but it has no ARIA semantics for anyone using a switch/assistive input device), and the **fuzzy finder** / **process list** / other smaller modules (icon-only or click-only controls scattered throughout). No actual screen-reader testing (VoiceOver/NVDA) has been done - the changes so far are markup/semantics believed-correct against the WAI-ARIA APG patterns, not verified with real assistive tech. | Medium-high |

## 10.4 User-Requested Features (Not Yet Scoped)

| Feature | Description | Effort |
|---|---|---|
| **Program-launcher tab shown when the keyboard is collapsed** | Requested alongside the now-done show/hide toggle (see 10.0): when the on-screen keyboard is hidden, show a tab in its place that launches an installed program (one tab/program for a first version). This is a materially different, much bigger piece of work than the toggle itself - it needs **cross-platform installed-application discovery**, which has no shared mechanism (Windows: Start Menu shortcuts/registry, macOS: scanning `/Applications` for `.app` bundles, Linux: parsing `.desktop` files under `/usr/share/applications` and similar) before a single `shell.openPath()`/`child_process.spawn()` call can actually launch anything. Worth confirming intent before scoping further - pairing a program launcher specifically with the keyboard-collapse state is an unusual coupling (why not a standalone launcher, reachable independent of keyboard visibility?) - noted here rather than assumed. | High (new OS-integration surface, one code path per platform, before any UI work even starts) |

## 10.5 Suggested Starting Points

All low/low-medium-effort items are now done (see 10.0 above). Next up per the priority order in 10.1: the accessibility gaps are the lowest-effort item left (incremental, one module at a time, same pattern as the completed first pass). What follows it - the theme editor, the program launcher, the plugin system, and split panes - each grow toward "real architecture change," roughly in that order.


