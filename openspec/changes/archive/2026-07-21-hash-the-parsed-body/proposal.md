# hash-the-parsed-body

## Why

`compileProcessBody` validates the authored body but discards the parse result and returns the raw input (spread, for the sink-injection path). All schemas are Zod strip-mode, so an unknown key anywhere in the authored JSON — an editor annotation, a typo'd optional — is not rejected: it flows into `definitionHash` and the persisted jsonb, but every read re-parses through `processBody.parse`, which strips it. The stored hash then disagrees with the hash of the body every resolver returns, so `rehydrate` throws `PinMismatch` for every instance pinned to that version, forever, through the documented-correct creation path. It also breaks "identical bodies get identical hashes": re-publishing the stripped round-trip of such a body mints a new version.

## What Changes

- `compileProcessBody` uses its parse output as the body it compiles and returns, on both paths: the `publishedProcessBody` idempotent early return and the authored path (`authoredProcessBody.parse`). Unknown keys are therefore stripped **before** the hash is computed, and the hash covers exactly the body a later read returns.
- `publishBody`'s two return paths become consistent: the insert path returns the compiled (parsed) body it persisted — no longer the raw input — matching the hash-hit path, which already returns `parseBody(row.body)`.
- Regression tests: publishing a body carrying an extra unknown key yields a stored/returned body without the key; `definitionHash(resolveBody(pin)) === pin.definitionHash` for such a publish; an instance created from the returned body rehydrates; re-publishing the read-back body is a hash-matched no-op.
- No schema change: strip-mode stays (the read path must keep accepting already-published bodies). The fix is that the write path hashes what strip-mode produces, not what it received.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `definition-store`: publish gains a normative round-trip guarantee — the persisted body, the returned body, and `definitionHash` all derive from the validated parse output, so a publish→read round trip is hash-stable and unknown authored keys never reach the hash or the store.

## Impact

- `src/schema/compile.ts` — `compileProcessBody`: assign the parse results instead of discarding them (both return paths).
- `src/engine/definitions.ts` — `publishBody`: return the compiled body on the insert path (it already is the parsed one once compile is fixed; the change is making that explicit and covered by tests).
- `test/definitions.test.ts` (round-trip/hash-stability regression), `test/cancel.test.ts` or `test/validate.test.ts` (compile returns stripped output).
- No migration needed for existing stored definitions: bodies published without unknown keys are unaffected; a body already bricked this way would need a re-publish, which this fix makes possible.
