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

**To cut a release**: bump the version in **both** `package.json` and `src/package.json` (they're independent fields - see 6.1 - and `electron-builder` packages `src/`, so it's `src/package.json`'s version that actually matters for the build/publish; a `check-versions` CI job now fails loudly if they ever diverge again, see 6.5.1), merge to `master`, then draft (or directly publish) a GitHub Release with a `vX.Y.Z` tag matching that version and hit **Publish**. That `release: published` event is what triggers the five build jobs, each of which attaches its platform's binary to that same release directly - no manual artifact download/upload needed. Expect it to take on the order of 15-20 minutes for all five jobs to land assets (arm32/arm64 run under QEMU emulation and are the slowest).

`package.json`'s `build.publish` is an explicit object (`{"provider": "github", "owner": "dldvk9999", "repo": "edex-ui", "releaseType": "release"}`), not the `"github"` shorthand string. This matters: `electron-builder` defaults to treating a release as `draft` when deciding whether an *existing* GitHub Release is "compatible" to attach assets to, and silently **skips** uploading (`skipped publishing ... reason=existing type not compatible with publishing type ... existingType=release publishingType=draft`) if the release it finds isn't a draft - which a normally-published (non-draft, non-prerelease) release like the ones this project creates never is. The build step itself still exits 0 in that case, so this failure mode is invisible from CI status alone; `releaseType: "release"` makes `electron-builder` target/match a normal published release instead. (This was diagnosed and fixed in an earlier pass, likely covering what happened to `v2.2.9`, which also shipped with 0 assets - see 6.5.1 for a *different* release, `v2.3.1`, that failed for a completely unrelated reason despite this fix already being in place.)

### 6.5.1 Postmortem: v2.3.1 shipped with zero binaries attached

`v2.3.1`'s release ended up with 0 assets despite every build job reporting green - and stayed that way through several rounds of fixing *real, but ultimately unrelated* bugs before the actual root cause turned up. Recorded here mostly so the next debugging pass (if there is one) starts from the actual cause instead of retracing this one:

**The actual cause**: `package.json` and `src/package.json` each carry their own independent `"version"` field (see 6.1). The version bump commit for this release only touched the root `package.json` (`2.3.0` → `2.3.1`); `src/package.json` stayed at `2.3.0`. Since `electron-builder` packages `src/` (via `prebuild-src`), it read the app version as `2.3.0` for every single build attempt - built and versioned everything as `2.3.0`, correctly found the *existing*, already-populated `v2.3.0` release from days earlier, and **correctly, silently skipped it** as already-published (`electron-builder` has a safety check that won't touch a release published more than 2 hours ago). `v2.3.1` itself was never targeted by a single build. Every job stayed green throughout, because none of this is an error from `electron-builder`'s point of view - skipping an already-published release on purpose is the intended behavior, just aimed at the wrong tag entirely. Confirmed directly from a successful build's own log line: `publishing publisher=Github (owner: dldvk9999, project: edex-ui, version: 2.3.0)`, followed by `skipped publishing ... reason=existing release published more than 2 hours ago tag=v2.3.0 version=2.3.0`.

**Fix**: bumped `src/package.json` to `2.3.1` to match, and added a `check-versions` CI job (runs first, every other build job `needs:` it) that fails the whole workflow with a clear error if the two files' versions ever diverge again - turning this exact mistake into a loud, immediate CI failure instead of a silent, invisible-until-someone-checks-the-release-page one.

**What got fixed along the way that *wasn't* the actual cause** (real bugs, worth having fixed, just not this one):
- `PUBLISH_POLICY` was originally keyed off a tag `push` event rather than `release: published` (see the reasoning above `PUBLISH_POLICY`'s definition) - a genuine reliability improvement, unrelated to the version mismatch.
- An attempt to force `-c.publish.draft=false -c.publish.prerelease=false -c.publish.releaseType=release` as CLI overrides (chasing a theory that `package.json`'s persistent `releaseType` config wasn't reliably reaching the publish decision - plausible-looking given `electron-userland/electron-builder#2393`/`#8179`, but not what was actually happening here) turned out to be actively wrong: `draft`/`prerelease` aren't valid `GithubOptions` fields in `electron-builder@23.6.0` (only `releaseType` is), so passing them failed AJV schema validation before any build could even start, on every platform. Found via the actual job logs (GitHub Actions' API log endpoint redirects to Azure Blob Storage, unreachable from this project's own CI sandbox - screenshots from the GitHub mobile app were what actually surfaced these).
- Chasing that same theory, the Windows/macOS jobs got switched from `npm run <script> -- <args>` to invoking `electron-builder` directly, to sidestep what looked like `npm`'s script-argument-forwarding mangling the CLI flags (confirmed separately: `yargs` parses `-c.publish.releaseType=release` correctly in isolation, but something in `npm run --`'s forwarding broke it, landing a stray literal string as `-c`'s value that `electron-builder` then tried to open as a config *file* path, `ENOENT`). This "fix" broke the build outright, because `npm run build-windows`/`npm run build-darwin` aren't *just* invoking `electron-builder` - `npm`'s `pre`/`post` script convention means they also automatically run `prebuild-windows`/`postbuild-windows` (etc., see 6.1's `rsync`/`xcopy` + `prebuild-minify.js` + `npm install` dance that populates `prebuild-src`) before and after. Direct invocation skipped that silently, so `prebuild-src` never existed (`Application directory prebuild-src doesn't exist`).
- Both of the above were reverted once the real cause (version mismatch) was found - the CLI-override/direct-invocation detour ended up net-neutral once unwound, other than the `PUBLISH_POLICY` trigger change, which was kept.

**One more layer after the version fix**: even with `src/package.json` correctly bumped, a `workflow_dispatch` backfill still skipped every asset - `GitHub release not created reason=existing release published more than 2 hours ago tag=v2.3.1 version=2.3.1`. `electron-publish`'s GitHub publisher has a built-in safety check that refuses to touch a release published more than 2 hours ago (presumably to guard against accidentally overwriting an old, unrelated release) - overridable via the `EP_GH_IGNORE_TIME` environment variable, now set unconditionally at the workflow level. This is exactly the situation `workflow_dispatch` exists for (re-running a publish well after the original `release: published` event), so leaving the 2-hour guard in place would have defeated the whole point of adding it.
