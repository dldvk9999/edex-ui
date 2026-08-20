# 9. Dependency Summary

## root `package.json` — Build Toolchain

- `electron` `^12.1.0`
- `electron-builder` `^23.6.0`
- `terser` `^5.9.0` (JS minification)
- `clean-css` `5.2.1` (CSS minification)
- `node-json-minify` `1.0.0`
- `mime-types` `^2.1.33`
- `node-abi` `2.30.1`
- (optional) `cson-parser` `4.0.9`

## `src/package.json` — Runtime Dependencies

- **Terminal**: `xterm`, `xterm-addon-attach`, `xterm-addon-fit`, `xterm-addon-ligatures`, `xterm-addon-webgl`, `node-pty`, `nan`
- **Electron integration**: `@electron/remote`, `electron-updater`
- **Networking**: `ws`, `https-proxy-agent`, `geolite2-redist`, `maxmind`
- **System information**: `systeminformation`, `which`, `username`, `shell-env`
- **UI/design**: `augmented-ui`
- **Media**: `howler`, `pdfjs-dist`
- **Utilities**: `color`, `nanoid`, `pretty-bytes`, `signale`, `smoothie`, `tail`
- (optional, macOS) `osx-temperature-sensor`

## Category / Convention Catalog

| Category | Summary |
|---|---|
| **Language** | JavaScript (ES6 classes), HTML, CSS — no TypeScript |
| **Runtime** | Electron 12 (Chromium + Node.js) |
| **Architectural patterns** | Main/renderer process split, custom websocket protocol (terminal), request-response IPC, Proxy-based transparent RPC (`systeminformation`) |
| **Build tooling** | None (no bundler); packaged via `electron-builder`, with only simple minification via `terser`/`clean-css` |
| **Styling system** | Vanilla CSS + a CSS-custom-property-based theming engine, vh/vw units |
| **Native dependencies** | `node-pty` (required), `osx-temperature-sensor` (macOS optional) |
| **Static analysis/linting** | None (conventions are maintained purely by habit) |
| **Testing** | None (`snyk test` only, a dependency vulnerability scan) |
| **Internationalization (i18n)** | None — UI text is hardcoded in English, though keyboard layouts cover 19 language regions |
| **Platform support** | Linux (x64/ia32/arm64/armv7l), macOS (x64/arm64), Windows (x64/ia32) |
