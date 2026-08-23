## Why

`src/schema/definition.ts` is both the authoring schema and the deserializer for
stored published bodies. From that pairing the repo derives a hard rule. No
refinement in `definition.ts` may ever tighten. A tightened refinement makes an
already-published body throw on READ, and its pinned instances become
unrehydratable. Every invariant that may tighten therefore lands on the write
path in `src/schema/compile.ts`.

The rule rests on a claim about blast radius. `test/validate.test.ts:681` states
it:

> the resolveBody call sits outside the per-instance try, so one such body would
> starve every other due instance

`openspec/specs/timers/spec.md:437` repeats that claim as spec text. All three
body-resolving workers contradict it.

- `timers.ts:71` opens the per-instance try and `:73` calls `resolveBody`. The
  catch at `:84` logs, pushes the row out of the scan and continues.
- `resolution.ts:89` opens the per-instance try and `:95` calls `resolveBody`.
  The catch at `:107` leaves the instance claimed for lease-expiry retry. Its
  `:90` comment names the containment as deliberate design.
- `outbox.ts:266` resolves inside the per-row try. A resolver miss skips the
  field-type check for that row alone, and delivery still proceeds.

An unrehydratable body parks its own instance. It does not stop a worker.

The project is pre-1.0 with nothing deployed. No published body needs to
survive a tightening.

## What Changes

- The read-path risk stops being an automatic veto on schema-layer placement.
  Placement of a new invariant becomes a judgment call. Each invariant argues
  its own placement against two properties that still hold. Those are an
  unbypassable check and a parseable stored body.
- **BREAKING** for the spec, not for any running system. This change withdraws a
  guarantee. A stored body no longer always parses under a later schema. A
  tightening may strand a body published before it. The blast radius is that
  body's own instances.
- This change deletes the false starvation claim from
  `openspec/specs/timers/spec.md`, `test/validate.test.ts` and every code comment
  repeating it.
- The duration requirement in `timers` keeps its publish-path placement. It rests
  on the arming-totality argument that spec already carries at lines 443 to 452.
  This change does not touch that argument.
- Existing checks stay in `compile.ts`. Their placement independently buys an
  unbypassable check, which survives this change.
- Storage immutability and instance pinning stay exactly as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-contract`: the governing placement rule. Two passages justify a
  write-path check by the read path, at lines 607 to 609 and 719 to 721. This
  change withdraws that reasoning and puts a two-criterion placement rule in
  its place.
- `timers`: the duration-placement requirement at line 426. Its rationale
  asserts the worker-starvation claim this change refutes. The publish-path
  requirement stands on its other stated ground. The read-path prohibition
  becomes a consequence of the `definition-contract` rule, not an absolute of
  its own.

## Impact

- `.claude/rules/authoring-invariants.md`: the placement paragraph, and each
  invariant citing the read-path reason.
- `.claude/rules/process-contract.md`: the hashing and versioning passage.
- `.claude/skills/openspec-review-change/SKILL.md:119` to `:122`: the
  checklist question states the withdrawn absolute-veto framing. The
  mandatory grep sweep (task 4.3) catches this too. This file earns its own
  Impact entry: it is the review checklist this process runs against.
- `openspec/config.yaml`: its `context:` block carries the withdrawn reason
  verbatim.
- Code comments stating the withdrawn reason: `src/schema/definition.ts:149`,
  `:294`, `:503`, `:280` to `:281`, `src/schema/compile.ts:69`, `:458` to
  `:461`, and `src/engine/definitions.ts`'s module header JSDoc (the
  "Publish is the enforcement point" paragraph).
- Test comments stating the withdrawn reason live in
  `test/definitions.test.ts`, above two tests. One is
  "re-publishing an already-stored body is a no-op". The other is "a body
  stored before the check still reads".
- `openspec/specs/cel-expressions/spec.md:152` to `:155` stands as written. It
  states a true consequence and never the starvation claim. CEL checking needs
  the CEL library, so a Zod refinement cannot host it either way.
- `test/validate.test.ts:676` to `:690` holds the layering assertion. Its
  write-path half stays and its read-path half goes. A second comment block
  at `test/validate.test.ts:603` to `:608` sits above the
  `describe("timer duration", ...)` block. It restates the same withdrawn
  framing and needs the same treatment.
  `test/compile-validation.test.ts:480` and `:575` repeat the reason.
- `test/timer.test.ts`: read only, to confirm the poison-instance
  requirement's existing coverage names the containment test correctly (task
  1.3).
- `openspec/specs/timers/spec.md`'s `## Purpose` section (lines 14 to 17)
  restates the withdrawn reasoning too, outside any requirement body the
  delta mechanism reaches. A direct hand-edit fixes it at archive time (task
  4.2), not the delta spec. Design.md's Open Questions names the tooling
  uncertainty this raises.
- `reject-unsatisfiable-required-readonly`'s check placement beside
  `checkTechnicalFields` no longer needs the read-path veto as a
  justification. Once this change lands, the unbypassable-check criterion
  supports the same placement on its own.
- This change does not affect that change's duplicated writer-set helper.
  The package boundary causes that duplication: the engine cannot import
  `packages/web`. The two functions also read different types, `Draft`
  versus `ProcessBody`. Its own design.md states both reasons, independent
  of this change's placement rule. This change leaves that change alone.
- No engine behavior changes. No schema key moves. Every stored body keeps its
  `definitionHash`.
