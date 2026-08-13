# 5. Design & Theming System

## 5.1 Theme JSON Schema

```json
{
  "colors": {
    "r": 170, "g": 207, "b": 209,
    "black": "#000000",
    "light_black": "#05080d",
    "grey": "#262828",
    "red": "...", "yellow": "..."
  },
  "cssvars": {
    "font_main": "United Sans Medium",
    "font_main_light": "United Sans Light"
  },
  "terminal": {
    "fontFamily": "Fira Mono",
    "cursorStyle": "block",
    "foreground": "#aacfd1",
    "background": "#05080d",
    "cursor": "#aacfd1",
    "cursorAccent": "#aacfd1",
    "selection": "rgba(170,207,209,0.3)",
    "colorFilter": ["negate()", "..."]
  },
  "globe": {
    "base": "#000000", "marker": "#aacfd1",
    "pin": "#aacfd1", "satellite": "#aacfd1"
  },
  "injectCSS": "/* arbitrary CSS string */"
}
```

- `colors.r/g/b` is the app-wide accent color's RGB value — recomposed in CSS as `rgb(var(--color_r), var(--color_g), var(--color_b))`, allowing free opacity adjustments
- `_renderer.js`'s `window._loadTheme()` reads this JSON and dynamically injects a `<style class="theming">` tag into `<head>` — no CSS-in-JS library is used, just plain string-template assembly
- Fonts are loaded at runtime via the `FontFace` Web API (each theme can technically specify different fonts, though in practice only 4 bundled fonts — Fira Code/Mono, United Sans Light/Medium — are ever combined)
- A `window._purifyCSS()` helper escapes values before interpolation (apparently to guard against CSS injection)

## 5.2 Visual Design Language

- **Dark background + a single accent color + geometric bracket borders** form the core look and feel. Most themes pair a dark background with a monochrome cyan/amber/green-family accent color, giving a "retro-future HUD" style
- **Grid background** (`main.css`'s `body` — a `linear-gradient`-built grid pattern, evoking a "circuit board / blueprint" feel)
- Every panel title (`h3.title`) sports short bracket lines protruding left and right (via `::before`/`::after`) — a recurring detail shared across virtually all module stylesheets
- Even the scrollbar is themed to match the accent color (`::-webkit-scrollbar-*`)
- Theme variant naming conventions: `-notype` (no terminal typing effect), `-disrupted` (noise/glitch effect), `-ligatures` (font ligatures enabled), `-focus` (emphasizes a specific UI element), `-colorfilter` (color-filter demo)
