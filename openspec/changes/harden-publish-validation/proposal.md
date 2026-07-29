# Close the write-path validation gaps a published body can carry past

## Why

Six defects, one seam: what a body must satisfy *before* it becomes an
immutable published version. Every one of them ends with a definition the
engine accepted and cannot take back — published versions are immutable and
their pinned instances rehydrate against exactly that frozen body.

**The reserved `core.` ban is bypassable.** `compileProcessBody` returns early
whenever `publishedProcessBody.safeParse(body)` succeeds (`compile.ts:108-109`),
skipping `authoredProcessBody.parse(body)` at `:115` — the only place the
reserved prefix is rejected (`definition.ts:684-686`). `publishedProcessBody`
checks nothing but the cancel-sink count, so a hand-written body that merely
*adds* a well-formed terminal step with `id: "step_cancel_sink"` takes the
early return with `core.spawnSubprocess` / `core.returnSubprocess` actions
intact. `checkActionRegistry` does not catch them either: it filters
reserved-prefix actions out (`registry-check.ts:107`) on the explicitly stated
premise that they "can never be present in an authored body" — the premise
this path falsifies. Both internal handlers register with no `configSchema`,
so the forged `config` is entirely author-controlled. `makeReturnHandler`
requires only that the acting instance carry a `parent` link and that the
named parent be parked at that link's `stepId`; step ids are unique per
process but not globally, so an author can spawn a forged child and drive an
arbitrary outcome — plus an `outputMapping` writeback — into an unrelated
instance. Publishing is `system:publish`-gated, but the reserved prefix exists
precisely to keep engine-internal dispatch out of a publisher's reach.
`compile.ts:105-107`'s own comment asserts the falsified premise.

**`validation.pattern` is never compiled at publish** and is recompiled per
submission, per field, against participant-supplied strings
(`api.ts:373-375`, the only `new RegExp` site in `src/`). An uncompilable
pattern such as `"("` publishes cleanly and then throws `SyntaxError` on every
submission touching that field, mapped to a generic 500 — permanently bricking
a step in an immutable version, remediable only by publishing a new version
and migrating every pinned instance. A backtracking pattern runs against a
submitter-controlled string with no length bound, because `maxLength` pushes a
violation and *falls through*; JS `RegExp` has no timeout and the HTTP server,
outbox worker, timer scheduler and resolution worker share one event loop.

**Authored bodies silently drop unknown keys.** Every object in the contract
is a plain `z.object` (Zod 3 `strip`), and `compileProcessBody` hashes and
stores the parse *output*. Reproduced by execution: a path authored with
`gaurd` compiles to a path with **no guard at all** — a conditional transition
becomes an unconditional default. The same mechanism deletes misspelled
`onEntry`/`onExit` actions and turns a misspelled `terminal` into a
non-terminal step. The same module uses `.strict()` for `InstanceEvent`
payloads with the rationale that "an extra or missing key is a parse error
rather than a silently mismatched record" — the authoring path, where a typo
changes process *semantics*, is the lenient one. With Studio's JSON surface a
first-class authoring path, hand-written JSON is normal input.

**Two id positions are never resolved.** `SubprocessSpec.outputMapping` keys
are parent `FieldId`s, but the superRefine resolves only `Action.output`
targets and `validateCrossProcess` checks only `inputMapping` against the
child contract. `ProcessContract.inputFields`/`outputFields` are bare
`z.array(fieldId)` resolved nowhere — `src/cel/check.ts:78-80` defers to a
check that does not exist. Verified by execution: a body with
`outputMapping: { field_does_not_exist: ... }` and bogus contract field ids
passes cleanly. At runtime the parent writes the patch under an id no field
declares — unreachable from every view and every guard — and a bogus id in
`contract.outputFields` shrinks the child-data schema, turning a legitimate
`child.data.<key>` reference into an "unknown field" publish error attributed
to the *parent*.

**`FieldDef.key` has no format constraint** (`definition.ts:263`), though it
is exactly the name registered as a CEL variable and the key
`buildGuardContext` re-keys instance data onto. `""`, `"my-field"` or `"true"`
publish cleanly and make the field unreferenceable: `data.my-field` is a parse
error, so the failure surfaces on some unrelated expression. Data-source keys,
registered as CEL variables nowhere, *do* get a reserved-namespace check.

**Nothing bounds size or depth** between an HTTP request and persisted state.
`Bun.serve` gets no `maxRequestBodySize`, so its 128 MiB default applies to
every route; `saveDraft` validates only the envelope (deliberately) and its
`processId` is an unvalidated path segment, so the draft *row count* is
unbounded too; and no authored string field has a `.max()`.

## What Changes

- One placement rule, applied six times: **every write-path structural check
  runs inside `compileProcessBody`, before its idempotent early return**,
  beside `validateDurations` — the position that already exists for exactly
  this reason and that the `core.` bypass proves is the only bypass-proof one.
  Each check reports located issues in the `DurationIssue` shape rather than
  throwing on the first.
- The reserved `core.` action-prefix ban moves there, so it applies on both
  compile branches. The cancel-sink id/key/outcome checks stay in
  `authoredProcessBody` — a *compiled* body legitimately contains all three.
- An unknown-key walk rejects any key not declared by the schema at any depth
  of the authored body, with a located path. `processBody.parse` on stored
  bodies keeps stripping, unchanged.
- Every catalog `validation.pattern` is compiled at publish and its source
  length capped; at runtime the pattern test runs only when the length
  constraints passed, and the compiled `RegExp` is cached per immutable body.
- `SubprocessSpec.outputMapping` keys and `ProcessContract.inputFields` /
  `outputFields` are resolved against the process's own recursive field set.
- `FieldDef.key` must match `/^[a-z_][a-z0-9_]*$/`.
- Length bounds on the authored strings that reach an interpreter or an index:
  `key`, `pattern`, `Plugin.type`, every `duration`, and `Expression.src`.
- Transport and draft bounds: `maxRequestBodySize` on `Bun.serve`, and a
  serialized-size check in `checkEnvelope` so the draft bound survives a
  future non-HTTP caller.
- `checkActionRegistry` drops its reserved-prefix `.filter()`, and the two
  internal handlers get real `configSchema`s — defense in depth behind the
  compile-pass ban, not the primary fix.

## Capabilities

### Modified Capabilities

- `definition-contract`: gains the write-path check placement rule and the
  five new authoring-time invariants (unknown keys, reserved prefix on both
  branches, compilable pattern, identifier-shaped field key, resolved
  `outputMapping`/contract field lists, bounded authored strings).
- `action-registry-validation`: reserved-prefix action types are validated
  rather than skipped, and the two engine-internal handlers declare config
  schemas.
- `http-wrapper`: the server declares a maximum request body size instead of
  inheriting Bun's 128 MiB default.
- `process-drafts`: the envelope check gains a serialized-size bound.
- `runtime-api`: the submission-time pattern test is conditional on the length
  constraints having passed, and uses a per-body cached `RegExp`.

## Impact

- `src/schema/compile.ts` — the new checks and their issue types; this file
  grows the most.
- `src/schema/definition.ts` — the reserved-prefix refinement moves out of
  `authoredProcessBody`; the two id-resolution checks are added as compile-pass
  walks rather than superRefine entries (see design.md: the base schema is
  also the read path).
- `src/engine/registry-check.ts`, `src/engine/subprocess.ts` — the dropped
  filter and the two `configSchema`s.
- `src/runtime/api.ts` — conditional pattern test plus the compiled-pattern
  cache.
- `src/http/server.ts` — `maxRequestBodySize`; `src/engine/drafts.ts` — the
  envelope size check.
- **BREAKING for authors**, deliberately: a body with a misspelled key, a
  non-identifier field key, an uncompilable pattern, an unresolvable
  `outputMapping` target or an oversized expression now fails to publish
  instead of publishing with silently different semantics. Already-published
  bodies are unaffected — every check is on the write path, so nothing already
  stored becomes unreadable or unrehydratable.
- `examples/` and any fixture body must be re-validated; a fixture that
  currently relies on stripping will fail and must be corrected, which is the
  point.
- Tests: one rejecting test per new invariant (the repo's standing rule),
  plus the SEC-3 regression test in the *additive* shape — the existing test
  at `test/cancel.test.ts:121` passes only incidentally, because it renames
  step[0] and thereby breaks `initialStep` resolution.
