# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

A single-page React app that turns a **customer's logo into a Slack sidebar theme
string**. Drop in a PNG/JPG, the app pulls the dominant colors, shows them as a
live fake-Slack sidebar, and hands you a comma-separated hex string to paste into
**Slack › Preferences › Sidebar › Custom theme**.

The user is Sergio (Slack Solution Engineer) prepping branded demo workspaces —
before a customer call, make the demo org look like the customer's brand in about
ten seconds, without opening a design tool. Everything runs **client-side in the
browser**: no backend, no API keys, no uploads leaving the machine. Deployed to
GitHub Pages at `https://scastaneda-eng.github.io/Sergio-Slack-Template-Generator`.

All of the logic lives in one file: `src/App.jsx` (~490 lines). There is no state
manager, no router, no component library.

## How the color extraction actually works

Pipeline, in order, all inside `src/App.jsx`:

1. **`handleFile(file)`** — validates before doing any work: must be `image/*`,
   `image/svg+xml` is explicitly rejected (canvas can't rasterize it for
   sampling), and files over `MAX_FILE_BYTES` (5 MB) are rejected. Then it reads
   the file with `FileReader.readAsDataURL` into `imagePreview` state.
2. **Hidden `<img>`** — the data URL is rendered into an off-screen
   `<img className="hidden-image" crossOrigin="anonymous">` at the bottom of the
   component. Its `onLoad` is the trigger for extraction; `onError` surfaces a
   CORS-aware message.
3. **`handleImageLoad()`** — calls `await getPalette(img, { colorCount: 4 })`
   from **colorthief v3**. Only `colorCount` is passed, so colorthief's defaults
   apply: `colorSpace: 'oklch'` (perceptual quantization, *not* the old RGB
   MMCQ), `quality: 10` (samples every 10th pixel), `ignoreWhite: true` (white
   pixels are skipped, so a logo on a white background still yields brand
   colors).
4. **`rgbToHex`** — each colorthief `Color` is unpacked via `color.array()` →
   `[r,g,b]` and formatted as uppercase `#RRGGBB`.
5. **Theme string** — `hexColors.join(', ')`. That's it. No reordering, no
   lightening/darkening, no dedupe. The order is exactly colorthief's palette
   order.

**Stale-response guard:** `uploadVersionRef` is incremented on every upload and
checked after every async boundary (`FileReader.onload`, `getPalette` resolve,
`catch`, `finally`). A slow extraction from a previous logo can't overwrite a
newer one. There is a regression test for this.

### The theme string format

Four hex values, comma-space separated, e.g.
`#3F0E40, #1164A3, #36C5F0, #ECB22E`. The UI labels the slots via the
`ROLES` constant:

| Slot | Role label | Where it shows in the preview |
|---|---|---|
| 1 | Background | sidebar column background (`previewBg`) |
| 2 | Active | selected-channel row (`previewSelected`) |
| 3 | Hover | labeled only — **not** used in the preview render |
| 4 | Accent | mention badge (`previewAccent`) |

Note the honest caveat: Slack's classic custom-theme string is longer than four
values (column bg, menu bg hover, active item, active item text, hover item, text
color, active presence, mention badge). This app emits the four dominant colors
and nothing else, and nothing in the repo validates the paste against a real
Slack client. Don't promise a customer a pixel-exact round-trip without checking
in Slack first.

### Contrast / accessibility handling

The extraction output is **never** adjusted for contrast — the hex values you copy
are raw colorthief output. Contrast is applied only to the *preview* and to a
*warning badge*:

- **`relLuminance(r,g,b)`** — WCAG sRGB relative luminance (the 0.03928 /
  linearization formula).
- **`contrastRatio(rgb1, rgb2)`** — `(Llighter + 0.05) / (Ldarker + 0.05)`.
- **`bestForeground(rgb)`** — picks `#FFFFFF` or Slack's near-black `#1D1C1D`,
  whichever scores higher against that background; returns `{ hex, ratio }`. Used
  for `sideFg`, `selectedFg`, `accentFg` so preview text stays legible.
- **`gradeContrast(ratio)`** — `>= 4.5` good, `>= 3.0` fair, else poor (WCAG AA
  normal / large text).
- **`themeReadability`** — takes the **worst** of the three foreground ratios and
  renders the "Good / Fair / Poor readability" pill with the numeric ratio.

So: the app *tells you* when a brand palette will be unreadable, it does not
*fix* it for you.

## Component map

```
index.html          Vite entry. Also holds an inline localStorage 'theme' →
                    data-theme script (see Gotchas — it is dead code).
vite.config.js      React plugin, base '/Sergio-Slack-Template-Generator/',
                    outDir 'dist', and the vitest config (jsdom, globals).
src/main.jsx        ReactDOM.createRoot + StrictMode. 11 lines.
src/App.jsx         Everything: validation, extraction, color math, all UI
                    (upload card, palette grid, theme string + copy, live
                    sidebar preview, readability pill). Inline SVG icons
                    (UploadIcon, CopyIcon) and a StepBadge subcomponent.
src/App.css         819 lines. Purple-gradient design system driven by CSS
                    custom properties on :root; .sp-* classes are the fake
                    Slack sidebar preview.
src/index.css       Lato webfont import + body/code base styles.
src/App.test.jsx    9 vitest tests: heading render, 5MB reject, SVG reject,
                    multi-file drop reject, happy-path palette, getPalette
                    throw, image onError/CORS, clipboard + aria-live, and the
                    stale-resolve race. colorthief is vi.mock'd.
src/setupTests.js   Imports @testing-library/jest-dom.
src/slack-app-icon.jpeg  Header logo (imported by App.jsx).
src/slack-logo.png       UNREFERENCED — nothing imports it.
public/             Copied verbatim: favicon.ico, logo192/512.png,
                    manifest.json, robots.txt, .nojekyll (keeps GitHub Pages
                    from running Jekyll).
```

## Running it

```bash
cd /Users/scastaneda/claude-projects/Sergio-Slack-Template-Generator
npm install
npm start          # or npm run dev — same thing, both are `vite`
```

Dev server is **Vite's default `http://localhost:5173`**, not `:3000`. The README
still says 3000; it is out of date.

```bash
npm test           # vitest run (one-shot, not watch)
npm run build      # vite build → dist/
npm run preview    # serve the built dist/ locally
```

## Build & deploy

- `dist/` is a **local build artifact and is gitignored** (`/dist` in
  `.gitignore`) — it is *not* committed. The copy on disk is whatever was last
  built locally. Never hand-edit it.
- Deploy is `npm run deploy` → `predeploy` runs `vite build`, then
  `gh-pages -d dist --dotfiles`. The `--dotfiles` flag exists so `.nojekyll`
  ships.
- **The live site is stale.** The `origin/gh-pages` branch still contains a
  Create-React-App-shaped build (`static/`, `asset-manifest.json`) from
  2026-04-27. Nothing has been deployed since the Vite migration.
- **`main` is 1 commit ahead of `origin/main`** — the migration commit
  `865517b Migrate from Create React App to Vite` is unpushed. Check
  `git status` / `git log main ^origin/main` before assuming the remote matches.

## History

The repo was bootstrapped with Create React App (`efd94a5 Initialize project
using Create React App`) and migrated to Vite in the most recent commit,
`865517b`. That swap replaced `react-scripts` with `vite` + `@vitejs/plugin-react`,
`react-scripts test` (Jest) with `vitest`, `build/` with `dist/`, and renamed
`.js` sources to `.jsx`.

`/Users/scastaneda/claude-projects/.archive-Sergio-Slack-Template-Generator-main-stale-cra`
is a separate, dead snapshot: a bare CRA scaffold (default spinning-React-logo
`App.js`, boilerplate CRA README, `firebase` dependency, `homepage` pointing at a
different repo name `Sergio-s-Project`), one commit, empty `node_modules`, and a
`package.json` with a **syntax error** (missing comma before `"predeploy"`). It
contains none of the theme-generator logic. Treat it as reference-only trash —
don't copy from it, don't try to fix it.

## Key files

| File | Why you'd open it |
|---|---|
| `src/App.jsx` | Any behavior change — extraction, validation, UI, color math |
| `src/App.test.jsx` | Add a test alongside any `handleFile` / `handleImageLoad` change |
| `src/App.css` | Visual work; `:root` custom properties are the theme knobs |
| `vite.config.js` | `base` must match the repo name, or Pages assets 404 |
| `package.json` | Scripts + the `homepage` GitHub Pages URL |
| `index.html` | Meta tags, manifest link, the dead data-theme script |

## Gotchas

- **`base` and repo name are coupled.** `vite.config.js` hardcodes
  `base: '/Sergio-Slack-Template-Generator/'` and `package.json` hardcodes the
  matching `homepage`. Rename the repo and both must change or the deployed site
  loads a blank page.
- **The dark/light theme script in `index.html` is dead code.** It reads
  `localStorage.theme` and sets `data-theme` on `<html>`, but no CSS in `src/`
  matches `[data-theme]` and no component reads it. There is no theme toggle.
- **`public/manifest.json` is still CRA boilerplate** — `"name": "Create React
  App Sample"`, `theme_color: #000000`. Cosmetic, but wrong.
- **README drift.** It claims SVG is supported (the code rejects it), says
  `npm start` opens port 3000 (it's 5173), and describes a React/CRA stack.
- **`accept` is wider than the docs.** The file input accepts
  `image/png,image/jpeg,image/webp`; drag-and-drop accepts any `image/*` except
  SVG.
- **colorthief v3 API, not v2.** It's the named async `getPalette(img, opts)`
  import — not `new ColorThief().getPalette(...)`. Colors are objects; use
  `.array()` (the tests mock exactly this shape). Two commits in history
  (`9233564`, `aeb27bf`) were fixes for getting this wrong.
- **Extraction is fired by the hidden image's `onLoad`,** not by the upload
  handler. If you refactor the hidden `<img>` away, extraction silently stops.
- **`src/slack-logo.png` is unused** (39 KB). The header uses
  `slack-app-icon.jpeg`.

## What you must NOT do

- Don't commit `dist/` or `node_modules/` — both are gitignored for a reason.
- Don't add a backend, an API key, or an upload endpoint. The whole value here is
  that a customer logo never leaves the browser; keep extraction client-side.
- Don't hand-edit files under `dist/` or push to `gh-pages` directly — deploy via
  `npm run deploy` so the branch stays machine-generated.
- Don't reintroduce `react-scripts`, CRA config, or Jest. The migration to
  Vite/vitest is deliberate and recent.
- Don't silently change the `colorCount: 4` / role ordering — the four-slot output
  is the product. If it changes, update `ROLES`, the preview mapping, and
  `src/App.test.jsx` together.
