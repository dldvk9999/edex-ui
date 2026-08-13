# eDEX-UI — Project Documentation

This directory contains a comprehensive analysis of the eDEX-UI codebase, split by category. It reflects the state of the `master` branch as of `2026-08` (post the `security-and-fixes` merge).

## Contents

| Document | Covers |
|---|---|
| [01-overview.md](./01-overview.md) | Project summary, top-level directory layout |
| [02-architecture.md](./02-architecture.md) | Main/renderer process split, terminal websocket protocol, IPC patterns, module system |
| [03-code-conventions.md](./03-code-conventions.md) | JavaScript style, naming conventions, async patterns, CSS conventions |
| [04-features.md](./04-features.md) | Detailed feature catalog (terminal, monitoring, filesystem, keyboard, customization, etc.) |
| [05-design-theme.md](./05-design-theme.md) | Theme JSON schema, visual design language |
| [06-build-and-deployment.md](./06-build-and-deployment.md) | Dual package.json structure, native modules, platform build targets, CI pipeline |
| [07-security.md](./07-security.md) | Security-relevant notes and known trade-offs |
| [08-known-limitations.md](./08-known-limitations.md) | Structural limitations worth knowing about |
| [09-dependencies.md](./09-dependencies.md) | Full dependency listing (build toolchain vs. runtime) |
