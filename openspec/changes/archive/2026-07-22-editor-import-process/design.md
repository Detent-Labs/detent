## Context

Found while debugging why `examples/expense-approval.json` "loads blank" in
the editor: `checkDraftShape` (the load-guard) didn't validate the file's
top-level shape at all, so a `DefinitionVersion` wrapper silently passed
through as an all-`undefined` Draft. That's now fixed to reject the wrapper
with a clear error (unrecognized top-level keys) — correct per the
`editor-draft-io` spec, but it leaves no way to actually open an existing
process in the editor. This change adds that path.

The two file shapes in play:
- **Draft** (`packages/editor/src/draft/types.ts`): `DraftOf<AuthoredProcessBody>`
  — every field optional, no independent runtime schema, only load-guarded.
- **`DefinitionVersion` wrapper** (`examples/*.json`, anything pulled from the
  definition store): `{ processId, version, definitionHash, status,
  compatibility, publishedAt, definition: ProcessBody }`.

A precedent for unwrapping already exists:
`parseChildProcessJson` (`packages/editor/src/draft/io.ts`) accepts either
shape for a locally-loaded subprocess-child file and parses the unwrapped
value through the real `processBody` Zod schema.

## Goals / Non-Goals

**Goals:**
- Let an author turn an existing process file (wrapped or raw) into an
  editable Draft, strictly validated at the import boundary.
- Reuse the existing unwrap pattern (`parseChildProcessJson`) rather than
  inventing a second one.

**Non-Goals:**
- No provenance tracking (source `processId`/`version`/`definitionHash` is
  not retained or displayed). Re-publishing under an existing process's
  identity is an explicit, separate, engine-side action — out of scope here.
- No merge with the current in-progress Draft. Import replaces the
  workspace, same as Load draft does.
- No change to "Load draft"'s contract or the load-guard fix from this
  session.

## Decisions

**D1 — Import parses through `processBody`, not the load-guard.**
Unlike Draft load (deliberately relaxed — an in-progress Draft is
structurally incomplete by definition), an imported file claims to be a
*complete* process. Parsing it through the real `processBody` Zod schema
(same as `parseChildProcessJson`) gives strict, precise errors instead of
the load-guard's shallow shape check. Rejected: reusing `checkDraftShape` —
it can't express "this is a complete body," only "this doesn't look
absurd."

**D2 — Import strips the engine-injected cancel-sink before producing a Draft.**
A real published body (from the definition store, not a hand-authored
fixture like `examples/expense-approval.json`) has been through
`compileProcessBody` (`src/schema/compile.ts`), which injects a step with
`id: CANCEL_SINK_STEP_ID`, `key: CANCEL_SINK_KEY`, and — for a contracted
process — appends `RESERVED_CANCEL_OUTCOME` to `contract.outcomes`.
`authoredProcessBody` (what Export parses through, and what
`checkDraftShape`'s spirit assumes) explicitly rejects that reserved
identity. Without stripping it on the way in, an imported published process
would carry a step Export can never successfully re-emit — the Draft would
look loaded but be permanently unexportable. Import removes the step
matching `CANCEL_SINK_STEP_ID` and the reserved outcome from
`contract.outcomes` (both are no-ops if absent, so a raw/hand-authored body
like the example fixture round-trips unchanged). This mirrors
`compileProcessBody`'s injection as an explicit, one-time inverse — it is
not a general "undo compile" operation and doesn't need to be, since
publish-time compilation only ever adds this one thing.

**D3 — Auto-detect wrapped vs. raw shape by presence of `.definition`, same
as `parseChildProcessJson`.**
No explicit "what kind of file is this" prompt. Rejected: a user-facing
toggle — the shape is unambiguous from the file's own top-level keys
(`processBody`'s eight known keys vs. a wrapper's `definition` key), so
asking adds a step without resolving any real ambiguity.

**D4 — Import is a new File-panel action, not a mode of "Load draft."**
Keeping them separate keeps "Load draft"'s contract exactly as specced
(strict Draft round-trip, load-guard error semantics unchanged) and makes
Import's different validation (D1) and different failure mode (strict parse
errors, not load-guard issues) visibly a different action rather than a
silent branch inside the existing one.

## Risks / Trade-offs

- **A raw `ProcessBody` that was never compiled can't be told apart from one
  that was and simply has no cancel-sink (e.g. `examples/*.json`).** →
  Not a problem in practice: D2's strip is a no-op when the sink is absent,
  so both cases converge on the same importable Draft. Cross-checked
  against `processBody`'s own `superRefine` (`src/schema/definition.ts`,
  not just `authoredProcessBody`'s): it requires every `contract.outcomes`
  entry to be reached by a terminal step's `outcome`, so the strip must
  remove the sink step and `RESERVED_CANCEL_OUTCOME` from
  `contract.outcomes` together, in the same operation — an unpaired strip
  (only one side) would leave the Draft one step away from a broken
  contract the moment it's re-parsed (e.g. at Export). Task 1.2 already
  specifies both.
- **Losing provenance (D — Non-Goals) means an author can accidentally
  "fork" a published process without realizing it's no longer connected to
  its `processId`.** → Acceptable for v1: the editor has no publish action
  at all yet (Export only writes a local file), so there's no path to
  silently overwrite anything. Revisit if/when the editor gains a publish
  flow.
- **Strict `processBody` parse errors (D1) may be harder to read than the
  load-guard's messages, for an author who imports a hand-edited, slightly
  broken file.** → Acceptable: Zod's issue paths are precise; the import
  error surface (FileToolbar) already renders `Error.message` as-is.
- **`replace()` (`packages/editor/src/draft/store.tsx`) only swaps the
  Draft itself — `contentLocale`, `registry`, and `loadedChildren` are
  separate `useState`s it does not touch.** Importing a process authored in
  a non-"en" `baseLocale` while `contentLocale` is still `"en"` from a prior
  session shows fallback/empty content-locale text until the author
  switches manually; any subprocess-child files loaded for the previous
  Draft's steps stay in `loadedChildren`, now orphaned under step ids that
  don't exist in the new Draft. → Out of scope here: this is pre-existing
  "Load draft" behavior (same `replace()` call), not a regression Import
  introduces, and fixing it is a `editor-draft-model`/workspace-level
  concern, not specific to Import. Noted so it isn't mistaken for something
  this change was supposed to have handled.
- **D3's wrapper-detection (presence of a top-level `.definition` key) would
  misfire on a hypothetical raw `ProcessBody` that happened to also carry a
  spurious top-level `definition` key** — `processBody` is a plain
  `z.object()` (no `.strict()`), so Zod silently strips unrecognized keys
  rather than erroring on them, meaning such a file wouldn't surface the
  collision as an error before the (wrong) unwrap branch is taken. →
  Accepted: not a new risk (the identical heuristic already ships in
  `parseChildProcessJson`), and `processBody`'s required top-level fields
  (`key`, `label`, `baseLocale`, `fields`, `workflow`) make an
  accidentally-plausible collision implausible — a real raw body has no
  reason to also define `definition`, and if the wrong branch were somehow
  taken, the strict parse (D1) still rejects whatever doesn't satisfy the
  schema rather than silently loading a broken Draft.

## Open Questions

- None — small enough in scope that implementation can proceed directly.
