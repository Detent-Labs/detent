## Why

`.claude/rules/design-language.md` already commits `packages/web` to a
fully semantic-token color layer. Dark mode already works everywhere via
`prefers-color-scheme` in `src/shell/tokens.css`, with no manual toggle.
That existing guarantee holds automatically for a component that uses
only semantic tokens.

Two prior changes add several new components. Those are
`studio-canvas-first-structure-editor` and
`studio-canvas-first-form-builder`. The new components are the checks
rail, the palette, and the selection-driven inspector. They are also the
canvas-edge guard label, the routed form editor, and the rule-row
builder.

Each is new code. Each is a place a hardcoded color, or a primitive
token reference, could slip past review. Either could silently break in
dark mode. This change verifies that every one of those new components
renders correctly under `prefers-color-scheme: dark`, and fixes what it
finds.

## What Changes

- Visually verify each new component from the two prior changes under
  `prefers-color-scheme: dark`, in a real browser.
- Fix any hardcoded color, or any reference to a primitive token instead
  of a semantic one, found during that verification.
- This change adds no new capability. Dark mode already exists as a
  capability; this change is conformance work on new components, not a
  new guarantee.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Verifying and fixing token usage on already-specified components
changes no observable behavior. It stays within what
`.claude/rules/design-language.md`'s existing rule already promises.
`.openspec.yaml` sets `skip_specs: true`.

## Impact

- The new components from `studio-canvas-first-structure-editor`: the
  checks rail, the palette, and the selection-driven inspector. Also
  new: the canvas-edge guard label, and the process-identity header
  bar. The header bar's clean, dirty, and just-published states get
  their own walkthrough step, `tasks.md` 2.5.
- The new components from `studio-canvas-first-form-builder`: the
  routed form editor and the rule-row builder. Also new: the selected
  field's override-strip "Developer view" disclosure, and the
  process-field catalog panel's "Developer view" disclosure.
- `packages/web/src/areas/studio/`'s CSS for those components, wherever
  a fix turns out to help. `src/shell/tokens.css`'s token definitions
  should not need a change. A finding here means a component uses the
  wrong layer, not that a token is missing.
- Out of scope: any new theme-switching mechanism. `prefers-color-scheme`
  stays the only signal; this change adds no manual toggle.
