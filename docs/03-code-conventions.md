# 3. Code Conventions

## 3.1 JavaScript Style

- **ES6 class syntax** used throughout (no direct prototype-chain manipulation)
- **4-space indentation**, consistently
- **Semicolons used** (not relying on ASI)
- **Template literals** used extensively — for DOM string assembly, log messages, and most string composition
- **Arrow functions** are used broadly for callbacks/event handlers; regular methods use shorthand `methodName() {}` syntax
- **`var` is rarely used** — mostly `let`/`const`, but occasionally used at the top of a file's module scope (e.g. `var win, tty, extraTtys;` in `_boot.js`) seemingly to signal intent that "these will be reassigned later in this file"
- **String literals**: double quotes (`"`) by default, single quotes only when a literal `"` is needed inside the string — a naturally-occurring convention rather than one enforced by a linter/formatter
- **Comment style**: mostly `//` line comments, with a strong habit of referencing GitHub issue numbers (`// See #366`, `// see #904`, `// Support for custom color filters on the terminal - see #483`) — bug fixes and special-case handling are annotated with the originating issue so the "why" behind the code stays traceable
- **Error handling**: old-style `throw "string"` (throwing a raw string instead of an `Error` object) shows up regularly (`if (!opts.parentId) throw "Missing parameters";`) — not modern Node convention, but consistent across the codebase
- **No linter configured**: there is no `.eslintrc`, `.prettierrc`, or any other static style-enforcement tool in the repository. Stylistic consistency is maintained purely by convention

## 3.2 Naming Conventions

- **Class names**: PascalCase (`Terminal`, `FileSystem`, `LocationGlobe`)
- **File names**: `camelCase.class.js` pattern (`docReader.class.js`, `hardwareInspector.class.js`)
- **CSS file names**: feature-scoped `mod_` prefix (module-level stylesheets — `mod_clock.css`, `mod_netstat.css`, etc.); main layout files use `main.css`/`main_shell.css`
- **CSS custom properties**: snake-case-prefixed with underscores, e.g. `--color_r`, `--color_light_black`, `--font_main`
- **DOM ids/classes**: `mod_name` pattern (`mod_clock`, `mod_cpuinfo`) — each class maps 1:1 to a DOM module id
- **IPC channel names**: descriptive of their purpose (`ttyspawn`, `closeExtraTtys`, `getThemeOverride`), written in plain camelCase without kebab/snake conventions

## 3.3 Async Patterns

- Mostly `Promise`-based, with `async/await` mixed in where convenient (e.g. `app.on('ready', async () => {...})` in `_boot.js`)
- A callback-property event pattern is used pervasively: `term.onclosed = ...`, `term.onopened = ...`, `term.ondisconnected = ...` — instead of extending Node's `EventEmitter`, a lightweight observer pattern is hand-rolled by attaching callback properties directly to instances (apparently to keep external library dependence minimal)

## 3.4 CSS Conventions

- **Units are overwhelmingly `vh`/`vw`-based** (px is almost never used) — since the whole point of the fullscreen sci-fi interface is to scale proportionally with resolution/aspect ratio. This design choice is also what caused layout breakage on extreme aspect ratios (21:9, 32:9 — see issues #832, #776, #747), which was corrected in `extra_ratios.css` via additional media queries
- **A theming system built on CSS custom properties** (`--color_*`, `--font_*`) — component CSS never hardcodes colors; everything is referenced as `rgb(var(--color_r), var(--color_g), var(--color_b))`, so opacity/transparency can be layered freely
- A recurring "corner bracket" decorative pattern built with `<h3 class="title">` plus `::before`/`::after` pseudo-elements appears across many module stylesheets (a signature sci-fi-UI panel-border look)
- Even the scrollbar is themed to match the accent color (`::-webkit-scrollbar-*`)
- The third-party `augmented-ui` library (clipped-polygon panel shapes) is used in select places
