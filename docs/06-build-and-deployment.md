# 6. Build & Deployment Pipeline

## 6.1 Dual `package.json` Structure and Why

| | root `package.json` | `src/package.json` |
|---|---|---|
| Purpose | **Build toolchain** | **Runtime dependencies** (what the actual app code `require()`s) |
| Representative deps | `electron`, `electron-builder`, `terser`, `clean-css` | `xterm`, `node-pty`, `systeminformation`, `ws`, `nan`, etc. |
| electron-builder's `directories.app` | `prebuild-src` (generated at build time) | — |

At build time, `src/` is copied into `prebuild-src/` (rsync/xcopy) → minified via `prebuild-minify.js` (JS/CSS/JSON) → a **separate** `npm install` is run inside `prebuild-src` (this install produces the `node_modules` that actually ships in the app bundle) → `electron-builder` packages `prebuild-src`. The root's `node_modules` (electron-builder, etc.) never end up in the shipped distributable.

## 6.2 Native Modules

- **`node-pty`**: pty (pseudo-terminal) bindings, a native C++ addon → requires a `node-gyp` build, and must be rebuilt against Electron's V8/Node ABI (`npmRebuild: true`)
- **`osx-temperature-sensor`**: macOS-only optional dependency, for reading temperature sensors
- Both native modules depend on `nan` (Native Abstractions for Node) — pinned to `^2.20.0` in a recent maintenance pass for Node 18 V8 API compatibility (`GetBackingStore`). `node-pty`'s originally-resolved `nan@2.14.0` used the old `GetContents()` API, which fails to compile under Node 18+

## 6.3 Platform Build Targets

| Platform | Architectures | Output | Notes |
|---|---|---|---|
| Linux | x64, ia32, arm64, armv7l | `.AppImage` | ARM builds run under QEMU emulation inside dedicated Docker containers |
| macOS | x64, **arm64** (added in a recent maintenance pass) | `.dmg` | Unsigned (no code signing) — intentional, no Apple Developer certificate available |
| Windows | x64, ia32 | NSIS `.exe` installer | Allows changing the install path, deletes app data on uninstall |

## 6.4 CI (GitHub Actions) — `build-binaries.yaml`

Five parallel jobs: `build-linux`, `build-linux-arm32`, `build-linux-arm64`, `build-windows`, `build-darwin`. Each job carried several layers of legacy toolchain issues (all resolved in a recent maintenance pass):

- Node 14/18 pinning combined with per-OS native build tool (node-gyp) version mismatches
- Windows: pinned to the `windows-2022` runner image, and node-gyp was replaced wholesale with a modern version (9.x) to fix VS2022 detection
- macOS: worked around Python 3.12+/3.14 dropping `distutils` (via installing `setuptools`), worked around a missing `openssl_fips` gyp variable, and bumped `electron-builder` 22→23 to fix a hardcoded `/usr/bin/python` call that no longer exists on modern macOS runner images. Also intermittently fails with `hdiutil: couldn't eject "diskN" - Resource busy` while unmounting the built `.dmg` — a known flaky `electron-builder`/macOS-runner issue (Spotlight/`mdworker` holding the just-mounted volume open) unrelated to this project's own code; mitigated by disabling Spotlight indexing (`mdutil -a -i off`) before the build and wrapping the build itself in the same 3x retry pattern used for the arm32/arm64 jobs
- Common: replaced deprecated GitHub Actions (`actions/cache@v2`, `actions/upload-artifact@v2`, etc.) with their current major versions across the board
- arm32/arm64: QEMU-emulated `npm install` was only ever attempted once with no retry (the build step after it already had one) - wrapped it in the same 3x retry pattern and bumped npm's `fetch-retries`/`fetch-timeout` config, since ERR_SOCKET_TIMEOUT under emulation was a recurring failure

## 6.5 Publishing Releases

Every job's `electron-builder`/`npm run build-*` invocation now carries a `--publish ${{ env.PUBLISH_POLICY }}` flag. `PUBLISH_POLICY` (a workflow-level `env`, computed once from `github.event_name`/`github.ref`) resolves to `"always"` only when the workflow was triggered by a push of a tag matching `v*` (i.e. an actual release tag like `v2.3.0`), and `"never"` for every other trigger (ordinary branch pushes, PRs, `create` events) - so day-to-day CI runs never attempt to touch GitHub Releases. `package.json`'s `build.publish: "github"` tells `electron-builder` to publish to the GitHub repo it infers from `package.json`'s `repository` field, using the `GH_TOKEN` (`secrets.GITHUB_TOKEN`) already passed to every build step. The workflow declares `permissions: contents: write` so that token actually has upload rights.

To cut a release: create a GitHub Release with a `vX.Y.Z` tag (this pushes the matching git tag, which is what actually fires the publish-enabled build) - all five jobs build their platform's binary and electron-builder attaches it to that release directly, no manual artifact download/upload needed.

`package.json`'s `build.publish` is an explicit object (`{"provider": "github", "owner": "dldvk9999", "repo": "edex-ui", "releaseType": "release"}`), not the `"github"` shorthand string. This matters: `electron-builder` defaults to treating a release as `draft` when deciding whether an *existing* GitHub Release is "compatible" to attach assets to, and silently **skips** uploading (`skipped publishing ... reason=existing type not compatible with publishing type ... existingType=release publishingType=draft`) if the release it finds isn't a draft - which a normally-published (non-draft, non-prerelease) release like the ones this project creates never is. The build step itself still exits 0 in that case, so this failure mode is invisible from CI status alone; `releaseType: "release"` makes `electron-builder` target/match a normal published release instead.
