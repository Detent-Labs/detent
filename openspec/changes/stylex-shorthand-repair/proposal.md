## Why

StyleX 0.19 emits no `border` rule and no `background` rule. A style object
declaring either shorthand compiles to nothing, and the build stays green.
Measured against the production bundle on 2026-09-08: of 471 rules in
`dist/assets/index-Czh2NP0H.css`, four declare `border` and twelve declare
`background`. Every one of those sixteen comes from a hand-written sheet. Not
one carries a StyleX atom selector.

The loss reaches the browser. Today 41 files carry 113 declarations that
compile away. Of those, 80 ask for a border or a fill that never paints:

- every list screen's row hover, in the admin, app and reporting areas;
- the field matrix's sticky headers and its flag swatches;
- the canvas nodes;
- the JSON view;
- the error banner in five studio screens.

The other 33 say `none`, `0` or `transparent`. The global sheet's element
resets mask those.

<!-- "surface" is the domain term for what the studio presents; "render" is this repo's own verb for a compiled style. -->
<!-- antislop: allow synonym-rotation -->
`global.css` already records the same finding for `fieldset`. The rule it
states covers one element. Nothing covers the property.

## What Changes

- Convert all 113 dropped declarations to longhand. The `border` key becomes
  `borderWidth`, `borderStyle` and `borderColor`. The `background` key becomes
  `backgroundColor`.
- Add a source-level guard test. It reads every module under
  `packages/web/src` and `packages/form-ui/src`. It fails on a `border` or a
  `background` key inside a style object.
- Raise `web-styling`'s bound on the global stylesheet. The sheet stands at
  133 lines against a stated bound of about 120. The `fieldset` reset that
  carries it past the bound stays.
- No visual redesign. Each converted declaration asks for exactly what its
  shorthand asked for. The screens gain the borders and fills their own styles
  already declare.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-styling`: one added requirement bans the two shorthands the compiler
  drops and puts a test behind the ban. One modified requirement restates the
  global stylesheet's line bound and its survivor list.

- `studio-app`: one added requirement fixes what the repair made visible. The
  field matrix's pressed bulk badge fills with its own flag color, never with
  the accent.

The other area capabilities take no delta. Each of `admin-app`,
`end-user-app`, `reporting-app`, `unified-shell` and `form-ui` already states
what its screens render. The specs were right and the compiled output was
wrong. This change moves the output to the spec, not the spec to the output.

The studio is the exception, and the reason is worth stating. The badge asked
for an accent fill that never painted. Restoring it put six accent fills on
one screen. The language allows one, and the screen's own legend contradicts
the rest. A faithful conversion is not always a correct screen.

## Impact

- 41 modules under `packages/web/src` and `packages/form-ui/src`. The studio
  area holds 60 of the 80 visible sites, spread over 20 files.
  `FieldMatrixGrid` holds 9, `CanvasView` 8 and `FormEditorScreen` 7.
- One new test file under `packages/web/test`.
- `packages/web/src/shell/global.css` keeps its element resets. This change
  removes none of them. The `fieldset` reset covers two components that carry
  no style object at all.
- No engine, HTTP or definition-contract change. No i18n catalog change.
- `docs/browser-checks.md` gains the pass a compiler cannot make. The borders
  and fills paint on a real screen.
