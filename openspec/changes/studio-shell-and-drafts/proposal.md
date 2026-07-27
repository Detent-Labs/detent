## Why

`packages/editor` was a proof of concept for the *editing* half of a process
development environment. It holds the draft in a file on one person's machine,
so nothing a development environment exists for — publishing, versions,
migration preparation, working with someone else, picking up where you left
off — has anywhere to stand. Every one of those presupposes that the draft
lives in the system, not on a disk.

This change opens the developer's product (`packages/studio`) and moves the
draft into the database. Scope is the first of the five changes the approved
design (`docs/superpowers/specs/2026-07-27-process-studio-design.md`) splits
stage 11 into: the package, login, the `system:developer` role, the `drafts`
table with its engine module and routes, the process list, and panel-based
editing with optimistic-concurrency save/discard. Canvas (`studio-canvas`),
the JSON surface (`studio-json-view`), publish/versions/migration planning
(`studio-lifecycle`) and tools/Player (`studio-tools-and-player`, which
deletes `packages/editor`) follow separately. `packages/editor` stays
untouched and functional until then.

## What Changes

- **New reserved role `system:developer`** in `src/auth/authorize.ts`,
  alongside `PUBLISH_ROLE`, `CANCEL_ANY_ROLE` and `system:admin` (stage 10).
  Same pattern — a constant plus a direct `requireRole` check. No policy
  engine, no hierarchy. Publishing (change 4) will keep additionally requiring
  `system:publish`: studio introduces no new permission semantics, it only
  calls existing operations.
- **New table `drafts`** in `initSchema` (`src/engine/store.ts`): one mutable
  draft per process, keyed `process_id`, holding the **authored** (uncompiled)
  `ProcessBody`, a `layout` object, a `revision` counter for optimistic
  concurrency, the `base_version` it started from, and who last saved it.
  Deliberately **not** `definitions` with the declared-but-inert
  `status='draft'` — that is the table the resolution and timer workers
  rehydrate running instances from, and a mutable body in it would put one
  forgotten read site between a half-finished draft and a live instance.
- **`layout` stored beside the body, never inside it.** `definitionHash` is the
  JCS hash of `ProcessBody`, so layout carried in the body would make a moved
  box mint a new version. The schema has no metadata field for it and must not
  grow one.
- **The draft body is stored unvalidated below its envelope.** A draft under
  construction routinely violates the authoring-time invariants, so `saveDraft`
  checks only that `body` and `layout` are JSON objects and `revision` is a
  non-negative integer (400 otherwise) and stores the rest opaquely.
  Correctness is enforced where it already is: live in the editing UI against
  the engine's own validators, and unconditionally server-side at publish.
- **New engine module `src/engine/drafts.ts`** — `getDraft`, `saveDraft`,
  `listDrafts`, `deleteDraft`. Saving is a conditional `UPDATE … WHERE
  process_id = $1 AND revision = $2`; zero affected rows is a conflict, the
  same pattern `transitionSeq` already establishes. The system never merges.
- **New route file `src/http/studio-routes.ts`** carrying `GET /drafts`,
  `GET /drafts/:processId`, `PUT /drafts/:processId` and
  `DELETE /drafts/:processId`, all behind `system:developer`, kept out of
  `routes.ts` so that file stays the participant-facing surface (the same
  reasoning as `admin-routes.ts`). A stale-revision `PUT` maps to HTTP 409
  through the existing `src/http/errors.ts`.
- **New frontend package `packages/studio`** (React + Vite + TypeScript, same
  shape as `packages/app`; routing is the hand-written History-API hook from
  `packages/app/src/routing.ts`, no router dependency): login against the
  existing `POST /auth/login` with the JWT in `localStorage`, a shell that
  shows an explanatory empty state to an authenticated actor without
  `system:developer`, a process list (draft state with editor and timestamp,
  latest published version with its hash; new / open / discard), and the
  editing screen — the editor's Draft model, structural panels, UI-chrome i18n
  and live validation carried over, now loading and saving against the draft
  routes instead of a file, with an explicit save, discard, and a reload-based
  resolution on 409.
- Live validation stays exactly what it is: the engine's own publish-time
  chain imported through the exports map at compile time
  (`workflow-engine/schema`, `/schema/compile`, `/cel/check`,
  `/engine/registry-check`), as `packages/editor/src/draft/validation.ts`
  already does. No endpoint behind it.

Deliberately out of scope: branches / multiple named drafts, canvas editing,
the JSON surface, publish, versions and diff, migration planning, the registry
view, the CEL scratchpad and the Player — the four later changes. Also out of
scope for stage 11 as a whole: guard-level execution tracing,
multi-environment transport as a product feature, a standalone validator
screen, and live collaboration.

## Capabilities

### New Capabilities
- `process-drafts`: the server-side draft store — the `drafts` table,
  `src/engine/drafts.ts` (get / save with revision-checked optimistic
  concurrency / list / delete), the authored-body-and-layout separation that
  keeps a cosmetic edit from changing `definitionHash`, and the
  `system:developer`-gated `/drafts` routes that expose it.
- `studio-app`: the `packages/studio` frontend — workspace package, login and
  session reuse, role-aware shell, process list, and panel-based draft editing
  over the HTTP wrapper (runtime) and the engine's exports map (compile-time
  validation) only.

### Modified Capabilities
- `authorization`: adds a reserved role, `system:developer`, and states that
  it gates every studio route.

## Impact

- **Code**: new `src/engine/drafts.ts`, new `src/http/studio-routes.ts`, new
  `packages/studio/**`; edits to `src/auth/authorize.ts` (one constant),
  `src/engine/store.ts` (`initSchema` gains one `CREATE TABLE IF NOT EXISTS`)
  and `src/http/server.ts` (dispatch plus CORS preflight for four routes).
  `packages/editor` is not touched by this change.
- **API**: four new routes, all new — no existing route changes shape or
  permission, so nothing is breaking.
- **Operations**: an account that needs studio must be granted
  `system:developer` via the existing `src/auth/cli.ts set-roles`.
- **Schema**: one new table (`drafts`). No change to the process-definition
  contract (`src/schema/definition.ts`) and no change to `definitions`.
- **Dependencies**: none added to the engine; `packages/studio` takes the
  React/Vite devDependencies of `packages/app` plus the editor's `immer` (the
  Draft model's reducer) and `zod` (the example registry live validation
  checks an action's `config` against, `registry/exampleRegistry.ts`). `form-ui`,
  `mermaid` and `@panzoom/panzoom` are not needed until the Player and canvas
  changes.
