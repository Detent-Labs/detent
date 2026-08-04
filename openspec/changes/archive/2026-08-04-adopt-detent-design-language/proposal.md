## Why

The current visual system carries the working name "Modernist": rounded
corners, a neutral gray ground. It was never a deliberate identity for this
product. It is the placeholder the shell shipped with while the four areas
themselves got built.

A complete design language for Detent now exists as a reviewed document. It
is the user's Claude Design project, "Detent Design Language." It describes
a case register, not a dashboard. The system is flat architectural type,
zero border-radius, and one accent used as a stamp rather than a paint. A
mono face marks every value the engine matches exactly. The document names
the exact token values, component rules, and area-shell compositions that
replace the placeholder.

## What Changes

- Replace the token layer in `packages/web/src/shell/tokens.css`. New color
  roles and ramps: ground, surface, ink, muted, divider, hairline, accent,
  refusal. Accent and neutral each get a 9-step ramp.
- In the same file: Archivo becomes both the heading and body face.
  Spacing moves to a 4px scale.
- `--radius-sm/md/lg` all go to `0`. **BREAKING** for any inline style or
  component CSS that assumed a non-zero radius.
- Restyle `packages/web/src/shell/shell.css`. This covers the area-switcher
  tab, `.shell-tab`: a mono, uppercase, accent-filled tab with a
  trailing-edge clip-path cut.
- Restyle each area stylesheet: `packages/web/src/areas/{app,admin,studio,
  reporting}/app.css`. All four move to the same component vocabulary.
- Badges and buttons: one badge/stamp form carries mono text, uppercase, a
  2px outline, and five tones. Rotation applies only to refusal states.
  Buttons follow the documented `.btn-primary`/`secondary`/`ghost` rules.
  No `.btn-*` className exists in the codebase today. This change adds
  one to every `<button>` element across all four areas, alongside the
  CSS rules themselves. It is the one markup change here.
- Rows and tables: a 2px structural divider, a 1px hairline between rows,
  no zebra striping.
- Fields: a field's border is the field. It never sits on a filled
  surface.
- Focus: every interactive element gets a 2px accent focus ring at 2px
  offset through `:focus-visible`.
- Restyle `packages/form-ui/src/form-ui.css`. Both the studio area's Player
  and the app area use this package.
- The restyle moves form-ui to the same field and label rules. An author's
  preview and a participant's real form then stay visually identical.
- Adopt Lucide icons as the icon set: `lucide@0.446.0`, 18px, 1.75 stroke.
  The repository ships no icons today.
- Preserve every behavioral and structural convention already in place. The
  `prefix-block-element` class-naming scheme stays. One area still never
  styles another's prefix.
- State stays expressed through DOM attributes (`[aria-current]`,
  `:disabled`, `:focus-visible`), never a class. Every string still comes
  from `t(locale, key)`.
- No control gets a fixed width derived from an English label. German runs
  up to 40% longer.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none. This changes visual presentation only. No functional requirement,
API, or contract behavior changes. See `.openspec.yaml`: `skip_specs: true`.)

## Impact

- **Affected code**: `packages/web/src/shell/tokens.css`,
  `packages/web/src/shell/shell.css`,
  `packages/web/src/areas/app/app.css`,
  `packages/web/src/areas/admin/app.css`,
  `packages/web/src/areas/studio/app.css`,
  `packages/web/src/areas/reporting/app.css`,
  `packages/form-ui/src/form-ui.css`, plus every TSX screen and panel that
  renders a `<button>` element, across all four areas. No button-variant
  class exists today, so each button gains a
  `.btn-primary`/`.btn-secondary`/`.btn-ghost` className. That is the one
  markup change here. Routing and logic stay as they are, with no
  `onClick` or behavior changes. A TSX file that hard-codes a color,
  radius, or font instead of reading a token is an incidental find.
  Fixing it is not in scope here unless it breaks visibly.
- **Dependencies**: adds `lucide` (icon set) and the Archivo webfont
  (Google Fonts), matching what the source design doc's own preview loads.
- **No engine, schema, API, or auth impact.** This change does not touch
  `src/`.
- **Sequencing**: two passes. First, `tokens.css` and `shell.css` as the
  shared foundation. The user reviews this in a browser and checkpoints
  before the next pass. Second, the four area stylesheets and
  `form-ui.css`.
