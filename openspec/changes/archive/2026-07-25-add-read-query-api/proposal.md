## Why

The engine is reachable but not discoverable. `src/http/server.ts` exposes five
routes, every one of them addressing a single instance by an id the caller must
already possess: there is no way to *find* an instance, no way to list the
processes one may start, and no way to get a definition into the store except by
running a script (`scripts/demo-expense-approval.ts`). A participant-facing
frontend — an inbox, a process list, an instance history view — cannot be built
on that surface at all, which makes this the blocking work before frontend
becomes the main effort.

Two capabilities that already exist in the engine are simply not exposed:
`cancelInstance` (`transition.ts`) has no route, and the audit backbone
(`history_entries`, `instance_events`) has no reader.

## What Changes

- **Instance listing.** A new runtime-level read that returns a page of instance
  summaries filtered by `processId`, `status`, `currentStepId`, and by actor
  relation (claimed by me / assignable to me via `assignment.candidates` /
  started by me). Keyset-paginated with a stable order, matching the pagination
  already used by `migrateInstances` and `findOrphanKeys`.
- **Instance record reading.** A read over an instance's `HistoryEntry` and
  `InstanceEvent` rows, ordered as the record defines (`transitionSeq`, then
  `at`), so a UI can render a timeline.
- **Process/version listing.** Reads over the definition store: the published
  processes, and the versions of one process with their `version`,
  `definitionHash`, `status`, `publishedAt` — without shipping every frozen body.
- **Publish over HTTP.** A route wrapping `publishBody`, so an authored body can
  be published from a client instead of from a script. Publish-time validation
  (structural, CEL, registry, cross-process, duration) is unchanged; only its
  typed errors gain an HTTP mapping.
- **Cancel over HTTP.** A route wrapping the existing `cancelInstance`.
- Out of scope, deliberately: authentication. Every new route resolves its actor
  through the same `ActorResolver` seam the existing five use, which in the
  shipped configuration is `devHeaderResolver` — a caller may still claim any
  identity. That gap is real and belongs to its own change; this one must not
  quietly grow an auth story. **Publish and cancel are therefore unauthenticated
  writes in the default configuration** and the change records that explicitly
  rather than gating them behind a half-measure.

## Capabilities

### New Capabilities
- `instance-query`: runtime-level discovery over persisted instances — filtered,
  keyset-paginated listing of instance summaries, and reading one instance's
  append-only record (history entries + instance events).

### Modified Capabilities
- `http-wrapper`: the HTTP surface grows from five instance-scoped routes to
  include the listing, record, process/version, publish and cancel routes, each
  with its typed-error-to-status mapping and CORS preflight.
- `definition-store`: gains read operations that enumerate published processes
  and the versions of a process (metadata only, body excluded).

## Impact

- `src/runtime/api.ts` — new read functions alongside the existing five
  operations; no change to `createProcessInstance` / `getInstanceView` /
  `submitAndTransition`.
- `src/engine/definitions.ts` — listing reads on the definition store.
- `src/http/routes.ts`, `src/http/server.ts`, `src/http/errors.ts` — new
  handlers, routing, error mappings.
- `src/engine/store.ts` — indexes supporting the new filters (the existing
  `instances_selection_idx` covers `processId`/`version`/`status`; the actor
  relation filters need their own).
- No change to `src/schema/definition.ts`. The JSON contract is untouched:
  this change reads what the engine already persists and exposes what it
  already computes.
- `packages/editor` is unaffected by this change but is its first consumer —
  the Player's hand-entered `processId` becomes selectable once the process
  listing exists.
