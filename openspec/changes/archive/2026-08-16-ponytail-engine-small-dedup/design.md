## Context

See proposal.md for motivation. What follows is the measured state the
approach rests on.

`src/engine/templates.ts` already imports from `src/engine/drafts.ts`. It
takes `MAX_DRAFT_ENVELOPE_BYTES`. The comment above that export
(`drafts.ts:102`) states the reason. A template seeds a draft, so one bound
covers both. No body can be legal as one and oversized as the other.

Three helpers stand in both files. `parseJsonb` (`templates.ts:68`,
`drafts.ts:66`) and `isJsonObject` (`templates.ts:93`, `drafts.ts:93`) agree
byte for byte, comment included. Each `checkEnvelope` opens with the same
two `isJsonObject` guards and closes with the same size bound. Only the
noun in the message differs. Between those halves, `drafts.ts` checks
`revision` and `baseVersion`; `templates.ts` has neither field.

A third `parseJsonb` sits at `src/engine/host.ts:115`. It behaves
differently: it catches a `JSON.parse` error and answers `undefined`.
The other two let the throw escape.

In `src/engine/registry-check.ts`, `collectAssignments` (line 135) and
`collectDataSources` (line 163) are private. The file exports neither, and
no test names either one. Each has one caller, and each caller maps the
result into `{loc, type, config}` on the next line.

The tests that cover this code assert error classes, not error strings.
Two suites expect `RequestShapeError`: `test/drafts.test.ts:190` and
`test/templates.test.ts`. The spec at
`openspec/specs/process-drafts/spec.md:132` requires the class and the
untouched-row guarantee, and names no message text.

## Goals / Non-Goals

**Goals:**

- One copy of each shared helper, reachable from both `drafts.ts` and
  `templates.ts`.
- Every thrown message stays the string it is today, including the noun.
- No new file, no new dependency, no change to the engine package's
  exports map.
- The two site collectors in `registry-check.ts` go, and the checks read
  the same as the action check beside them.

**Non-Goals:**

- The `parseJsonb` string guard. Whether `Bun.sql` ever hands back raw
  text on these two relations is a behavior question over ten further
  sites. It gets its own change or none.
- The three `parseJsonb` variants merging into one. `host.ts`'s answers
  `undefined` on malformed text and the other two throw.
- `toTemplate` and `toDraft`. The two rows carry different columns.
- The zod rewrite of the whole envelope check. See the second decision.

## Decisions

### The shared helpers live in `drafts.ts`

`drafts.ts` already exports the bound the shared size check reads, and
`templates.ts` already imports it. Adding `parseJsonb` and
`checkJsonEnvelope` to that same import widens one line and deletes three
functions.

The alternative is a new module, `src/engine/json-envelope.ts`, holding
all three helpers. That module needs `MAX_DRAFT_ENVELOPE_BYTES`, which
lives in `drafts.ts`, so either the bound moves too or the two modules
import each other. Moving the bound touches `test/templates.test.ts:10`,
which imports it from `drafts.ts`. One more file and one more churned
import buy nothing here.

`isJsonObject` needs no export. After the change only `checkJsonEnvelope`
reads it, and both sit in `drafts.ts`.

### `checkJsonEnvelope` takes a noun, not a schema

The audit asks for `z.object({revision: ..., baseVersion: ...}).parse`.
That rewrites the half the two files do **not** share: `templates.ts`
carries neither field. It also replaces four hand-written messages with
zod's, and `docs/current-state.md:1315` states the rules those messages
carry.

The shared half is the other one. So `checkJsonEnvelope(kind, body,
layout)` holds the two object guards and the size bound, and `kind`
carries `"draft"` or `"template"` into each message. `drafts.ts` keeps
its `revision` and `baseVersion` checks inline, right after the call.

This keeps every message byte for byte. The throw order shifts by one
step: `drafts.ts` runs body, layout and the size bound, then `revision`
and `baseVersion`. Today the size bound runs last. The Risks section
below carries the check on that shift.

### `host.ts`'s `parseJsonb` stays where it is

Merging it into the shared helper would change behavior on malformed
stored text. The data-list reads would start to throw where they answer
`undefined` today. `src/http/admin-routes.ts` calls it at six sites and
`test/data-list-columns.test.ts:14` imports it. That is a behavior
question with its own blast radius, and this change does not open it.

### `registry-check.ts` inlines the collectors

The archived change `2026-07-26-check-typed-config-helper` left the
collectors standing. Its `design.md:35` records that as a scope line for
that change: it shared the validation loop and nothing else. It states no
rule against inlining them later.

`checkActionRegistry` is the shape to match. Its `collect(body)` visits
five action positions and earns its name. `collectDataSources` is one
`.map` over `body.dataSources ?? []`, and `collectAssignments` is one
`forEach` with an `if`. The next line reshapes each result, so the
intermediate `AssignmentSite` and `DataSourceSite` types exist for one
statement each.

### No new test

Both findings keep every input, output and thrown class the same. The
suite already covers both paths. `test/drafts.test.ts` and
`test/templates.test.ts` drive the envelope on both sides.

The three registry checks sit in three files, one each.
`test/registry-check.test.ts` covers `checkActionRegistry`.
`test/assignment-registry.test.ts` covers `checkAssignmentRegistry`.
`test/data-source-registry-check.test.ts` covers
`checkDataSourceRegistry`. A new test here would assert what those
already assert.

## Risks / Trade-offs

- A message noun drifts when `kind` reaches the wrong message → all four
  message strings stay in one function. The two callers pass one literal
  each. Both `test/drafts.test.ts` and `test/templates.test.ts` exercise
  every branch of that function.
- The size bound now runs before the `revision` and `baseVersion` checks →
  both raise `RequestShapeError` and leave the row untouched. A save that
  breaks two rules at once reports the size one. One violation per case is
  what `test/drafts.test.ts:176` submits. The spec at
  `openspec/specs/process-drafts/spec.md:132` names the class and the
  guarantee, not an order.
- `drafts.ts` grows a second consumer for two more symbols → it already
  has one for `MAX_DRAFT_ENVELOPE_BYTES`, documented at `drafts.ts:102`.
  Nothing outside `src/engine` reads either symbol, and the exports map
  publishes neither.

## Migration Plan

None. No database change, no stored shape, no wire shape. Deployment is
the ordinary build. Rollback is a revert of the one commit.

## Open Questions

- Does `Bun.sql` ever hand back raw text for the `drafts` and `templates`
  jsonb columns? If it never does, the string guard in `parseJsonb` is
  dead, and ten further inline sites collapse with it. The answer changes
  nothing in this change: the guard stays either way. It stays filed in
  `PONYTAIL-AUDIT.md` as the open half of finding 9.
