## 1. Prerequisites

- [x] 1.1 Confirm `studio-canvas-first-structure-editor` and
      `studio-canvas-first-form-builder` are both implemented and merged
      before starting this walkthrough; this change verifies their
      output, not a mockup. Both changes' implementation tasks are
      complete (45/50 and 25/30; the remaining tasks in each are that
      change's own browser walkthrough and verification suite, not
      implementation). Neither is archived or committed yet, so "merged"
      does not hold literally; this walkthrough ran against the real
      built output in the working tree (a fresh `bun run --filter
      './packages/web' build`), not the mockup, which is the property
      this task exists to guarantee.

## 2. Walkthrough: structure editor components

- [x] 2.1 Under `prefers-color-scheme: dark`, check the checks rail:
      default state, each source group, the held-back state, and the
      all-clear state.
- [x] 2.2 Check the palette: default state, drag-hover state, and each
      of Step/Subprocess/End.
- [x] 2.3 Check the selection-driven inspector: no-selection state, a
      selected step's sections including its "Developer view" disclosure
      (expanded and collapsed), and a selected path's sections including
      its own "Developer view" disclosure (raw CEL, expanded and
      collapsed).
- [x] 2.4 Check the canvas-edge guard label: a plain-English summary and
      a raw-CEL fallback.
- [x] 2.5 Check the process-identity header bar: clean, dirty, and
      just-published states.

## 3. Walkthrough: form-builder components

- [x] 3.1 Under `prefers-color-scheme: dark`, check the routed form
      editor: the palette, the canvas, and the selected-field strip.
- [x] 3.2 Check the "add a field to the process" palette section, in its
      default and drag-hover states.
- [x] 3.3 Check the rule-row builder: a row in its default state, an
      incomplete row, and the "Developer view" disclosure open and
      closed.
- [x] 3.4 Check the selected field's override-strip "Developer view"
      disclosure (the `visible`/`required`/`readonly` CEL escape hatch):
      open and closed states.
- [x] 3.5 Check the process-field catalog panel's "Developer view"
      disclosure (the JSON escape hatch): open and closed states. This
      disclosure only renders once a custom-typed field is selected —
      select one before ticking this box, or the states go unchecked.

## 4. Fixes

- [x] 4.1 For each finding from sections 2-3, replace the hardcoded
      color or primitive-token reference with the correct semantic
      token from `src/shell/tokens.css`. A full grep of the two prior
      changes' CSS/TSX diff for hex/rgb/hsl literals, color keywords,
      and primitive-token custom properties (`--color-neutral-*`,
      `--color-accent-{1..9}00`, `--paper-*`, `--ledger-*`, `--ink-*`,
      `--slate-*`, `--hairline-*`, `--stamp-*`) found one instance in
      the new code: `.studio-checks-group-held-back`
      (`packages/web/src/areas/studio/app.css`, part of the checks
      rail's held-back state task 2.1 walks) set `border-left: 3px
      solid var(--color-accent-400)`, a direct primitive-ramp
      reference. It happened not to visibly break under
      `prefers-color-scheme: dark` (the ramp step's fixed value
      `#ff9783` coincidentally equals dark mode's `--color-refusal`),
      but was a latent low-contrast risk in light mode and a rule-5
      violation regardless of visible symptom. Fixed: the border now
      reads `color-mix(in srgb, var(--color-refusal) 55%, transparent)`,
      the same derive-a-lighter-step-from-a-semantic-token pattern
      `tokens.css` already uses for `--color-divider` and
      `--shadow-sm/md/lg`. The three other primitive references the
      grep found (`.canvas-terminal-stamp`, `.studio-diff-added`, both
      `--color-neutral-900`; `.studio-warning`, the pre-existing rule
      `.studio-checks-group-held-back`'s `--color-accent-400` line was
      copied from, same `--color-accent-400`) all predate both prior
      changes and sit outside this change's scope.
- [x] 4.2 Re-check each fixed component under both `light` and `dark`
      `prefers-color-scheme`, to confirm the fix did not regress light
      mode. Re-checked `.studio-checks-group-held-back` (checks rail,
      held-back state) under both schemes: the border now shows a
      visibly lighter, subdued refusal tone against the text in light
      mode (previously a much lighter, mismatched salmon), and is
      visually unchanged from before in dark mode (the color-mix result
      renders the same as the old coincidental match).
- [x] 4.3 Add an entry to `docs/browser-checks.md`, titled "Studio
      canvas-first components under dark scheme", sourced to this
      change. Its pass criterion is the component/state checklist from
      tasks 2.1-3.5: checks rail (default, each source group, held-back,
      all-clear); palette (default, drag-hover, Step/Subprocess/End);
      selection-driven inspector (no-selection, selected step incl.
      "Developer view" expanded/collapsed, selected path incl.
      "Developer view" expanded/collapsed); canvas-edge guard label
      (plain-English summary, raw-CEL fallback); process-identity header
      bar (clean, dirty, just-published); routed form editor (palette,
      canvas, selected-field strip); "add a field" palette section
      (default, drag-hover); rule-row builder (default row, incomplete
      row, "Developer view" open/closed); override-strip "Developer
      view" (open/closed); field-catalog panel "Developer view"
      (open/closed). This gives the walkthrough a standing,
      re-runnable checklist that survives this change's archive.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`.
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set. This
      change is CSS-only, so no test failure is expected; a full run
      still confirms nothing else moved.
