# 8. Known Structural Limitations

- **No build system for the frontend**: no Webpack/Rollup/Vite/etc. — front-end code relies on `<script>` tag load order in `ui.html`; reordering them incorrectly can break class references. `prebuild-minify.js` only minifies, it does not bundle.
- **Trade-offs of the all-vh/vw approach**: works fine within the standard 16:9-4:3 range, but requires dedicated media-query correction on extreme aspect ratios (21:9, 32:9 — see `extra_ratios.css`).
- **Legacy native build chain**: heavy reliance on the `node-gyp`/Python build toolchain means native addon compilation (node-pty, etc.) is fragile against even minor OS/Python/Node version bumps — most of the CI issues addressed in recent maintenance work fall into this category.
- **No test suite**: the repository has no unit or integration tests. The `test` script in `package.json` runs `snyk test` (a dependency vulnerability scan), which does not verify actual code behavior.
- **Archived upstream project**: the original repository is unmaintained (publicly archived). This fork (`dldvk9999/edex-ui`) exists to continue patches and maintenance.
