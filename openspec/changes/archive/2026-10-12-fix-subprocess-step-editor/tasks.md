# Tasks

## 1. The shared mapping editor (E2-12)

- [x] 1.1 Widen the `fields` prop of `FieldExpressionMapEditor`. Drop group targets and disable targets other rows hold. Test the markup.
- [x] 1.2 Add a stored key outside the targets as a marked option. Add the `mapping.unlistedKey` catalog key. Test the option shows selected.
- [x] 1.3 Keep a row after the author clears its CEL text, as an entry with an empty `src`. Add the `addDisabled` prop. Test with a pure handler.

## 2. Seeding and the child's input fields (E2-3, E2-4)

- [x] 2.1 Add `specForProcess` to `draft/subprocessSpec.ts`. Test a first pick, a pick on a pinned spec and a pick on a latest-at-spawn spec.
- [x] 2.2 Add `childInputRefs` and `useChildInputFields` in `panels/shared/useChildInputFields.ts`. Test the pure mapper on a body with and without a contract.
- [x] 2.3 Rework `SubprocessSpecEditor` to show the process select alone without a spec. Feed the `inputMapping` editor from `childInputs`, with the notes and the disabled add.
- [x] 2.4 Call the hook in `StepPage` above the early return and pass `childInputs`. Verify the existing editor test and a new one for each state.
- [x] 2.5 Add the catalog keys for the notes: loading, failed and no input fields. Verify a static-markup test reads each note.

## 3. The kind switch (E2-5)

- [x] 3.1 Add `performedByRemovals`, `performedByReach` and `performedByEdit` to `draft/performedBy.ts`. Test the table of kinds and counts.
- [x] 3.2 Add `KindSwitchDialog.tsx`, shaped like `RemoveFieldDialog`, with its catalog keys. Test the markup: counts, Cancel focus, no row for a zero count.
- [x] 3.3 In `StepPage`, apply an empty-reach switch at once and open the dialog otherwise. Verify with a browser check in 6.3.
- [x] 3.4 Make the outcome text field write `undefined` when the author clears it. Test the helper that builds the patch.

## 4. The contract outcome (E2-18)

- [x] 4.1 Add `appendOutcome` in `draft/` and call it from `ContractPanel`. Test trimming, a duplicate and an empty text.

## 5. Docs and the audit index

- [x] 5.1 Add a checklist entry to `docs/browser-checks.md` for the five findings. Verify it names the route and the pass condition.
- [x] 5.2 Strike this change's entry in the audit index in `docs/decisions.md`.

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`, then `bun run build`, then the full gated `bun test` with `DATABASE_URL` set, in the lane's devcontainer.
- [ ] 6.2 Run the antislop and whitespace gates over the pushed range, as the push gate does.
- [x] 6.3 Build `subprocess-loan-parent` from scratch in a browser on the production build and publish it. Then run `/impeccable critique` and `/impeccable audit` on the step page's subprocess section.

## Workflow follow-up

- Verify, sync the delta specs, archive, push, open the PR and merge on green CI.
