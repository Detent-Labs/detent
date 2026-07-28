## Why

`/processes/:id/edit` in `packages/studio` currently offers two of the three
editing surfaces the Process Studio design calls for: Canvas (primary) and
Panels (inspector). The third, a raw-JSON surface for bulk-editing a draft's
body directly, is still missing (`docs/superpowers/specs/2026-07-27-process-studio-design.md`,
Screens: "three surfaces over one draft"). Without it, a developer authoring
a large or structurally repetitive change (e.g. pasting several fields or a
whole step block) has no faster path than clicking through panels one field
at a time. It's also a prerequisite for retiring `packages/editor`
(`studio-tools-and-player`, ROADMAP stage 11): Studio's editing surface must
be at parity with the editor before the editor is deleted.

## What Changes

- Add a JSON surface to `/processes/:id/edit`, alongside Canvas and Panels,
  showing the current draft body as pretty-printed JSON.
- An explicit "Apply" action parses the edited text, validates it through the
  same compile-time validation chain the live Canvas/Panels editing already
  uses (`workflow-engine/schema/compile`, `/cel/check`,
  `/engine/registry-check`), and on success replaces the draft's body
  wholesale through the Draft model's existing replace surface.
- One synchronization direction only: JSON view reflects the draft on load /
  surface switch, not on every Canvas/Panels keystroke. Editing JSON does not
  live-sync back into Canvas/Panels until Apply succeeds.
- Invalid JSON or a schema/validation failure replaces nothing — the current
  draft stays untouched and the error is surfaced inline in the JSON surface.
- No new HTTP routes and no engine changes: this is a `packages/studio`
  frontend-only addition reusing the draft's existing save path.

## Capabilities

### New Capabilities
- `studio-json-view`: the JSON editing surface on the Studio edit screen —
  render the draft body as JSON, parse and validate an edit on explicit
  apply, and replace the draft body only when validation succeeds.

### Modified Capabilities
(none — purely additive, same as `studio-canvas` was to `studio-app`'s edit
screen)

## Impact

- `packages/studio/src/screens/EditScreen.tsx`: gains a surface switcher
  (Canvas / Panels / JSON) alongside the existing Canvas+Panels layout.
- New component, e.g. `packages/studio/src/panels/JsonView.tsx` (or
  `screens/JsonView.tsx`), plus a pure parse-and-validate-and-replace logic
  module (tested independent of the component, following
  `packages/app/src/screens/inboxLogic.ts` convention).
- No server/engine changes; no new routes; no breaking changes.
