---
name: Gestione Casa
description: A private household expense tracker — stock Bootstrap 5.3 "Minty", left deliberately unbranded.
colors:
  mint-teal: "#78c2ad"
  mint-teal-hover: "#66a593"
  mint-teal-active: "#609b8a"
  coral-blush: "#f3969a"
  success-green: "#56cc9d"
  info-cyan: "#6cc3d5"
  warning-yellow: "#ffce67"
  danger-coral: "#ff7851"
  neutral-light: "#f8f9fa"
  neutral-dark: "#343a40"
  body-text: "#888888"
  heading-text: "#5a5a5a"
typography:
  headline:
    fontFamily: "Montserrat, -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Montserrat, -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Montserrat, -apple-system, system-ui, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.6rem"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "1rem"
  4: "1.5rem"
  5: "3rem"
components:
  button-primary:
    backgroundColor: "{colors.mint-teal}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.mint-teal-hover}"
  button-primary-active:
    backgroundColor: "{colors.mint-teal-active}"
  button-danger:
    backgroundColor: "{colors.danger-coral}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.5rem"
  button-warning:
    backgroundColor: "{colors.warning-yellow}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.5rem"
  button-success:
    backgroundColor: "{colors.success-green}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.5rem"
  button-outline-light:
    backgroundColor: "transparent"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.25rem 0.5rem"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.body-text}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
---

# Design System: Gestione Casa

## Overview

**Creative North Star: "The Off-the-Shelf Utility"**

Gestione Casa is a private tool for one household, not a product being sold to anyone — so it spends zero effort disguising that it runs an unmodified Bootswatch theme ("Minty") on top of Bootstrap 5.3. There is no logo beyond a house glyph, no custom type ramp, no bespoke component library. The one deliberate choice was *which* stock theme to reach for: Minty's mint-teal-and-coral-blush palette and generously rounded corners already read as soft and approachable without anyone drawing a single custom shape. The system's honesty is the point — it looks exactly as designed as it is, which is: not much, on purpose.

Surfaces are flat, spacing follows Bootstrap's default scale untouched, and the only "custom" CSS in the whole app (`styles.css`) is a handful of overrides for things Bootstrap doesn't ship natively (a fixed-navbar offset, a loading overlay, two legacy fieldset/legend styles, chart container heights). Everything else — buttons, forms, tables, modals, pagination, the navbar — is react-bootstrap or hand-rolled Bootstrap markup used exactly as documented.

Light/dark mode is Bootstrap 5.3's built-in `data-bs-theme` color-mode switch, not a hand-tuned dark palette: the app only decides *when* to flip it (a header toggle, persisted in `localStorage`) and lets Bootstrap's own dark-mode color remapping do the rest.

**Key Characteristics:**
- Stock Bootstrap 5.3 + Bootswatch "Minty" theme, unmodified beyond a few structural CSS overrides.
- Mint teal primary, coral blush secondary — soft and approachable by virtue of the theme choice, not custom design work.
- Flat throughout: no shadows, no elevation system, no glassmorphism.
- Montserrat for headings/buttons/nav/legends; the system's default sans-serif stack for body text and form values.
- Light/dark handled entirely by Bootstrap's native color-mode attribute.

## Colors

The palette is Minty's default role set, used exactly as Bootswatch ships it — no custom shades were introduced.

### Primary
- **Mint Teal** (`#78c2ad`): the app's one strong accent — navbar background, primary buttons ("new expense", "save"), active nav/pagination states, links.

### Secondary
- **Coral Blush** (`#f3969a`): dropdown/pagination hover-active accents. Used sparingly; it is Minty's built-in secondary, not a deliberately promoted second brand color.

### Semantic (status/action, from Minty's Bootstrap map)
- **Success Green** (`#56cc9d`): success toasts, and — distinctively — the "clone this entry" row action, using the semantic-success color for a duplicate/copy action rather than a status message.
- **Info Cyan** (`#6cc3d5`): informational states (rare in this app).
- **Warning Yellow** (`#ffce67`): warning toasts, and the "edit this entry" row action.
- **Danger Coral-Red** (`#ff7851`): destructive actions — delete row, delete-confirmation button, error toasts.

### Neutral
- **Neutral Light** (`#f8f9fa`): light-mode surfaces and disabled-state backgrounds.
- **Neutral Dark** (`#343a40`): dark-mode surfaces (as Bootstrap's dark color-mode base, not a hand-picked value).
- **Body Text** (`#888888`, gray-600): default paragraph, table cell, and label text in light mode.
- **Heading Text** (`#5a5a5a`, gray-700): heading color in light mode.

### Data visualization palette (charts only — not part of the UI role system above)
Bar and pie charts carry a separate, purpose-built palette ported verbatim from the legacy ngx-charts implementation, so the migrated charts stay visually identical to the app people already know:
- **Solar** (10-step amber ramp, `#fff8e1` → `#ff6f00`): sequential heat scale for the monthly expense bars — darker amber means a higher value in that series.
- **Natural** (10-color earthy ordinal set, e.g. `#bf9d76`, `#e99450`, `#a5d7c6`, `#7794b1`): cycling categorical palette for pie-chart slices.

### Named Rules
**The Action-Color Rule.** Row-level actions are colored by verb, not by position or emphasis: primary (mint) creates, warning (yellow) edits, success (green) duplicates, danger (coral-red) deletes. A new row action should pick its color the same way — by what it does, never by "next available accent."

## Typography

**Display/Headline/Title Font:** Montserrat (weights 400/500/700), falling back to the system UI stack.
**Body/Label Font (values, table cells, form input text):** the system default sans-serif stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`) — deliberately not Montserrat; only headings, the navbar, buttons, and `<legend>` elements carry the display face.

**Character:** Montserrat gives structural elements (nav, buttons, section titles) a slightly firmer, geometric voice, while everything a user actually reads or types stays on the plain system font for maximum legibility and zero web-font cost on data-heavy screens.

### Hierarchy
- **Headline** (700, 2rem, 1.2 line-height): rare — page-level headings like the error page.
- **Title** (500, 1.25rem, 1.3 line-height): recurring section headers, e.g. each statistics table's title ("Media bolletta mensile") and modal titles.
- **Body** (400, 1rem, 1.5 line-height): table data, list content, form values, toast copy — the vast majority of on-screen text.
- **Label** (500, 1rem, Montserrat): form labels, button text, nav links, breadcrumbs.

### Named Rules
**The Two-Font Rule.** Exactly two type roles exist: Montserrat for structure (headings, nav, buttons, legends) and system-sans for content (everything a user reads as data or types as input). Never introduce a third face; never put Montserrat on body/table text or system-sans on a button.

## Layout

A single fixed-top navbar (`bg-primary`, full width, collapses to a hamburger below the `sm` breakpoint) sits above a breadcrumb strip and a `container-fluid` content area — there is no max-width content column; screens use the full viewport width, appropriate for data tables and charts rather than prose. Spacing follows Bootstrap's untouched default scale (`0.25rem` step, e.g. `gap-2` = 0.5rem, `mb-3`/`mt-3`/`px-3` = 1rem) via utility classes — no custom spacing tokens exist. Forms and login use `row`/`col-sm-*` grids at up to two columns; the statistics landing screens use `col-md-6` pairs. Tables wrap in `.table-responsive` for horizontal scroll on narrow viewports instead of reflowing to cards. Two full-page chart containers use viewport-relative heights tuned by hand (`calc(100vh - 210px)`, tripled for the 48-row monthly bar view) rather than a fixed pixel height, so charts always fill the available viewport.

## Elevation & Depth

Flat by evidence, not by omission: nothing in the codebase defines a custom shadow, and Minty does not add any card/button elevation on top of Bootstrap's own (shadow-free) defaults. Depth is not conveyed at all — surfaces, modals, and dropdowns are distinguished by background color and a hairline border (`--bs-border-color`), never by shadow or layering. The one exception is Bootstrap's native focus ring on inputs/buttons, which is an accessibility affordance, not a stylistic elevation choice.

### Named Rules
**The No-Shadow Rule.** Don't add `box-shadow` for decoration or hierarchy. If two surfaces need to read as separate, use a border or a background-color/spacing gap — matching every existing modal, table, and card-less panel in the app.

## Shapes

Corner radius follows Minty's three-step scale: small controls (badges, breadcrumb pills) at `0.3rem`, the default for buttons/inputs/dropdowns at `0.4rem`, and larger containers (modals) at `0.6rem`. There is no sharp-corner or fully-pill treatment anywhere — every interactive shape is softly rounded but not circular, which is where the "soft and approachable" feel of an otherwise plain UI comes from. Borders are single hairlines in `--bs-border-color`; no double borders, no decorative outlines.

## Components

### Buttons
- **Shape:** rounded corners (`0.4rem` default, matching `{rounded.md}`).
- **Primary** (`#78c2ad` → hover `#66a593` → active `#609b8a`): the one call-to-action color — "new expense" and quick-add shortcuts, form submit, "apply update".
- **Semantic action buttons:** warning/success/danger reused for row actions per the Action-Color Rule above, always paired with a matching icon (react-icons `fa6` set) and a `title`/`aria-label` — icon-only buttons are always labeled for accessibility, never icon-alone with no text alternative.
- **Outline-light:** the navbar's only button style (theme toggle, profile, logout) — transparent with a white border/text, since it sits on the mint `bg-primary` navbar rather than a neutral surface.
- **Secondary/Cancel:** plain `btn-secondary` (Bootstrap gray), used for every modal's "Annulla" (cancel) action — consistently the last, least-emphasized button in a footer.

### Cards / Containers
This system does not use Bootstrap cards. Content sits directly on the page background inside grid columns (`row`/`col-*`), separated by whitespace and headings rather than card borders — a deliberate absence, not a gap to fill later.

### Inputs / Fields
- **Style:** plain `form-control`/`form-select`, `0.4rem` rounded corners, hairline border, white background in light mode.
- **Focus:** Bootstrap's native focus ring (tinted from the primary color).
- **Validation:** client-side required/number-range checks disable the submit button rather than showing inline field errors — parity with the legacy Angular form behavior.

### Tables
- **Style:** `table table-hover`, always wrapped in `.table-responsive`. Row hover is the only visual feedback beyond the header row; no zebra striping, no card-per-row mobile fallback.
- **Actions column:** icon buttons grouped with `me-2`/`text-nowrap`, colored per the Action-Color Rule.
- **Sortable headers:** a chevron-up/chevron-down icon pair per sortable column; the active sort direction swaps to a filled "circle-chevron" icon rather than changing color — state is communicated by icon shape, not by a color change.

### Navigation
- **Style:** fixed-top navbar, mint (`bg-primary`) background, white text/icons, Montserrat labels. A house-glyph icon is the entire brand mark — there is no wordmark.
- **Default/hover/active:** dropdown items use Bootstrap defaults (hover fills coral-blush, per Minty's `$dropdown-link-hover-bg`).
- **Mobile:** collapses behind a hamburger toggle below the `sm` breakpoint; the theme toggle stays outside the collapse so it's reachable at every width and auth state.

### Toasts
`sonner`'s `Toaster` (top-right, `richColors`) — success/warning/error variants map to the same semantic palette as everything else (`success-green`, `warning-yellow`, `danger-coral`). Every mutation (save, delete, login, logout) confirms itself with a toast; nothing succeeds silently.

## Do's and Don'ts

### Do:
- **Do** reuse Minty's semantic colors (`primary`/`secondary`/`success`/`warning`/`danger`/`info`) for any new UI — never introduce a new brand hex.
- **Do** color row/inline actions by what they do, per the Action-Color Rule (create=primary, edit=warning, duplicate=success, delete=danger).
- **Do** keep body and table text on the system sans-serif stack; reserve Montserrat for headings, buttons, nav, and legends.
- **Do** label every icon-only button with `title` + `aria-label` — several already do this and it should stay universal.
- **Do** confirm every mutation with a `sonner` toast in the matching semantic color.

### Don't:
- **Don't** add `box-shadow`, glassmorphism, or gradients anywhere — this system is flat and stays flat (The No-Shadow Rule).
- **Don't** wrap new content in Bootstrap `.card` — this app has never used cards; keep using grid columns and headings for separation.
- **Don't** hand-tune the dark theme — light/dark is Bootstrap's native `data-bs-theme` switch; don't fork a separate dark palette.
- **Don't** let the PWA manifest's `theme_color`/`background_color` (currently `#7FC1AD`) drift further from the actual Bootstrap primary (`#78c2ad`) — they're meant to be the same color and have quietly diverged by a rounding difference; fix the manifest to match rather than treating either as authoritative on its own.
