---
name: xNotary.digital
description: Document tools that work on your document in your browser — ink on paper, marked in yellow.
colors:
  highlighter: "#ffd84d"
  highlighter-pressed: "#ffcf26"
  highlighter-wash: "#fff3c4"
  ink: "#111111"
  ink-soft: "#3a3527"
  ink-quiet: "#57513f"
  ink-faint: "#6b6450"
  paper: "#fffdf6"
  card: "#ffffff"
  well: "#fbf8ee"
  binding: "#161616"
  binding-fg: "#f2efe6"
  binding-fg-soft: "#c9c3b0"
  rule-drop: "#8f8668"
  rule-input: "#b5ad94"
  ok: "#236048"
  ok-bg: "#edf7f2"
  warn: "#815f22"
  warn-bg: "#f9f2e2"
  bad: "#a8392f"
  bad-bg: "#fff1ef"
typography:
  display:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "clamp(38px, 7vw, 68px)"
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 4vw, 34px)"
    fontWeight: 760
    lineHeight: 1.15
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(20px, 3vw, 25px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 730
    letterSpacing: "0.055em"
rounded:
  pill: "999px"
  card: "16px"
  zone: "13px"
  notice: "12px"
  button: "10px"
  field: "9px"
components:
  button-primary:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 19px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.highlighter-pressed}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "0 19px"
    height: "46px"
  choice:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "9px 16px"
  choice-selected:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 13px"
    height: "44px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
  dropzone:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.zone}"
    padding: "32px"
  top-bar:
    backgroundColor: "{colors.binding}"
    textColor: "{colors.binding-fg}"
  tab-current:
    backgroundColor: "{colors.highlighter}"
    textColor: "{colors.ink}"
---

# Design System: xNotary.digital

## Overview

**Creative North Star: "The Highlighted Record"**

Every page is a sheet of warm paper with black ink on it, and yellow is a highlighter: it marks
the one thing on a screen that matters now. That might be the current tab, the next action, a
selected option, or one word in a headline. The dark bar at the top, closed by a yellow rule, is
the binding that holds the record together; the dark footer closes it. Documents are what the
site is about, and a document is a light thing, so the pages stay light and the frame stays dark.

The look is plain and certain. It does not decorate, and it uses no gradients, glass or glow.
Hierarchy comes from weight, size and the single yellow mark. Screens carry the minimum, and
explanations sit behind an ⓘ. The appearance is fixed rather than following the system's dark
mode, because each surface carries meaning (bar, paper, card, well), and inverting one of them
breaks it. The three services share the bar, the palette and every component. Only their content
differs.

**Key Characteristics:**
- Warm paper pages, white cards, near-black ink, one yellow highlighter.
- A dark binding bar with a 3px yellow rule; the current tab is a yellow chip.
- A serif display line on landing pages only; Inter for everything else.
- Soft warm shadows for containers; a hard offset shadow only for things that stand for a document.
- Small uppercase tracked labels for steps and table heads; never below 11px.

## Colors

One accent on a warm neutral ground. Yellow is never a background for reading, only a mark.

### Primary
- **Highlighter Yellow** (`highlighter`): the current tab, the primary button, a selected
  choice, the yellow rule under the bar, and the `mark.hlm` stroke behind one headline word.
- **Pressed Yellow** (`highlighter-pressed`): the hover state of anything yellow.
- **Highlighter Wash** (`highlighter-wash`): a drop zone with a file over it, the current item in
  a menu, chips. Yellow diluted for areas larger than a control.

### Neutral
- **Ink** (`ink`): all primary text, outlines of primary controls, focus rings on paper.
- **Soft Ink** (`ink-soft`): secondary text and notes. Never lighter grey for body copy.
- **Quiet Ink** (`ink-quiet`) and **Faint Ink** (`ink-faint`): meta text, step labels, hints.
  Both are warm browns rather than greys, and both pass 4.5:1 on paper.
- **Paper** (`paper`): the page ground. **Card** (`card`): containers on it. **Well**
  (`well`): recessed areas such as drop zones and notices.
- **Binding** (`binding`), **Binding Text** (`binding-fg`), **Binding Soft** (`binding-fg-soft`):
  the top bar and the footer.
- **Drop Rule** (`rule-drop`) and **Field Rule** (`rule-input`): dashed drop-zone borders and
  input borders.

### Semantic
- **Confirmed** (`ok` on `ok-bg`), **Caution** (`warn` on `warn-bg`), **Refused** (`bad` on
  `bad-bg`): status notices and pills. These carry meaning, not decoration, and appear only when
  something was verified, is pending, or failed.

### Named Rules
**The One Highlighter Rule.** At most one yellow mark per region: one current tab, one
primary button per step, one `mark.hlm` per page. If two things are yellow, one of them is wrong.

**The Token-Only Rule.** Every colour is a custom property on `:root` in `app/src/app.css`. The
rules only ever say `var(--…)`, so a change of look is a change of token values and nothing else.

**The Meaning Rule.** Green, amber and red appear only when a result supports them, in the same
way the product never reports a status the evidence does not support.

## Typography

**Display Font:** Georgia (with Times New Roman, serif), on landing heroes only.
**Body Font:** Inter 4.1, self-hosted (`app/src/site/fonts/`), with the system UI stack as fallback.
**Label/Mono Font:** the system monospace stack, for digests, file names and commands only.

**Character:** a bookish serif for the one statement a landing page makes, and a quiet, exact
sans for the work.

### Hierarchy
- **Display** (500, clamp 38–68px, 1.02): the landing-page headline, with one highlighted word.
- **Headline** (760, clamp 26–34px, 1.15): the page title on every product screen.
- **Title** (700, clamp 20–25px, 1.2): a panel's title, such as "Choose a document".
- **Body** (400, 15px, 1.55): copy. Panel copy is 14px in soft ink, with a measure of 590–650px.
- **Label** (730, 11px, 0.055em, uppercase): stepper steps, table heads, pills.

### Named Rules
**The 11px Floor.** No functional text below 11px. The mark letters inside the small brand
diamonds are the only exception.

**The One Serif Rule.** Georgia appears in the landing hero and in the italic ⓘ glyph, and
nowhere else.

**The Tracking Floor.** Letter-spacing is never tighter than -0.04em.

## Layout

Two containers. Landing pages and list screens use a 1120px column. A single-task flow narrows
to 820px, because a flow is one column and its page should be as wide as the panel. Gutters are
24px each side (`calc(100% - 48px)`). Breakpoints are at 980px, where grids collapse to one
column, and 720px, where the bar stacks, tabs scroll sideways and panels tighten.

A flow is a white card holding a stepper (`1 CHOOSE · 2 … · 3 …`) and one panel per step.
Panel padding is 42px. The page head puts the title left and a status or action right.
Spacing is generous between groups and tight within them: 8–9px inside a control group,
16–18px between blocks, 27–32px before a new section.

## Elevation & Depth

A hybrid. Containers are lifted on a soft, warm ambient shadow, never a grey one. Popovers lift
further. Focus and success use a flat halo. Exactly one element uses a hard offset shadow: the
file icon in a drop zone, which stands for a document lying on the desk.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 12px 40px rgba(40, 32, 0, 0.06)`): flow cards, list cards, the
  single-task card.
- **Popover** (`box-shadow: 0 16px 44px rgba(40, 32, 0, 0.22)`): ⓘ bubbles and bar menus.
- **Sheet** (`box-shadow: 6px 6px 0 #ede6cf`, or `4px 4px 0` in compact zones): the file icon.
- **Focus halo** (`box-shadow: 0 0 0 3px rgba(255, 216, 77, 0.45)`): an input with focus.

### Named Rules
**The Sheet Rule.** A hard offset shadow means "this is a document". Use it on things that
stand for one, and nowhere else.

**The Warm Shadow Rule.** Shadows are tinted toward the paper's brown (`rgba(40, 32, 0, …)`).
Never use black or blue-grey.

## Shapes

Gently rounded and consistent: 16px for cards, 13px for drop zones, 12px for notices, 10px for
buttons, 9px for fields and choices, and full pills for status. Borders are 1px hairlines in ink
at low opacity. Drop zones use a 1.5px dashed rule, the only dashed line in the system. Brand
marks are diamonds (rotated squares) with a letter or two inside.

## Components

### Buttons
- **Shape:** gently rounded (10px), at least 46px tall, 13px semibold label.
- **Primary:** solid highlighter yellow with an ink outline and ink text. One per step.
- **Hover / Focus:** a 1px lift and pressed yellow on hover; a 2px ink focus ring, offset 2px.
- **Secondary:** a white card with a hairline outline that turns to ink on hover. **Danger:**
  refused-red text and outline on a transparent ground.
- **Disabled:** 45% opacity and a not-allowed cursor.

### Chips
- **Choices** (format, paper size, authority): white with a hairline border; when selected,
  yellow with an ink outline. They behave as radio buttons.
- **Pills:** 11px uppercase, full radius, coloured only by meaning.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** white on paper.
- **Shadow Strategy:** the Card shadow.
- **Border:** a 1px hairline.
- **Internal Padding:** 42px for a flow panel, 26px for a service card.

### Inputs / Fields
- **Style:** 44px tall, 9px radius, white, warm-grey rule.
- **Focus:** the rule turns ink, with a 3px yellow halo.
- **Help text:** 11px, faint ink, directly under the field.

### Navigation
- **Top bar:** the dark binding with a 3px yellow rule beneath it. On the left are the
  xNotary.digital mark and a service switcher. In the middle are the service's tabs: bold
  light text, and the current tab is a yellow chip. On the right is the "I want to…" task menu
  with a yellow outline.
- **Mobile:** below 720px the bar stacks, and the tabs become a sideways-scrolling row.

### Drop zone (one design, every service)
- A recessed well with a dashed rule and a file icon that casts the Sheet shadow. The icon
  names the format (`PDF`, `DOC`, `FILE`). It reads "Drop a document here" and then
  "or click to choose one — <formats>". There is no button: the whole zone is the control, a
  `<label>` around a hidden file input (in xNotary, `FileDrop.svelte`, which adds keyboard
  handling), so **nothing interactive may sit inside it before the input**. An ⓘ belongs in the
  panel title. xNotary, xSignature and xConvert all draw it this way. Change it in one place,
  change it in all three.
- **Once a file is chosen** the zone gives way to the summary card (`.picked`: the name in
  ink, then facts in soft ink, such as format, size, pages and what was found) and, beneath it, a
  secondary "Choose a different file" button in an `.action-group`. Nothing is shown inside the
  zone itself. Both classes live in `app/src/app.css`. Sizes are always written by
  `formatBytes` in `app/src/site/size.ts` (`512 B`, `8.4 KB`, `86 KB`, `1.2 MB`), never by a local helper.

### Signature level (one design, every service)
- A signature's level is read from what its certificate says about itself: three steps (●●● / ●●○
  / ●○○) and a plain name. "Qualified signature" needs the certificate to say both that it is
  qualified and that the key is on a certified device. "Advanced signature with a qualified
  certificate" is the qualified claim alone. "Signature with a certificate" is neither.
- One line beneath the name says what the certificate says. One visible sentence says it was not
  checked against a trust list. The EU names (QES, AdES/QC) belong in the ⓘ.
- The steps are ink, never traffic-light colours: green would read as "valid", which nothing on the
  site establishes. Nothing in the wording may say "verified".
- `app/src/site/SignatureLevel.svelte` implements it; `compact` is the one-line form for a list of
  signers.
- Where it appears: xSignature's Sign a document (step 4) and Check a PDF, and xNotary's Certify
  signers.

### Support (one page, every service but xConvert)
- `/support/` (`app/hub/Support.svelte`) is a thank-you and a voluntary payment. A thank-you
  line, then one card: the serif question with its one highlighted word, method chips (Lightning
  live; Card and Bank QR disabled, each with an ⓘ saying "Under development"), the Lightning
  panel, and a share row (also under development). It fits one desktop screen.
- The page never says a payment is required, secure or received: it cannot know. The Lightning
  QR is drawn at build time in ink, and the page sends nothing.
- `app/src/site/SupportLink.svelte` is the line under a finished task in xNotary and xSignature:
  a light card with an ink heart on a wash circle, "If xNotary.digital saved you time, you can
  support the project." It opens in a new tab, because the page it sits on may hold the only
  copy of a result.
- The site does not advertise itself as free of charge. "Free and open source" in a footer is the
  licence (AGPL-3.0), not a price.
- `/support/` is also in the front-page footer's family links and at the end of the "I want to…"
  menu ("Support · Support the work with a payment").

### ⓘ Info mark
- A 16px circled italic serif "i" with a 24px hit area. It opens a bubble on hover and pins it
  on click. A limit the product requires stays on screen as one sentence; the ⓘ holds only the
  detail.

## Do's and Don'ts

### Do:
- **Do** keep black on yellow as the only accent pairing: an ink outline and ink text on a
  highlighter fill.
- **Do** put any new colour in `:root` as a token and use it through `var(--…)`.
- **Do** keep text at or above 4.5:1. The warm "faint" and "quiet" inks are the lightest
  allowed for text on paper.
- **Do** give every control a visible focus ring and a target of at least 24px.
- **Do** keep each service's screens identical in structure: page head, then a flow card with a
  stepper, then panels.

### Don't:
- **Don't** use gradients, glass, blur or glow. The one exception is the highlighter stroke
  behind a headline word.
- **Don't** add a second accent colour, or use the semantic green, amber or red for decoration.
- **Don't** follow the system's dark mode. The appearance is fixed on purpose.
- **Don't** put a button, link or ⓘ inside a drop zone before its file input.
- **Don't** use the hard offset shadow on anything that does not stand for a document.
- **Don't** set functional text below 11px or tracking tighter than -0.04em.
