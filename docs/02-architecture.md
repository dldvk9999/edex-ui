# 2. Architecture

## 2.1 Electron Main / Renderer Split

As with any Electron app, the codebase is split across two processes:

| Process | Entry point | Role |
|---|---|---|
| **Main** | `src/_boot.js` | Window creation, settings file (`settings.json`) loading/default generation, TTY (shell) backend process spawning, IPC routing, app lifecycle management |
| **Renderer** | `src/_renderer.js` → `src/ui.html` | Actual UI rendering, theme application, instantiation of each `classes/*.class.js` module, boot animation |
| **Multithread Worker** | `src/_multithread.js` | Distributes `systeminformation` library calls across separate `cluster` workers (so the renderer process doesn't stutter from heavy system queries) |

`nodeIntegration: true` and `contextIsolation: false` are set, meaning the renderer can directly use Node.js APIs (`require`, etc.) — an architecture characteristic of early-to-mid-generation Electron apps (not the contextBridge/preload pattern recommended by modern Electron security guidance).

## 2.2 Terminal Backend — Custom Websocket Protocol

The most central architectural feature: **the shell (TTY) and the UI are genuinely split into a server-client structure.**

- The `Terminal` class (`classes/terminal.class.js`) is an isomorphic class that operates in either `role: "server"` or `role: "client"` mode.
- **Server role** (Main process, instantiated in `_boot.js`): spawns a real OS process (bash/zsh/PowerShell) via `node-pty`, and starts a local `ws` (websocket) server to relay that pty's stdin/stdout.
- **Client role** (Renderer, loaded in `ui.html`): renders the terminal UI with `xterm.js` and connects to the above websocket server to exchange data.
- Tabs (multiple terminals) are implemented by spawning an additional independent websocket server on its own port for each tab (`extraTtys`, up to 4 extra tabs).
- This architecture is what caused a **Cross-Site WebSocket Hijacking (CSWSH)** vulnerability (`GHSA-q8xc-f2wf-ffh9`), which was patched by adding Origin validation to `verifyClient`.

## 2.3 IPC Patterns

Main ↔ Renderer communication uses standard Electron `ipcMain`/`ipcRenderer` channels. Conventions observed:

- **One-shot request-response**: `ipc.send("ttyspawn", requestId, cwd)` → `ipc.once("ttyspawn-reply-"+requestId, ...)` — a unique id (nanoid) is appended to the channel name per request to disambiguate responses. `cwd` is optional (used by session restore to reopen a tab at its saved directory — see `docs/10-todo.md` 10.0); when omitted, the new tab inherits the main tab's current cwd, same as before. (This pattern was introduced to prevent a race condition — the channel used to be shared, so concurrent requests could get their responses mixed up.)
- **Settings override (theme/keyboard hot-swap)**: `getThemeOverride`/`setThemeOverride`, `getKbOverride`/`setKbOverride` — state is stored in closure variables in main-process memory and queried on demand.
- **Logging**: the renderer sends `ipc.send("log", type, content)`, and main prints it via `signale` — this makes renderer-side errors visible in the main process console (the terminal it was launched from) as well.
- **Synchronous IPC**: `ipc.sendSync("closeExtraTtys")` — the one case where backend TTY cleanup must be awaited **synchronously** right before a UI reload (if it were async, the cleanup could be cut short by the page already unloading).

## 2.4 `systeminformation` Proxy

`_renderer.js`'s `initSystemInformationProxy()` creates a `window.si` JS `Proxy` object so that any `si.xxx(...)` call is automatically routed through IPC to the worker pool in `_multithread.js`. Call sites (each module class) simply call `window.si.cpu().then(...)` as if it were a local function, while under the hood it's actually distributed across multiple cores — effectively a transparent RPC layer.

## 2.5 Module (Class) System

Modules are loaded via plain `<script>` tags in `ui.html`, in a specific order — no bundler (Webpack/Vite/etc.) is used, somewhat dated even by 2019-era standards. Each class follows this shape:

```js
class Foo {
    constructor(parentId, opts) { ... }
    someMethod() { ... }
}
module.exports = { Foo };
```

The `module.exports` is included so the class is loadable both via `require()` in a Node context (nodeIntegration) and as a global via a plain `<script>` tag (which registers the global `class Foo`) — a dual-access approach.

All 18 classes live in `src/classes/*.class.js`:

| Class | File size | Role |
|---|---|---|
| `Terminal` | ~24K | Terminal server/client (core) |
| `Keyboard` | ~48K (largest) | On-screen keyboard, layout rendering |
| `FileSystem` | ~40K | File browser, CWD tracking, icon matching |
| `Netstat` | ~12K | Network connection monitoring, GeoIP lookup |
| `LocationGlobe` | ~12K | 3D globe (built on encom-globe) |
| `Toplist` | ~12K | Process list (`top`-like) |
| `CpuInfo` | ~8K | CPU usage graph |
| `MediaPlayer`, `Modal`, `FuzzyFinder` | ~8K | Media player, modal dialogs, Ctrl+Shift+F fuzzy search |
| `Clock`, `ConnInfo`, `RamWatcher`, `SysInfo`, `HardwareInspector`, `DocReader`, `AudioFx`, `UpdateChecker` | 4-8K | Various smaller feature-specific modules |
