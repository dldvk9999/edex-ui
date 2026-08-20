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

Every job's `electron-builder`/`npm run build-*` invocation carries a `--publish ${{ env.PUBLISH_POLICY }}` flag. `PUBLISH_POLICY` (a workflow-level `env`) resolves to `"always"` only when the workflow was triggered by a **GitHub Release being published** (the `release` event, `types: [published]`) or by a manual `workflow_dispatch` run, and `"never"` for every other trigger (ordinary branch pushes, PRs, `create` events, and even a bare `git push` of a version tag with no Release attached) - so day-to-day CI runs never attempt to touch GitHub Releases. `package.json`'s `build.publish` tells `electron-builder` to publish to the GitHub repo it infers from `package.json`'s `repository` field, using the `GH_TOKEN` (`secrets.GITHUB_TOKEN`) already passed to every build step. The workflow declares `permissions: contents: write` so that token actually has upload rights.

**To cut a release**: bump the version (`package.json` + `src/package.json`), merge to `master`, then draft (or directly publish) a GitHub Release with a `vX.Y.Z` tag matching that version and hit **Publish**. That `release: published` event is what triggers the five build jobs, each of which attaches its platform's binary to that same release directly - no manual artifact download/upload needed. Expect it to take on the order of 15-20 minutes for all five jobs to land assets (arm32/arm64 run under QEMU emulation and are the slowest).

`package.json`'s `build.publish` is an explicit object (`{"provider": "github", "owner": "dldvk9999", "repo": "edex-ui", "releaseType": "release"}`), not the `"github"` shorthand string. This matters: `electron-builder` defaults to treating a release as `draft` when deciding whether an *existing* GitHub Release is "compatible" to attach assets to, and silently **skips** uploading (`skipped publishing ... reason=existing type not compatible with publishing type ... existingType=release publishingType=draft`) if the release it finds isn't a draft - which a normally-published (non-draft, non-prerelease) release like the ones this project creates never is. The build step itself still exits 0 in that case, so this failure mode is invisible from CI status alone; `releaseType: "release"` makes `electron-builder` target/match a normal published release instead.

### 6.5.1 Postmortem: v2.3.1 shipped with zero binaries attached

`v2.3.1`'s release ended up with 0 assets despite every build job reporting green. Root cause: at the time, `PUBLISH_POLICY` was keyed off `github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v...')` - i.e. a literal tag push - rather than the `release` event. Publishing a *new* release through GitHub's web UI creates the underlying git tag at the moment you click **Publish**, and that tag creation fires a `push` event for the tag ref essentially simultaneously with the `release` event GitHub also sends. Under the old rule, `push` alone was enough to set `PUBLISH_POLICY: always`, so the tag-push-triggered run attempted the actual publish - but relying on that incidental, GitHub-internal-implementation-detail `push` event (rather than the `release` event GitHub actually designed for this) turned out to be the less reliable of the two in practice.

`v2.3.0` shipped fine despite the exact same workflow file and the exact same `push`+`create` event pair firing (checked via the Actions API - it fired 5 times across several hours before that release finally got its 20 assets, most likely from earlier retries during that release's own troubleshooting). So the old push-based rule wasn't reliably broken, just fragile enough to fail silently on one attempt with no obvious cause from the Actions UI alone (every job green, `--publish always` exits 0 either way). Given `release: published` is the event GitHub documents specifically for "a release now exists, go build for it" and fires exactly once regardless of whether the tag pre-existed or was created by the publish action itself, it replaced the tag-push rule entirely rather than running alongside it - keeping both would just reintroduce the same two-runs-racing-to-attach-to-one-release shape that caused this in the first place. `workflow_dispatch` was added at the same time as a way to manually re-run a publish attempt (e.g. exactly this backfill-the-missing-binaries situation) without needing to delete and recreate a tag/release.
