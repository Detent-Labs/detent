## Why

`definitionStatus` (`src/schema/definition.ts:197`) declares four members:
`"draft"`, `"published"`, `"deprecated"`, `"archived"`. Only the first two
are ever written or compared anywhere in the repository. The other two are
ponytail-audit finding 40, carried over unresolved.

The finding's own text said the deletion "waits for a change of its own".
This file changes deliberately, never as a side effect of another task.

The archived change `2026-08-17-ponytail-cut-unreachable-code` already
excluded this deletion for that same reason. This change is that
deliberate follow-up. Narrow the enum to the two members the codebase
uses.

## What Changes

- Narrow `definitionStatus` in `src/schema/definition.ts` from
  `z.enum(["draft", "published", "deprecated", "archived"])` to
  `z.enum(["draft", "published"])`. No other line changes. Zod's `z.infer`
  derives the type, so `ProcessVersion["status"]` narrows with it. Every
  existing caller keeps compiling unchanged, since each one already only
  ever handles `"published"`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. No capability spec under `openspec/specs/` names
`definitionStatus`'s four member values. The `definition-store` capability
carries `status` as an opaque field it persists and returns. It never
enumerates the possible values. Removing two enum members nobody writes or
reads narrows a type. It changes no observable behavior, so no spec delta
applies. `.openspec.yaml` sets `skip_specs: true`.

## Impact

- **Code**: `src/schema/definition.ts`. One line changes.
- **Callers**: none. `definitionStatus` has exactly one consumer in the
  repo, `processVersion.status` (`src/schema/definition.ts:814`). The only
  site that constructs a `ProcessVersion["status"]` value hardcodes the
  literal `"published"` (`src/engine/definitions.ts:288`). Design.md
  carries the full verification.
- **Data**: none. The `definitions` table's `status` column
  (`src/engine/store.ts:213-221`) is a plain `text NOT NULL` with no CHECK
  constraint. No commit in the repository's history ever wrote
  `"deprecated"` or `"archived"` into it; design.md's git-history check
  confirms this. This change needs no migration.
- **definitionHash**: unaffected. `status` lives on the versioned wrapper
  `ProcessVersion`, outside `ProcessBody`. `definitionHash` is
  `JCS(ProcessBody)` only.
