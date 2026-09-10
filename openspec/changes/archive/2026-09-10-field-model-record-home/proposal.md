## Why

The 2026-09-09 documentation audit kept `docs/field-model-redesign.md` alive on
one argument: other files point at it. The owner rejected that argument. No
dated file under `docs/` may stay load-bearing.

The file is a 319-line brainstorming record from 2026-08-30. It settles 25
decisions (D1-D25) and 5 scope exclusions (S1-S5) for a four-change programme.
Three of the four changes shipped. Nineteen of the 25 decisions now stand in
full elsewhere. Five living specs carry them, together with
`docs/authoring-guide.md` and `docs/current-state.md`. The record repeats those
nineteen and owns none of them.

Six items still exist only in this file. A separate problem sits beside them.
Nine archived files carry about 105 citations of the D and S labels, and those
resolve against this document alone.

## What Changes

- `docs/decisions.md`: six new bullets at the end of `## Open questions`, beside
  S1 and S2, which already live there. Each one stands on its own, the way that
  section states S1 today. They carry the `richtext` format argument, the
  `image` and `signature` deferral, the `slider` and `stars` deferral, the
  `items` key for a typed list, S3 (catalog scope) and S4 (hierarchical option
  sets).
- `git mv docs/field-model-redesign.md` into
  `openspec/changes/archive/2026-08-30-field-model-type-format-control/`. The
  file moves unchanged. No sentence inside it is rewritten.
- Ten path citations inside three archived changes get the new path. Seven
  pointers in live documents get it too: `CLAUDE.md:331`,
  `docs/current-state.md:17`, `docs/decisions.md:60` and `:112`, and
  `docs/roadmap-history.md:1894`, `:1923` and `:1936`.

No code, no test, no schema change. Nothing about engine, HTTP or UI behavior
moves. Only documents that describe already-shipped behavior change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Every enforceable rule the moved record states already sits in a living
spec: `definition-contract`, `cel-expressions`, `data-source-resolution`,
`form-ui` and `actor-from-field-assignment`. The design document records that
check, D by D.

The six items that move to `docs/decisions.md` record deferrals. A deferral
describes roadmap position rather than engine behavior. A reader takes a
deferral written as a requirement for a prohibition. This change therefore
writes none of them that way. It sets `skip_specs: true` instead.

## Impact

- `docs/decisions.md` (about 40 new lines plus two pointer paths),
  `docs/field-model-redesign.md` (moved, not edited), `CLAUDE.md`,
  `docs/current-state.md`, `docs/roadmap-history.md`, and eight files under
  `openspec/changes/archive/`.
- No change under `src/`, `packages/`, `test/` or `openspec/specs/`.
- This is change 3 of 3 in the doc-audit record-home sequence, and it lands
  last. It assumes `retire-ponytail-ledger-gate` and `code-review-record-home`
  already appended their own entries to `docs/decisions.md`.
