# 7. Security Notes

- **CSWSH vulnerability (patched)**: the terminal websocket server originally did not validate the Origin header, allowing a malicious website — via a user's browser — to inject arbitrary commands into the local shell (`GHSA-q8xc-f2wf-ffh9`). Patched by having `verifyClient` only allow connections with no Origin header or an Origin of `file://`.
- **`nodeIntegration: true` + `contextIsolation: false`**: the renderer has direct access to Node APIs, which inherently widens the attack surface — if the renderer were ever to load arbitrary remote content, that would lead directly to RCE. `will-navigate`/`new-window` handlers block loading external URLs in-app, but the underlying architecture is fundamentally different from the isolated contextBridge pattern recommended by modern Electron security guidance.
- A **`SECURITY.md`** file exists in the repository root, documenting the vulnerability-reporting process.
