# Study Lab design contract

The interface uses warm paper, dark ink, forest green actions, and hand-drawn SVG study icons. Keep surfaces flat. The landing page introduces the product before the focused sign-in form. The source-first workflow takes interaction cues from NotebookLM; the password, upload, progress, and file states take cues from Ruixen without copying its decorative effects.

## Brand expression

Use the name **Lee's Study Lab** consistently in the header and page title. The open-book mark contains a small L; it accompanies the wordmark and stays hidden from assistive technology. Serif headings and study-method titles carry the editorial identity; task instructions and utility headings use the sans family.

The core light palette is ivory `#f7f6f0`, page white `#fffef9`, ink `#202a24`, muted ink `#535e55`, and evergreen `#24543e`. The dashboard consumes these through its five semantic color tokens. Dark mode uses green charcoal surfaces and pale green link/icon accents. Filled actions retain a darker green so their light labels remain readable. Reserve red for errors and result feedback, and gold for source annotations and selection.

Study methods are independent choices: never number them as steps. Preserve the featured quiz card and three supporting methods on desktop, and compact horizontal cards on mobile. Utility controls stay visually quiet; keyboard focus remains explicit. No decorative lighting, gradients, or added animation.

The site header is a sticky, opaque surface with an inset border and 16px corners. Shared chrome tokens control its width and outer spacing. Keep dropdowns unclipped. History belongs beside the workspace heading; below 460px, use its labeled 44px icon button to keep that row compact.

## Tokens

`static/tokens.css` is the source of truth; `static/app.css` contains component and responsive styles. Define shared values in `:root`; dark mode overrides color tokens in `html[data-theme="dark"]`.

| Purpose | Tokens |
| --- | --- |
| Surfaces | `--paper`, `--paper-deep`, `--surface`, `--surface-strong`, `--line`, `--line-strong` |
| Text | `--ink` (primary), `--ink-soft` (secondary), `--ink-faint` (tertiary; still AA) |
| Links | `--link`, `--link-hover` |
| Filled actions | `--forest`, `--forest-strong`, `--on-action` |
| Feedback | `--danger`, `--danger-soft`, `--success`, `--success-soft`, `--focus` (aliases `--link`) |
| Accents | `--oxblood`, `--forest-soft`, `--highlight`, `--highlight-soft` |
| Spacing | `--space-1/2/3/4/5/6/8/12/16` = 4/8/12/16/20/24/32/48/64px. Padding, margin, and gap use these; no literal 3-27px values |
| Type | `--serif`, `--sans`. Sizes: `--text-xs/sm/base/lg/xl` (fixed), `--text-lead`, `--text-panel`, `--text-title`, `--text-2xl`, `--text-headline`, `--text-hero`, `--text-display` (fluid). Leading: `--leading-tight/snug/body` |
| Controls | `--control-size` (44px), `--control-size-large` (48px), `--field-height`, `--button-height` |
| Layout | `--content-width`, `--auth-width`, `--measure-title`, `--measure-copy`, `--radius-small/medium/large` |
| Overlays | `--scrim` |
| Duration | `--duration-feedback`, `--duration-panel`, `--duration-flip` |
| Layers | `--layer-header/menu/overlay/dialog/notice/skip` |

Use link tokens for text on paper. Filled actions use the forest background and on-action foreground. These serve different contrast requirements in dark mode. Keep literal colors, font sizes, and spacing out of component rules (a guardrail test enforces sizes and spacing, and that every token is consumed); retain optical SVG dimensions and breakpoint values where necessary.

`--dash-accent` follows the link tone in both themes. Selected text uses `--selection-ink` on the highlight surface. Browser theme color reads the computed `--paper` token rather than duplicating hex values in JavaScript.

## Interaction rules

- Keep the mobile wordmark left aligned; center landing headings and actions.
- Keep form labels left aligned, with errors next to the relevant action.
- Use native buttons with visible keyboard focus. History open and delete actions are separate buttons.
- Use at least 44px touch targets for primary and icon controls.
- Show password requirements only while creating an account; keep sign-in focused on its fields and actions.
- Keep AI answers grounded in the uploaded source and state when the source does not answer a question.
- Keep custom ink artwork in study-method sections; decorative SVGs are hidden from assistive technology.
- Respect reduced motion. Preserve flat surfaces and avoid gradients, blur, and decorative lighting.

## State and validation

`static/app.js` owns application behavior; templates contain page markup. Keep API paths and field order stable.

`resetAppToDashboard()` owns tool reset; sign-out reuses it. `resetToolInteractions()` advances a session version. Async generation, chat, and archived-chat uploads must check that version before updating UI. A late upload must release its hosted file using the returned signed ticket.

`validateUpload()` is shared by browse, drop, submit, and archive resume. The server remains authoritative for file type, size, ownership, and generated-content validation. Escape every history field before inserting HTML.

## Verification

Run `npm ci && npm test` for DOM interaction regressions, and `.venv/Scripts/python.exe -m unittest discover -s tests -v` for backend and visual guardrails. Browser checks should cover light/dark themes and narrow/wide screens. Mocked study previews do not establish successful Firebase authentication or real AI generation.

History requests use a separate version guard. Sign-out invalidates pending loads and clears private history markup. Deletion must recheck the account and history version after confirmation and after the network request. Theme persistence is optional: blocked storage must never prevent the app from initializing.
