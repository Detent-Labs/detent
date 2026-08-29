## Why

The Studio Player can only create an instance against a published process
version. A process with edits saved to its draft but never published cannot
be test-run at all — `POST /processes/:processId/instances` throws
`no published version for process <id>`, surfaced to the developer as an
opaque "The server hit an error" message. This defeats the Player's purpose
as a pre-publish testing tool: an author must publish, sight-unseen, before
they can see whether the process they just built actually works.

## What Changes

- The Studio Player gains a "Create test instance" action that runs the
  process's current draft body instead of a published version.
- A test-instance run is a real instance: real assignment, real claim/submit,
  real action dispatch (emails, webhooks, etc. fire for real) — nothing about
  execution is simulated.
- The draft body is frozen at the moment the test instance is created;
  further edits to the draft do not affect an already-running test instance.
- No pre-play validation of the draft is added. An invalid draft (missing
  `initialStep`, broken CEL, etc.) fails when execution reaches the broken
  part, the same way it would for any other malformed content — not with an
  unhandled crash.
- Every test instance is marked `kind: "test"`, distinct from an ordinary
  `kind: "published"` instance created against a real version.
- A test instance is visible only in the Admin all-instances list (with a
  `kind` badge). It is never visible in the end-user app area (My tasks,
  direct instance access) for any actor, and it is excluded from Reporting
  (cycle time, bottlenecks, SLA) entirely.
- **BREAKING**: `Instance` gains a required-by-convention `kind` field,
  backed by a new `instances.kind` SQL column with a `NOT NULL DEFAULT
  'published'` (every existing row backfills via that default at migration
  time, with no separate data-rewrite step) — any code constructing an
  `Instance` literal outside the Runtime API Layer must account for it.
- Deliberately out of scope for this change, and explicitly not precluded:
  a later "test user/group" exception that lets specific real actors see
  test-instance tasks in their normal app-area task list. The visibility
  design routes every check through one predicate so that exception can be
  added in one place later, not scattered across call sites now.
- Also out of scope: a draft's `subprocess` step ever spawning a real child
  instance, categorically — whether the referenced child process has no
  resolvable published version, or has one. A test instance reaching a
  `subprocess` step always fails gracefully (same treatment as any other
  broken draft content), never spawns a child, published-version-resolvable
  or not, because a real child spawned purely because someone tested a draft
  would break this change's own visibility guarantee for that child. This is
  not a new capability.

## Capabilities

### New Capabilities
- `draft-test-instances`: creating, freezing, and resolving a "test instance"
  run against a process's current draft body — the `draft_snapshots` store,
  the `kind` discriminator on `Instance`, the sentinel-version resolution
  scheme, the frozen-at-creation guarantee, and the studio-only creation
  route.

### Modified Capabilities
- `definition-store`: `resolveBody` gains a fallback path so a negative
  (test-instance) version resolves a frozen draft snapshot instead of a
  published `definitions` row, without changing behavior for any real
  version lookup.
- `instance-query`: the shared `buildInstanceWhere` predicate — interpolated
  by both `listInstances` and `queryInstances` — excludes `kind: "test"` by
  default. `listInstances` opts back in only for the admin (`scope=all`)
  caller; `queryInstances` (and so its own two callers, the `instance.query`
  CEL data source and `runReportQuery`) carries no opt-in and stays
  excluded unconditionally.
- `runtime-api`: the single-instance read path (`loadInstanceForActor`,
  backing `getInstanceView`, `postComment`, `listComments`,
  `uploadAttachment`, `listAttachments`, and `getAttachment`) narrows a
  non-administrative actor's access to a test instance to that instance's
  own `startedBy` — a claim or candidacy alone, sufficient for an ordinary
  instance, is not sufficient for a test instance. `InstanceView` also gains
  a `kind` field.
- `admin-app`: the all-instances list shows a `kind` badge and test instances
  are never hidden from it by default.
- `reporting-analytics-api`: cycle time, bottleneck, and SLA queries exclude
  `kind: "test"` instances from every computed metric.
- `studio-player`: the Player screen gains a "Create test instance" action
  (calling the new studio-only route) alongside its existing "Create new
  instance" action, and marks a `kind: "test"` instance as such in its own
  view.
- `runtime-api` (additionally): a `process.start` action dispatched from a
  test instance starts the new instance with the same `kind` as the acting
  instance, rather than defaulting to `"published"`, so a chain started from
  a test instance stays entirely within the test-instance visibility rules.

## Impact

- New table `draft_snapshots` (migration required).
- New `kind text NOT NULL DEFAULT 'published'` column on `instances`
  (migration required, `src/engine/store.ts`) — a real SQL column, not only
  a field of the `Instance` JSON schema, because the exclusion predicates
  below filter the stored row directly via `body->>'field'`, before any
  Zod default could apply.
- `src/schema/definition.ts`: `Instance` gains `kind`.
- `src/engine/store.ts` (`createInstance` gains an optional `kind` opts field,
  threaded into its INSERT and its `instanceSchema.parse` seed object) and
  `src/engine/seeded-create.ts` (`createSeededInstance` gains the same
  optional `kind` field, threaded into its own `createInstance` call).
- `src/engine/definitions.ts` (`resolveBody`), `src/runtime/api.ts`
  (`createProcessInstance`, `listInstances`, `queryInstances`,
  `buildInstanceWhere`, `loadInstanceForActor`, `getInstanceView`,
  `postComment`, `listComments`, `uploadAttachment`, `listAttachments`,
  `getAttachment`, `runReportQuery`), `src/engine/instance-query-source.ts`
  (the `instance.query` CEL data source, an indirect `queryInstances`
  caller), `src/http/studio-routes.ts` (new route), `src/engine/reporting.ts`
  (`selectInRange` plus `bottleneck`'s separate work-in-progress query),
  `src/engine/subprocess.ts` (the spawn handler gains a `kind === "test"`
  gate that fails gracefully regardless of whether the child process has a
  resolvable published version), `src/handlers/process-start.ts` (the
  started instance's `kind` is propagated from the acting instance's `kind`
  instead of defaulting to `"published"`).
- `packages/web/src/areas/studio/screens/PlayerScreen.tsx` and its API
  client, `packages/web/src/areas/admin` instances screen (badge).
- No change to `definitions`, migration scans, the outbox, or any of the
  other ~15 `resolveBody` callers — they keep working unmodified through the
  fallback in `definition-store`.
