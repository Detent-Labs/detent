## Context

See `proposal.md` - Why. Three facts about the current code shape this
design.

`MigrationSpec` (`src/schema/definition.ts:749`) is five optional keys.
Three are `z.record`: `stepMap` and `fieldMap` map id to id, `transforms`
maps a target field id to an `Expression`. The other two are the
`onUnmappable` enum and `unmappableStep`. Two refinements guard it. The
first ties `unmappableStep` to `route-to-step`. The second demands an
injective `fieldMap`.

`registerMigrationPlan` (`src/engine/migration.ts:146`) re-parses the spec
with `migrationSpec.parse` and stores the parsed result. Zod strips an
unknown key, so no key outside the five survives a save. It then runs
`validatePlan`. That resolves every id against the two published bodies.
It also rejects the reserved cancel-sink as a `stepMap` value or as
`unmappableStep`.

`getVersionBody(processId, version, token)` already exists in
`packages/web/src/areas/studio/api/client.ts:97`. `VersionsScreen`,
`ProcessesScreen` and `ToolsScreen` all call it. It returns the compiled
body, cancel sink included.

## Goals / Non-Goals

**Goals:**
- One state for the plan, whichever side of the Form/JSON switch is open.
  Two states would let the sides disagree.
- A lossless round trip, including for an entry the form cannot resolve.
- No engine change, no route change, no schema change.

**Non-Goals:**
- A CEL builder for a `transforms` expression. That is ROADMAP stage 27b,
  and it needs its own design.
- Client-side duplication of `validatePlan`. The form checks only what it
  can evaluate from the two bodies it already holds.
- Editing a frozen plan. A plan with an `appliedAt` keeps today's
  behavior: the warning shows, and the server rejects the save.

## Decisions

### The form model is the spec, not a parallel structure

The form holds `MigrationSpec` itself, plus an ordered row list per map so
the browser can render a stable list. A row is `{ rowId, from, to }` for a
map, or `{ rowId, target, src }` for a transform. `rowId` is a render key
only and never reaches the plan.

**Alternative**: a richer editor model carrying resolved field objects and
per-row status, converted to a spec at save. Rejected. Every conversion is
a chance to lose an entry. The spec is already the simplest shape for this
data.

<!-- antislop: allow synonym-rotation -->
This is why ROADMAP stage 27's read-back problem does not apply here.
Stage 27b names it for a CEL guard. A builder emits text, and reading that
text back needs a parser. A `MigrationSpec` holds structured data, not a
language. The form reads back what it wrote by holding the same object.
The one free-text position, a `transforms` expression, stays a text input
and therefore round-trips as its own source string.

### An unresolved id is a row, not a dropped entry

A row whose id is absent from the matching catalog keeps that id and shows
it marked as unresolved. It saves unchanged.

`validatePlan` makes this rare. A plan stored through `PUT` resolved
against both bodies when its author saved it. A published version is
immutable. Two cases remain. Someone writes a plan straight to the
database. Or a body request answers for another version.

Dropping such a row would be the worst behavior available. An author who
opens a plan, edits one unrelated row and saves would silently lose the
other entry. That is the "silently diverging from raw JSON" case the
stage warns about.

### Both bodies load once, on screen open, beside the existing plan request

`MigrationPlanScreen` already loads the plan in one effect. The two body
requests join it, through `Promise.allSettled`. A failed body request
leaves `bodies` undefined and forces the JSON side, with the reason on
screen. A failed plan request keeps today's error banner and its retry
button.

**Alternative**: load a body only when the author opens the form side.
Rejected. It adds a second loading state inside the switch for no gain,
since the form is the default side.

### The switch converts through the plan object, and refuses on a parse error

The Form side holds the plan. The JSON side holds text. Moving to JSON
formats the plan with the existing `formatSpecText`. Moving to Form parses
the text with the existing `parseSpecText`. A parse error keeps the author
on the JSON side and shows the message the save path already shows.

This is the rule that keeps the two sides from becoming two sources of
truth. Text is the JSON side's own state, and the plan is the shared one.
Text that is not a plan cannot leave the JSON side.

### The client-side checks are the three the browser can evaluate

Injectivity, `fieldMap` type agreement, and the cancel-sink rejection.
Each needs only the plan and the two catalogs.

Everything else stays on the server. The `transforms` expressions need
CEL type inference against the target catalog. That inference lives in
`src/cel/check.ts`, on the engine's side of the boundary. The
identity-carried type check `validatePlan` runs over fields with no
`fieldMap` entry stays there too. It is a whole-catalog check, not a
per-row one, so it has no row to attach an inline error to.

### The reserved cancel-sink step is hidden from the pickers that forbid it

`workflow-engine/schema` exports `CANCEL_SINK_STEP_ID`. The web package
already reaches that module through the exports map. The `stepMap` target
picker and the `unmappableStep` picker leave it out. The `stepMap` source
picker keeps it, because `validatePlan` rejects it only as a value.

An inline error still covers the case, for a stored plan that already
names it.

## Risks / Trade-offs

- Two large bodies load on every screen open. One plan request loaded
  before.

  → `VersionsScreen` already makes the same two requests for a diff. A
  body is small enough to diff key by key in the browser.
- A client-side check can disagree with the server, if `validatePlan`
  tightens later.

  → The form never blocks a save on its own finding. It shows the error
  and lets the server answer. A stale client check is then a wrong
  warning, never a wrong rejection.
- A row list keyed by `rowId` reorders a map's keys. The stored plan had
  another order.

  → `definitionHash` does not cover a migration plan. `migrationSpec.parse`
  treats a record as unordered. The round-trip test compares parsed
  objects, not text.

## Migration Plan

No data migration and no new persisted state. The change is one browser
bundle. Rollback is a code revert, and a plan this form writes is
readable by the code before it.

## Open Questions

None.
