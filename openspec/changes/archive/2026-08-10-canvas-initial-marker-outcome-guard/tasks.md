## 1. Initial-step canvas stamp

- [x] 1.1 Render a `.canvas-initial-stamp` group on the initial step's node
      in `CanvasView.tsx`, beside the existing `.canvas-terminal-stamp`
      block, keyed off `isInitial` (top-left corner, unrotated).
- [x] 1.2 Add the `.canvas-initial-stamp` CSS rules in `app.css`, mirroring
      `.canvas-terminal-stamp` without the `rotate()` transform.
- [x] 1.3 Add the `canvas.initialStamp` catalog key in
      `i18n/catalogs/studio.ts`.
- [x] 1.4 Update the `measureFit` comment in `CanvasView.tsx` to name the
      start stamp alongside the start arrow and the terminal stamp.

## 2. Outcome field constrained to contract.outcomes

- [x] 2.1 Render the identity section's `outcome` field as a `<select>`
      populated from `draft.contract.outcomes` in `StepsPanel.tsx`,
      whenever the draft has one or more declared outcomes.
- [x] 2.2 Keep the free-text `<input>` fallback for a draft with no
      contract, or a contract with no declared outcomes.
- [x] 2.3 Add the `stepSections.outcomePlaceholder` catalog key in
      `i18n/catalogs/studio.ts`.

## 3. Specs

- [x] 3.1 Add the delta spec for `studio-canvas`: a new requirement for the
      initial-step stamp, a MODIFIED fit-to-view framing requirement that
      names it, and a new requirement constraining the outcome field.

## 4. Verification

- [x] 4.1 `bun run typecheck` (engine + both `packages/*`).
- [x] 4.2 `bun run build` (`packages/web`).
- [x] 4.3 Manual browser check: `credit_check` draft, initial step shows
      the "start" stamp; the `rejected` step's outcome field renders as a
      `<select>` offering only `approved`/`rejected`.
- [x] 4.4 Full `bun test` suite with `DATABASE_URL` set, to confirm no
      regression outside the touched files.
- [x] 4.5 Manual browser check: a single-step process whose one step is
      both `workflow.initialStep` and terminal shows both stamps without
      overlap.
