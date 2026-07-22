## Context

The repo is a single Bun package today: `src/` (schema + engine),
`test/`, `examples/`, one root `package.json`. `src/schema/definition.ts`
is the contract (Zod schemas, TS types via `z.infer`); `src/cel/check.ts`
holds authoring-time CEL validation; `src/schema/compile.ts` injects the
cancel-sink at publish time. The brainstorming session that produced
`docs/superpowers/specs/2026-07-22-editor-v1-scope-design.md` fixed six
architecture decisions (workspace boundary, target user, authoring surface,
validation strategy, file-based workflow end, draft-model requirement) and
left the draft-model's concrete shape and the graph-rendering library for
this design doc to resolve.

Stakeholders: engine remains the single source of truth and must not
change; the editor is a new consumer, not a co-owner of the contract.

## Goals / Non-Goals

**Goals:**
- Promote the repo to a Bun workspace with zero file moves for existing
  code — the boundary is an `exports` map, not a directory split.
- Define the Draft model precisely enough to implement: its relationship to
  `AuthoredProcessBody`, id-minting rules, and how "validate" maps onto a
  real parse through the contract schemas.
- Pick a concrete rendering/layout approach for the read-only graph view.
- Specify how located validation issues (Zod issues, `CelIssue[]`,
  `RegistryValidationError` issues, duration errors) attach to Draft
  entities so panels and the graph can highlight them.

**Non-Goals:**
- Canvas editing (drag-to-connect), multi-user collaboration, auth/rights
  UI, an HTTP API, publish integration, a CEL-abstracting condition
  builder, migration-plan authoring, simulation/test-run of a definition —
  all explicitly deferred per the proposal.
- Any change to `src/schema/definition.ts`, `src/cel/check.ts`,
  `src/schema/compile.ts`, or engine runtime behavior.
- Choosing the eventual publish/HTTP-API design (named follow-up #1).

## Decisions

### 1. Workspace shape: root stays the engine package
Root `package.json` gains a `workspaces` field (`["packages/*"]`) but keeps
its existing `name`, `src/`, `test/`, `examples/` in place — it doubles as
the engine package's own manifest. `packages/editor` is the only new
package. This matches the brainstorming decision literally ("no file
moves; the boundary is enforced by the exports map") and avoids a
mechanical rewrite of every existing import path in `src/`/`test/`, which
carries no benefit here and risk of breaking the pinned `Bun test`
suite/DB fixtures.

*Alternative considered*: move existing code to `packages/engine`. Rejected
— pure churn for this change; nothing about the editor requires the engine
to be relocated, and the brainstorming session already ruled it out.

### 2. Contract surface: `exports` map on the root package, linked via `file:..`
Root `package.json` (`"name": "workflow-engine"`) adds:
```json
"exports": {
  "./schema": "./src/schema/definition.ts",
  "./cel/check": "./src/cel/check.ts",
  "./schema/compile": "./src/schema/compile.ts"
}
```
`packages/editor` depends on it as `"workflow-engine": "file:.."` — an
explicit local-path dependency, not `workspace:*`. The root package is
declared as the workspace *root* (it owns the `workspaces` field) but is
not itself matched by the `workspaces: ["packages/*"]` glob, so it is not
a workspace *member* other members can address via the `workspace:`
protocol; `workspace:*` resolution for a self-referencing root is not a
guaranteed capability across npm-compatible package managers, so this
design does not rely on it. `file:..` is a plain relative-path dependency
that every npm-compatible installer, Bun included, resolves to a local
symlink with no registry fetch — the same practical outcome (edits to
`src/` are visible to the editor without reinstalling) reached by a
guaranteed-to-work mechanism instead of an unverified one.
`src/engine/*` is not exported, so it is unreachable from the editor at
the type level, not just by convention. `./schema/compile` is included
because the live-validation capability needs the cancel-sink-injecting
`compile` step to preview what publish will do to the body, per the
brainstorming doc.

*Alternative considered*: `"workflow-engine": "workspace:*"`, relying on
Bun resolving the workspace root as a linkable member. Rejected — this
would need the root package to also appear in its own `workspaces` glob (or
an equivalent Bun-specific self-reference), which is a self-referential
pattern most workspace tooling does not document as supported; validating
it empirically before committing to it is more risk than `file:..` carries,
for no behavioral difference in this repo.
*Alternative considered*: a barrel file re-exporting a curated subset.
Rejected — an extra indirection layer that still has to enumerate the same
three modules; `exports` achieves the restriction natively and is
enforced by the resolver, not just by what the barrel happens to omit.

### 3. Draft model: a TS-level `DraftOf<T>` mapped type over the imported types, no parallel Zod schema
The brainstorming doc's non-negotiable is explicit: "the editor imports
the schemas and re-types nothing." A hand-written Draft Zod schema
duplicating every entity's field list (steps, paths, fields, actions,
timers, contract) — even with relaxed required-ness — *is* re-typing: it
is a second, hand-maintained declaration of the same shape `definition.ts`
already declares, and it drifts the moment a field is added to one but not
the other with nothing to catch it until a round-trip test happens to
exercise that field.

Instead, the Draft's editing-time representation is a plain TypeScript
type: a recursive `DraftOf<T>` mapped type
(`packages/editor/src/draft/types.ts`) applied to the *imported* TS types
from `./schema` (`AuthoredProcessBody`, and transitively `Step`, `Path`,
`FieldDef`, `Timer`, `Action`, etc., all already exported via `z.infer`).
`DraftOf<T>` makes every property optional recursively and is written
once, generically, against no entity-specific field list — it has nothing
to keep in sync as `definition.ts` gains fields, because it never
enumerates them. This is a compile-time-only relaxation with no runtime
schema of its own: the Draft has no independent notion of "valid," only
TypeScript's structural typing over the same fields the contract defines.
Two runtime-facing needs remain and are each solved without re-declaring
business shape:
- **Load-safety** (a file loaded from disk must not crash the editor on
  malformed JSON): a generic, entity-agnostic structural check (is it a
  JSON object, are known top-level keys the right JS type — array,
  object, string) using a single small hand-written schema in
  `draft/load-guard.ts`, deliberately far looser than the contract and
  never asked to express a business invariant.
- **Real validation**: unchanged from before — the editor assembles the
  current Draft into the shape of `AuthoredProcessBody` and runs it
  through the actual, imported `authoredProcessBody` Zod schema plus
  `validateProcessBody` (CEL), `checkActionRegistry`, and
  `validateDurations`, collecting every issue. This *is* importing the
  schema and asking it the real question, which is what "re-types
  nothing" is protecting: the contract's own parser is the only thing
  that ever decides whether a Draft is valid.

*Alternative considered*: a hand-written sibling Zod schema (the original
draft of this decision). Rejected on reflection for the re-typing reason
above — it was chosen originally because Zod's `.deepPartial()` cannot be
applied to `definition.ts`'s exported schemas (they are `ZodEffects` after
`.refine()`/`.superRefine()`, which does not expose `.partial()`), but
that obstacle is specific to the *runtime* Zod objects, not to the
*inferred TypeScript types*, which is where `DraftOf<T>` operates instead
— sidestepping the obstacle rather than working around it with a
hand-written duplicate.
*Alternative considered*: relax the *existing* contract schema with an
editor-mode flag threaded through it. Rejected — this leaks editor-mode
leniency into engine-side parsing if the flag were ever passed
incorrectly, which is a worse failure mode than anything the two
alternatives above carry.

### 4. Id-minting: editor mints on creation, never on save
Every new entity (step, path, field, timer, action, contract outcome)
gets its prefixed UUIDv4 id (`crypto.randomUUID()` + prefix, same scheme
as engine runtime ids) at the moment it is created in the Draft, not at
export time. This keeps ids stable across the editing session — a path
drawn before its target step exists still references the step's id, not a
placeholder that gets rewritten later — and matches the contract's
"id is the sole reference anchor" rule: nothing in the Draft ever
references another entity by array position or transient key.

### 5. Graph view: elkjs layout + React Flow (xyflow) rendering
The editor UI is a React + Vite app. The read-only graph view lays out
steps as nodes and paths as edges using `elkjs` (deterministic, dependency-
free layered layout — the standard choice for FSM/flowchart auto-layout in
TS) and renders through `@xyflow/react` (React Flow), which accepts
pre-computed node positions and needs no editing affordances enabled since
canvas editing is out of scope. Validation issues attach as node/edge data
(`data.issues: CelIssue[] | ZodIssue[]`) so the graph and the panels read
off the same issue list — one validation pass, two presentations.

*Alternatives considered*: `dagre` (unmaintained, coarser layout options
than elkjs for a state-machine's typically-narrow, cyclic graphs);
hand-rolled SVG layout (reinvents layered graph layout for no benefit,
since the view is read-only in v1 and doesn't need custom interaction
handling canvas editing would eventually require).

### 6. Issue-to-entity mapping
Every validator already returns located issues: Zod issues carry a `path`
array into the parsed object; `CelIssue` carries a `site` identifying the
step/path/action/timer and field; `RegistryValidationError` issues carry
the action's position. The editor normalizes all three into one
`EditorIssue { entityType, entityId, message, source }` shape at the
validation boundary (`packages/editor/src/draft/validate.ts`), so panels
and the graph view consume a single list and never branch on which
validator produced an issue.

### 7. Draft file I/O: plain JSON on disk, browser File System Access API
"File-based" is implemented via the browser's File System Access API
(`showOpenFilePicker`/`showSaveFilePicker`) for load/save of `.draft.json`
files, with the `AuthoredProcessBody` JSON export using the same save
picker. No filesystem access from a server process, no Electron shell —
this keeps the editor a static, servable web app per the "no server, no
DB, no HTTP API" constraint. Browsers without File System Access API
support fall back to `<input type=file>` for load and a download-triggered
`<a>` for save/export (functionally file-based, just without in-place
overwrite).

### 8. Typecheck orchestration: per-package scripts, one root entry point
Today `bun run typecheck` runs a single `tsc --noEmit` covering `src` and
`test`. That invocation does not see `packages/editor` and must not be
widened to include it directly (a workspace member's TS settings —
`jsx`, `lib: ["dom"]` — do not belong in the engine's `tsconfig.json`).
`packages/editor` gets its own `typecheck` script and `tsconfig.json`;
the root `typecheck` script becomes an orchestrator that runs the engine's
own `tsc --noEmit` and then each workspace member's `typecheck` script.
The exact fan-out mechanism (`bun run --filter './packages/*' typecheck`
if the pinned Bun version supports `--filter`, otherwise an explicit `&&`
chain naming each member) is verified empirically in task 1, since it
depends on the Bun version pinned in `.devcontainer/Dockerfile` rather
than on anything this design can assert in advance.

*Alternative considered*: a single root `tsconfig.json` with `include`
widened to `packages/editor/**`. Rejected — the editor needs
browser/DOM lib settings the engine's strict Node-oriented config should
not carry, and a shared config would let an editor-only relaxation leak
back onto `src/`.

## Risks / Trade-offs

- **[Risk]** `DraftOf<T>`, applied to `FieldDef`'s recursive type (the one
  hand-written, non-inferred type in `definition.ts`, backing its `z.lazy`
  schema) or to a `Literal`/discriminated-union field, could recurse
  incorrectly and produce a Draft type that is too strict (rejects a
  legitimate mid-edit shape) or too loose (masks a real mistake until the
  real parse in task 2.5 catches it late) → **Mitigation**: `DraftOf<T>`
  is a small, generic mapped type covering object, array, and union cases
  once, not per-entity, so it is reviewable in isolation; `packages/editor`
  adds a structural round-trip test — every example in `examples/` loaded
  as a Draft, re-exported, and diffed against the original — run in CI
  alongside the engine's own `bun test`. Since no hand-maintained shape
  exists to drift, this test's job shifts from "did the Draft schema keep
  up with the contract" (the original risk this mitigated) to "does
  `DraftOf<T>` plus id-minting preserve every field through a full
  load/edit-nothing/export cycle" — still worth running, but a narrower
  and more mechanical failure mode than schema drift.
- **[Risk]** `exports` map restricts *import paths* but Bun/TS resolution
  can still be bypassed with a deep relative import
  (`../../src/engine/...`) from inside `packages/editor` if someone
  writes one → **Mitigation**: this is a convention boundary, not a
  security boundary, matching how the brainstorming doc frames it
  ("Engine-Interna sind für den Editor nicht importierbar" refers to the
  package-resolution graph, not a sandbox). A lint rule
  (`no-restricted-imports` on `**/src/engine/**` from `packages/editor`)
  closes the gap cheaply and is worth adding in tasks.md.
- **[Risk]** File System Access API is Chromium-only as of today → 
  **Mitigation**: input/download fallback (decision 7) covers Firefox/
  Safari at the cost of losing in-place overwrite; acceptable since v1
  targets technical authors, not a mandated browser.
- **[Trade-off]** Picking React + Vite + React Flow + elkjs now (rather
  than deferring to implementation) commits the editor to a framework
  before panel design exists → accepted, because the brainstorming doc
  explicitly delegates the rendering/layout library choice to this
  document, and an unresolved framework choice would block every
  downstream task (2 through 6 in the proposal's staging).

## Migration Plan

Not applicable in the infra sense (no data migration). Rollout is the
task sequence itself (tasks.md's staged groups): each group keeps
`bun test`/`bun run typecheck` green at the engine package before the
next group starts, so the workspace promotion (group 1) is independently
verifiable before any editor code exists. No feature flag — the editor
package is additive and inert until built.

## Open Questions

- Whether `packages/editor` needs its own `tsconfig.json` project
  reference into the root `tsconfig.json` (for consistent strict-mode
  settings) or an independent config — resolve during scaffold (task 2).
