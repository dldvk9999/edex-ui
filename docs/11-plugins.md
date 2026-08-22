# 11. Plugin System

Implements the long-requested plugin/external module system from
`docs/10-todo.md` 10.2 ([GitSquared/edex-ui discussion #334](https://github.com/GitSquared/edex-ui/discussions/334)):
a way to load your own code into eDEX-UI without editing its source.

## 11.1 Trust Model — Read This First

This is **not sandboxed**, and deliberately so. eDEX-UI already runs with
`nodeIntegration: true` / `contextIsolation: false` (see `docs/07-security.md`)
- every class in `src/classes/*.class.js` already has full Node access
(`require()`, filesystem, child processes, etc.) inside the renderer. A
plugin's `main.js` runs with exactly that same access, nothing more and
nothing less.

This introduces **no new attack surface**, because only plugins **you
yourself placed** in `userData/plugins` are ever loaded - never anything
fetched over the network, never anything bundled from an untrusted source.
The actual boundary that matters (per `docs/07-security.md`) is "does the
renderer ever load remote/attacker-controlled content" - it doesn't, and a
local plugin folder doesn't change that. Installing a plugin is exactly as
trusting an action as hand-editing `shortcuts.json` to run an arbitrary
shell command (already a supported, documented feature) or pasting someone
else's theme JSON into your themes folder - **only install plugins from
people/sources you trust**, the same way you would with either of those.

## 11.2 Plugin Folder Layout

Plugins live in `userData/plugins` (next to `themes/`, `keyboards/`,
`settings.json`, etc. - see `electron.app.getPath("userData")`). Unlike the
`themes`/`keyboards`/`fonts` folders, which are re-synced from `src/assets/*`
on *every* launch, `plugins` is created **once** and never touched again -
an app update will never silently overwrite or delete an installed plugin.

On first creation, a `README.md` and a disabled-by-default example plugin
(`example-hello-world/`) are dropped in as a starting reference.

Each plugin is a subfolder containing:

- **`plugin.json`** - the manifest:
  ```json
  {
      "name": "My Plugin",
      "version": "1.0.0",
      "description": "What it does.",
      "main": "main.js",
      "enabled": true
  }
  ```
  `main` is a path (relative to the plugin's own folder) to its entry
  script. `enabled: false` (or omitting it entirely defaults it to loaded -
  only an explicit `false` skips it) disables the plugin without needing to
  delete or move it.
- **The file `main` points to** - a CommonJS module exporting an `activate`
  function:
  ```js
  module.exports = {
      activate() {
          // Your plugin's setup code. `window` here is the exact same
          // global the rest of the renderer uses.
      }
  };
  ```

## 11.3 Loading

`window._loadPlugins()` (`src/_renderer.js`) runs once, at the very end of
`initUI()` - after every core module/global a plugin might reasonably want
(`window.mods`, `window.term`, `window.settings`, `window.theme`, the
`Modal` class, etc.) already exists. For each subfolder in `userData/plugins`
with a valid, `enabled`-or-unset `plugin.json`:

1. `require()`s the file `main` points to.
2. Stores it (manifest + the module itself) in `window.plugins[folderName]`.
3. Calls its exported `activate()`, if present.
4. Logs success/failure via the existing `ipc.send("log", ...)` channel
   (`docs/02-architecture.md` 2.3) - visible in the main-process console.

A single broken or throwing plugin is caught and logged, not allowed to
take the rest of the app down with it - the same defensive posture already
used for per-entry shortcut registration failures
(`registerKeyboardShortcuts` in `docs/10-todo.md` 10.0's "Editable
shortcuts UI").

## 11.4 What's Available to a Plugin

Nothing plugin-specific - by design, a `main.js` sees exactly what any
`src/classes/*.class.js` file already sees once loaded into the renderer.
Practically useful starting points:

- `window.mods` - every instantiated module (`window.mods.clock`,
  `window.mods.netstat`, etc.)
- `window.term[window.currentTerm]` - the active terminal
- `window.settings` / `window.theme` - current settings/theme objects
- `Modal` - to show your own dialogs, same as any built-in feature
- Node's `require()` - any of `src/package.json`'s runtime dependencies, or
  any of Node's own built-in modules

## 11.5 What This Doesn't Do (Yet)

- No permission/capability system - see 11.1, this is intentional given the
  app's existing trust model, not an oversight.
- No hot-reload - a plugin is only (re-)loaded on app start.
- No dependency isolation between plugins, or between a plugin and the
  app's own `node_modules` - a plugin's `require()` resolves against
  eDEX-UI's own installed packages, not a plugin-private set.
- No UI for browsing/installing/toggling plugins - `plugin.json`'s
  `enabled` field and moving folders in/out of `userData/plugins` by hand
  are the only controls, for now.
