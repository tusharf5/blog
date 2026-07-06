# Theme Guide — Neobrutalism

This blog uses a **neobrutalist** visual language: cream paper, near-black ink,
vivid flat accents, **thick borders + hard offset shadows**, sharp corners, and
chunky bold headings — while keeping the article body **highly readable**.

The golden rule: **bold chrome, calm body.**
Structural/interactive elements (header, cards, callouts, code blocks, tables,
images, buttons) get the full brutalist treatment. Running prose stays clean —
no borders, no shadows, generous line-height, high contrast.

---

## 1. Architecture

Everything visual flows through **CSS custom properties** (design tokens). You
almost never hardcode a color or shadow in a component — you consume a token.

| File                                    | Role                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `src/styles/components/_global.scss`    | **All tokens** (`:root` = light, `body.dark-mode` = dark) + base element defaults |
| `src/styles/components/_header.scss`    | Nav bar + dark-mode toggle switch                                                 |
| `src/styles/components/_home.scss`      | Home post-list layout (card spacing)                                              |
| `src/styles/components/_post-card.scss` | Post cards + "read more" button                                                   |
| `src/styles/components/_post.scss`      | Article typography (headings, callouts, code, tables, images)                     |
| `src/styles/components/_footer.scss`    | Like button + share/follow buttons                                                |

Entry points: `global.scss` (loaded on every page), `home.scss` (index),
`post.scss` (articles). Dark mode is toggled by adding `body.dark-mode`
(handled in `DarkModeToggle.astro`, persisted in `localStorage.darkMode`).

**To change the look, edit tokens first.** Only drop into a component partial
for structural/layout tweaks.

---

## 2. The neobrutalist primitives

These are the signature moves. Use the tokens — do not reinvent per component.

```scss
--border: #111; /* light mode; #ece7da in dark */
--border-width: 3px;
--shadow-color: #111; /* light mode; #000 in dark */
--shadow-offset: 4px;
--shadow: 4px 4px 0 var(--shadow-color); /* hard, NO blur */
--shadow-lg: 7px 7px 0 var(--shadow-color); /* hover-lifted */
```

**A brutalist block** =

```scss
border: var(--border-width) solid var(--border);
box-shadow: var(--shadow);
border-radius: 0; /* sharp corners, always */
background: var(--card-bg); /* or a flat accent/tint */
```

**Hover "lift"** (cards, toggle) — move up-left, grow the shadow:

```scss
transition:
  transform 0.12s ease,
  box-shadow 0.12s ease;
&:hover {
  transform: translate(-3px, -3px);
  box-shadow: var(--shadow-lg);
}
```

**Hover "press" then click** (buttons) — lift on hover, sink on `:active`:

```scss
&:hover {
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 var(--shadow-color);
}
&:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 var(--shadow-color);
}
```

### Non-negotiables

- **No blur** in shadows — offset only (`Xpx Ypx 0 color`).
- **No gradients** — flat fills only.
- **No rounded corners** on chrome — `border-radius: 0`.
- **No soft/ambient box-shadows** or glows.
- Prose text never gets a border or shadow.

---

## 3. Color tokens

Accents are shared across both modes (they stay vivid). Only surfaces, ink,
borders, and shadows flip between light and dark.

### Accent palette (both modes)

| Token             | Value               | Used for                                      |
| ----------------- | ------------------- | --------------------------------------------- |
| `--accent-yellow` | `#ffd23f`           | primary accent, buttons, h1 bar, table header |
| `--accent-pink`   | `#ff5c7a`           | h3/h4 marks, danger callout                   |
| `--accent-blue`   | `#4dabf7`           | h2 bar, toggle track, primary callout         |
| `--accent-lime`   | `#a3e635`           | success callout                               |
| `--accent`        | `= --accent-yellow` | the current primary accent                    |

> Accent fills are always light/vivid, so text placed on an accent (buttons,
> table header) is hardcoded dark `#111` — do **not** use `var(--border)` for
> that text, or it turns light-on-yellow in dark mode.

### Surfaces & text

| Token             | Light     | Dark      | Purpose                        |
| ----------------- | --------- | --------- | ------------------------------ |
| `--body-bg`       | `#faf4e6` | `#1a1a1a` | page background                |
| `--card-bg`       | `#fffdf5` | `#242424` | raised surfaces (cards, chips) |
| `--color`         | `#1a1a1a` | `#ece7da` | body ink                       |
| `--heading-color` | `#111`    | `#f7f3e8` | headings                       |
| `--h6-color`      | `#6b6b6b` | `#9a948a` | muted (h6)                     |
| `--anchor-color`  | `#1565c0` | `#74c0fc` | links                          |
| `--footer-color`  | `#1a1a1a` | `#ece7da` | footer text                    |
| `--border`        | `#111`    | `#ece7da` | all structural borders         |
| `--shadow-color`  | `#111`    | `#000`    | all hard shadows               |

### Code

| Token                   | Light                  | Dark      | Purpose                             |
| ----------------------- | ---------------------- | --------- | ----------------------------------- |
| `--pre-bg`              | `#1c2022`              | `#1c2022` | code-block background (always dark) |
| `--code-bg`             | `#ffe9a8`              | `#33302a` | inline-code chip background         |
| `--inline-code-color`   | `#8a4b00`              | `#ffd23f` | inline-code text                    |
| `--code-line-highlight` | `rgba(255,210,63,.14)` | —         | highlighted line in code block      |

### Callout tints (flat washes, dark readable text)

| Variant | Accent | Light bg  | Dark bg   |
| ------- | ------ | --------- | --------- |
| primary | blue   | `#d7ecff` | `#17303f` |
| danger  | pink   | `#ffdfe6` | `#3d1f27` |
| success | lime   | `#e7f7c6` | `#24331a` |
| warning | yellow | `#fff1bf` | `#3a3320` |
| neutral | grey   | `#ede8da` | `#2a2a2a` |

Tables use `--table-bg` (zebra rows) and `--table-border` (= `--border`).

---

## 4. Typography

Fonts are **self-hosted via `@fontsource`** — imported in
`src/components/BaseHead.astro` (loads on every page), so there are **no
external `gstatic.com` requests** and no layout shift. Only the weights below
are loaded; adding a new weight means adding an `@fontsource/<font>/<w>.css`
import there.

| Role     | Font               | Token                   | Loaded weights |
| -------- | ------------------ | ----------------------- | -------------- |
| Headings | **Space Grotesk**  | `--heading-font-family` | 500, **700**   |
| Body     | **Inter**          | `--font-family`         | 400, 500, 700  |
| Code     | **JetBrains Mono** | `--code-font-family`    | 400, 700       |

> Space Grotesk's heaviest cut is 700 — headings are bold-700, not 800.
> Keep every heading/bold weight at **700** (not 800), otherwise the browser
> faux-bolds. This applies to headings, `strong`/`b`, table headers, and card
> titles.

The heading font is applied once on the base `h1..h6` rule in `_global.scss`,
so both article headings and post-card titles inherit Space Grotesk.

| Element      | Size             | Weight | Signature mark                                 |
| ------------ | ---------------- | ------ | ---------------------------------------------- |
| h1           | 2.35em, centered | 700    | yellow **bordered bar** underline (`h1:after`) |
| h2           | 1.8em            | 700    | thick **blue left border** (10px)              |
| h3           | 1.5em            | 700    | solid **pink square** (`h3:before`, 12×12)     |
| h4           | 1.25em           | 700    | solid **pink bar** (`h4:before`, 12×6)         |
| h5           | 1em              | 700    | —                                              |
| h6           | 1em              | 700    | muted color                                    |
| body `p`     | base             | 400    | Inter, line-height 1.8                         |
| links        | —                | 500    | 2px underline, 3px accent underline on hover   |
| `strong`/`b` | inherit          | 700    | bold Inter (kept in flow, readable)            |

Base type: `--font-size: 17px`, body `18.5px`, `--max-width: 760px` (prose
measure — tightened for readability; widen if you prefer a broader column).

---

## 5. Component patterns

**Card** (`.post-snippet`) — bordered surface, hover-lift, button inside:

```scss
background: var(--card-bg);
border: var(--border-width) solid var(--border);
box-shadow: var(--shadow);
padding: 22px 26px;
&:hover {
  transform: translate(-3px, -3px);
  box-shadow: var(--shadow-lg);
}
```

**Button** (`.readmore`, footer share/follow) — accent fill, dark text, press:

```scss
color: #111; /* dark text on vivid accent */
background: var(--accent);
border: var(--border-width) solid var(--border);
box-shadow: 3px 3px 0 var(--shadow-color);
text-transform: uppercase;
font-weight: 700;
/* + hover-lift / :active-press from §2 */
```

**Callout** (`.post-note-box.{variant} + blockquote`) — flat tint + border + shadow:

```scss
border: var(--border-width) solid var(--border);
box-shadow: var(--shadow);
background: var(--blockquote-bg-color-primary); /* swap per variant */
color: var(--blockquote-color-primary); /* stays dark/readable */
```

**Code block** (`.markdown-body > pre`) — dark bg, border, hard shadow, sharp.
**Inline code chip** (`.markdown-body :not(pre) > code`) — `--code-bg` fill,
2px border, `--inline-code-color` text. The `:not(pre) > code` selector applies
the chip to inline code **everywhere** (paragraphs, lists, tables) but never to
code-block contents.

**Table** — `border-collapse`, `--border` grid, hard shadow, **accent header
row** (`thead tr` bg = `--accent`, cells `#111` bold), zebra via `--table-bg`.

**Toggle switch** (`.toggle-track`) — bordered track with hard shadow, square
bordered thumb; track = blue (light state) / yellow (`.toggled`, dark state).

**Expandable** (`.post-expandable`, `<Expandable title="…">` → `<details>`) —
`--card-bg` card with thick border + hard shadow, sharp corners. Summary uses the
**heading font** (Space Grotesk 700) with a **square accent `+/–` chip**
(`summary:after`, dark text on `--accent`, flips to `-` on `[open]`); `[open]`
adds a thick `--border` divider under the summary. Its content sits inside
`.markdown-body`, so it **reuses the global** chip / code-block / table /
blockquote treatment — the only per-component rule is the nested `<pre>`
(mirrors `& > pre`, since that global rule targets direct children only). Don't
give it its own inline-code or callout styles.

---

## 6. Recipes

**Change the primary accent** → edit `--accent` in `:root` (e.g.
`--accent: var(--accent-lime)`). Buttons, h1 bar, and table headers follow.

**Add a new accent** → add `--accent-<name>: #hex` in `:root` (it inherits into
dark automatically since accents aren't overridden there).

**Add a callout variant** → (1) add `--blockquote-color-<name>` +
`--blockquote-bg-color-<name>` tokens (light + dark) in `_global.scss`;
(2) add a `&.<name> + blockquote { ... }` block in `_post.scss` mirroring the
existing variants; (3) use `<Note type="<name>" />` before the blockquote.

**Tune the shadow depth** → change `--shadow-offset` (and `--shadow-lg`).
**Thicker/thinner borders** → change `--border-width`.
**Wider prose** → raise `--max-width`.

**Adjust dark mode** → edit only the deltas inside `body.dark-mode`. Anything not
overridden there inherits the light value (that's why accents stay vivid).

---

## 7. Do / Don't

**Do**

- Consume tokens; add new tokens rather than hardcoding.
- Keep hard shadows offset-only and corners square on chrome.
- Put dark text (`#111`) on accent fills; keep callout/body text readable.
- Keep prose clean and roomy — readability wins over decoration.

**Don't**

- Add blur, gradients, or rounded corners to structural elements.
- Use `var(--border)` for text sitting on an accent (flips in dark mode).
- Border or shadow running paragraphs.
- Style code-block contents with the inline-chip look (the `:not(pre)` selector
  already prevents this — keep it).
