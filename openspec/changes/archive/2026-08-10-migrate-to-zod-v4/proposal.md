## Why

Dependabot opened PR #9 on 2026-08-09. It bumps zod from 3.25.76 to 4.4.3.
`src/schema/definition.ts` is the JSON contract, expressed as Zod schemas. The
bump is therefore a deliberate contract-adjacent change. The contract rule
forbids carrying it as a merged dependency PR.

`tsc` fails in about twenty places, across seven files. v4 restructured the
internals the schema layer reads.

A second reason arrives with the first. `development-toolchain` already
requires an exact pin on a dependency the contract rests on. All three
manifests carry `^3.23.8`, a caret range. zod is the clearest case that rule
covers. The rule's only scenario names the CEL library.

## What Changes

- The engine root and `packages/web` move their zod `dependency` from `^3.23.8`
  to an exact `4.4.3`.
- `packages/form-ui` moves its zod `peerDependency` from `^3.23.8` to `^4.4.3`.
  It stays a range, because a peer declares compatibility rather than
  resolution.
- PR #9 bumps the first two and leaves `form-ui` behind. `form-ui` imports no
  zod value at all. Its types reach it from `workflow-engine/schema` as
  `z.infer` types. A peer range admitting v3 therefore resolves those types
  against a second zod.
- `src/schema/definition.ts` drops `z.ZodTypeDef` from `fieldDef`'s annotation.
  v4 removed the type.
- `src/schema/compile.ts` drops `z.AnyZodObject`, and `unwrapSchema` moves to
  v4's node shape. Its `ZodEffects` branch becomes dead code, because v4
  declares `refine` as returning `this`.
- `src/http/routes.ts` gives `z.record()` a key schema at two call sites. v4
  requires both arguments.
- `src/engine/config-descriptor.ts` moves seven reads off `_def`. A refined
  config schema now yields a descriptor. Under v3 it yielded `undefined`, and
  the studio area fell back to its raw JSON textarea.
- `src/engine/migration.ts`, `src/engine/outbox.ts` and `src/runtime/api.ts`
  take whatever the changed inference above requires. The compiler names each
  one during implementation.
- PR #9 closes. ROADMAP stage 28 moves to DONE.

No **BREAKING** change reaches an API consumer. v4's default issue messages
read differently, and a 422 body carries them. No reader matches on a zod issue
`code`. `src/`, `packages/web/src/`, `test/` and `docs/openapi.yaml` hold zero
matches.

## Capabilities

### New Capabilities

None. Every change here adjusts how the code writes a schema, or how the code
reads one.

### Modified Capabilities

- `development-toolchain`: the exact-pin requirement gains a scenario covering
  zod. It states why the contract rests on zod. `definitionHash` is the JCS
  hash of the parsed `ProcessBody`. A zod release that changes parse output
  therefore changes the identity of an already-published version.
- `studio-plugin-config-form`: a config schema carrying a cross-field rule now
  yields a generated form. The spec states that the form checks per-field rules
  alone, and that publish still applies the cross-field rule.

## Impact

- Dependencies: zod, in three manifests, plus `bun.lock`.
- Engine: `src/schema/definition.ts`, `src/schema/compile.ts`,
  `src/engine/config-descriptor.ts`, `src/engine/migration.ts`,
  `src/engine/outbox.ts`, `src/http/routes.ts`, `src/runtime/api.ts`.
- Browser: `packages/web` and `packages/form-ui` compile against v4. The studio
  area's plugin config form covers more types than before.
  `packages/web/src/areas/studio/registry/exampleRegistry.ts` is the one
  browser file importing zod.
- Documentation and tests: `ROADMAP.md`, `docs/current-state.md`,
  `docs/browser-checks.md`, `test/view-layout-hash.test.ts`, and the two new
  tests covering the widening.
- API: a 422 body carries v4's issue message text. The envelope shape holds.
- The gate for this change is `test/view-layout-hash.test.ts`. It pins each
  `examples/` body to its `definitionHash`. It passes with its expected hashes
  unedited, or the migration is wrong.
