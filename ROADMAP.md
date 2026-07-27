# Roadmap

1. Validation layer (Zod-first): DONE. definition.ts is Zod-sourced with TS types
   via z.infer and the structural invariants as refinements / superRefine; the
   bun:test suite test/validate.test.ts exercises them. The cross-process invariants
   that need the child definition are now enforced at publish
   (`definitions.ts::validateCrossProcess`, `test/cross-process.test.ts`): a
   subprocess step's `inputMapping` targets must lie within the referenced child's
   `contract.inputFields`, and the child reference must resolve to a *contracted*
   published child (`pinned` → the version exists; `latest-at-spawn` → a published
   version's compiled-contract hash equals `contractRef`). This enforces child-first
   publish ordering. The originally-scoped "callable child requires no non-input
   field" invariant was dropped as unsound: a `required` view flag is satisfied by
   an interactive step's user, not the caller, so it does not encode "the caller
   must supply this field" (the expense-approval example legitimately requires a
   non-input field at its manual review step). A subprocess step's `outputMapping`
   values and automatic-path guards are now also checked at publish
   (`src/cel/check.ts::checkSubprocessChildRefs`, invoked from
   `validateCrossProcess`): `child.data.<key>` type-checks only for a `<key>` in
   the referenced child's `contract.outputFields` (resolved to the child's own
   field `key`), instead of the generic `dyn` every other CEL site sees for
   `child.data`. A violation throws `CelValidationError`, not
   `CrossProcessValidationError` — it is a CEL reference defect, not a wiring one.
   Runtime `child.data` stays the child's full data object; only the CEL surface
   is confined to the contract (see `cross-process-validation` spec).
2. CEL wiring: DONE. Authoring-time (`src/cel/check.ts`) and engine-side evaluation
   (`src/cel/eval.ts`): guards evaluated at runtime (total — a runtime error is
   `false`) and Action.output result-writeback. Migration `transforms` are the last
   wired site: `validateMigrationSpec` parse/type-checks them against the source
   catalog with the result type checked against the target field (`buildEnv` gained an
   `actor` flag so this one site can withhold it), and `evalTransforms` evaluates them
   at migration, total per entry, reusing `coerceJson`. `validateProcessBody` is wired
   into `publishBody` (an invalid expression is a publish error, not a runtime one),
   and the check/eval scopes were reconciled at the one site where they had drifted:
   `Action.output` registers `result` alone, and `onCancel` outputs — previously the
   one action position `collect()` never visited — are checked.
3. Engine skeleton: largely DONE. Instance store, transactional outbox (delivery +
   writeback + retry/dead-letter + reclaim), transition executor (manual/automatic/
   timer, onExit→onPath→onEntry ordering, run-to-rest), async re-resolution of
   wait-states after a writeback, timer arming + scheduler, and crash recovery
   (outbox/resolution reclaim, persisted `next_timer_at`). Persists to PostgreSQL
   via Bun's native `Bun.sql`; connection via `DATABASE_URL`. Single-instance runtime
   cancellation is DONE (`cancelInstance`: skip onExit, `[onCancel, sink.onEntry]`,
   cancel HistoryEntry, OCC, no-op on non-running). Subprocess execution is DONE
   (`subprocess.ts`: spawn on subprocess-step entry — by transition or at creation on
   an initial subprocess step — child-body resolution by
   `versionBinding`, `inputMapping` seed, return via `outputMapping` + direct parent
   advance, idempotent spawn) together with downward cancel propagation
   (`cancelInstance` cascades to active children by the `parent` link). `deadline`
   timers are DONE (`duration.ts`: `instantFromValue` + the deadline branch of
   `armStepTimers`; see the timers entry above). `TimerState` provenance is DONE
   (`armStepTimers` records what each timer was armed from — `{kind: "duration",
   duration}` or `{kind: "deadline", src}`, plus `armedAt` — on every armed
   `TimerState`; `migration.ts::reconcileTimers` compares a carried, unfired,
   still-declared timer's provenance against the target step's current
   declaration and re-arms on a mismatch instead of blindly keeping the old
   `fireAt`; a carried timer with no provenance — armed before this field
   existed — is trusted as unchanged, since reconciliation has no signal to
   compare it against). The runtime event log is DONE
   (`InstanceEvent`: a reminder fire, an unarmed timer, a skipped migration and a
   creation-enqueued subprocess spawn are recorded, and an
   `ActionOutcome` now attaches to the record that enqueued it). Instance migration is
   DONE (`src/engine/migration.ts`): a migration plan is a row keyed
   `(processId, fromVersion, toVersion)` in `migration_plans`, registered by
   `registerMigrationPlan` independently of publish, validated against both bodies
   (structural, type-compatibility incl. the identity-carried case, and the transform
   CEL check) and frozen by an atomic `WHERE applied_at IS NULL` upsert once the first
   instance migrates under it. `migrateInstances` reads the plan once, stamps it applied
   before the first instance, then keyset-paginates the running/source-version
   population selecting ids only and migrates each in its own row-locked transaction
   (`SELECT … FOR UPDATE`, since the OCC token does not cover `data`): remap step via
   `stepMap`/identity/`onUnmappable`, remap `data` losslessly from the locked snapshot
   (`fieldMap` + `transforms`, orphans retained), reconcile timers four-ways
   (carried+declared kept with `fireAt`, fired kept fired, newly-declared armed against
   the target body/post-remap data/new seq, withdrawn dropped), then commit through the
   shared `planStepEntry`/`applyStepEntry` seam with `entryVersion`, `suppressSpawn` on
   an identity step, the reconciled timer set and the pin/payload field patch — so
   status, the subprocess spawn/return and the `HistoryEntry` (`cause: "migration"`,
   `pathId: null`) are inherited, not reimplemented. An instance is skipped
   `pending-actions` only while it holds a `claimed` outbox row with an active lease
   (a worker plausibly mid-handler right now); a `pending` row, or a `claimed` row
   whose lease has expired, is instead remapped in place through the plan's
   `fieldMap` (with a `field_version` lamination stamp and a delivery-side version
   fold guarding the residual race — see `docs/current-state.md`) and the
   instance migrates immediately. An unmappable instance under `reject-and-pin` is
   skipped `step-unmappable`; both skip reasons are recorded as a `migration.skipped`
   `InstanceEvent`. The
   migrating parent repairs every child's `parent.stepId` (terminal children included).
   The operation is per-instance fault-isolated and reports instance ids grouped
   migrated/skipped/conflicted/failed. A subprocess step as the *initial* step spawns
   too (`createInstance` enqueues at seq 0 inside the INSERT transaction, carried by a
   `subprocess.spawn-enqueued` event). Publish-time cross-process
   validation (inputMapping ⊆ child inputFields, child reference resolvable → child-first
   ordering) is DONE (`definitions.ts`, roadmap #1). The production `resolveBody` backing
   (definition/version store) is DONE (`definitions.ts` + `host.ts`), so the
   resolution and timer workers are live. Orphan-key visibility is DONE
   (`migration.ts::findOrphanKeys(processId, version, db, resolvers)`): a read-only,
   keyset-paginated scan reporting which instances pinned to a published version hold
   a `data` key absent from that version's field catalog (a `group` field's own id is
   never a valid key regardless of catalog declaration), covering every instance
   status and isolating an unreadable row into a separate list rather than aborting —
   the same per-row fault isolation as the three background drains. Read-only: no
   pruning. A resolver miss throws `MigrationPlanError`, matching
   `registerMigrationPlan`/`migrateInstances`.
4. Editor: DONE for v1 scope. `packages/editor` — Bun workspace package,
   structural panels + Draft model + live validation (reusing the engine's
   unmodified publish-time validators) + read-only auto-layouted graph view +
   file-based draft I/O (load/save/import/export) + UI-chrome i18n +
   participant-facing content localization (`LocalizedText`/`baseLocale` on
   the schema). Out of scope for v1 and not yet built: canvas editing
   (drag-to-connect), an HTTP transport or server around the Runtime API
   Layer, auth/actor resolution, and assignment/claim enforcement — see the
   Runtime API Layer entry above for which of those it already deliberately
   excludes.
5. Post-v1: make the engine reachable. DONE (a–e all DONE).
   Planned stages, each depending on the previous one landing first:
   a. DONE. Validated the stack end-to-end with a throwaway script exercising
      `createProcessInstance` -> `getInstanceView` -> `submitAndTransition`
      against `examples/expense-approval.json` (`b27e18f`). Pure validation,
      no new capability, no OpenSpec change.
   b. DONE. HTTP wrapper around the Runtime API Layer (`src/http/`): a thin
      REST/JSON adapter over `Bun.serve` exposing the same three operations
      (plus claim/release from stage d) as REST/JSON routes, with
      typed-error-to-HTTP-status mapping. See the "HTTP wrapper" entry under
      `docs/current-state.md` for the full shape.
   c. DONE. Player/Preview UI in `packages/editor/src/player/`: a form screen
      that drives a real instance through (b), reachable via a Structure/Player
      toggle in `App.tsx` — distinct from the existing read-only structural
      graph view, which shows the FSM shape, not a running instance. See the
      "Player/Preview UI" entry under `docs/current-state.md`.
   d. DONE. Auth/actor resolution + assignment/claim enforcement
      (`src/auth/resolve.ts`, `transition.ts::claimStep`/`releaseClaim`,
      `registry.ts::AssignmentRegistry`). Activates the previously
      declared-but-inert `Step.assignment` field: a pluggable `ActorResolver`
      (one non-production dev header resolver shipped), registry-validated
      assignment strategies resolved at step entry, exclusive claim/release on
      `instance.assignment`, and claimant-only enforcement in
      `submitAndTransition`. See the "Auth/Actor-Resolution +
      Assignment/Claim-Enforcement" entry under `docs/current-state.md`.
   e. DONE. Generic `http.request` action handler (`src/handlers/http.ts`),
      registered by default in `createDefaultRegistry` (`src/engine/host.ts`).
      Vendor-neutral REST call: config validated at publish time, an
      `Idempotency-Key` dedup header on every attempt, a default `Content-Type`
      for JSON bodies, and response/failure classification into the outbox's
      existing permanent-vs-transient retry semantics. See the "Generic
      http.request action handler" entry under `docs/current-state.md`.
6. Read/query API: DONE (`listInstances`, `getInstanceRecord`,
   `listProcesses`/`listVersions`, plus the `GET /instances`, `GET
   /instances/:id/record`, `POST /instances/:id/cancel`, `POST /processes`,
   `GET /processes`, `GET /processes/:id/versions` HTTP routes — see the
   "Read/query API" entry under `docs/current-state.md`). This was the last
   engine-side blocker before frontend work becomes the main effort: it closes
   the gap where the HTTP wrapper could only address a single instance by an
   id the caller already had, with no way to list instances, read an
   instance's history, or discover published processes.
7. Authentication: DONE (`add-authentication`; see the "Authentication" entry
   under `docs/current-state.md`). A production-capable JWT `ActorResolver`
   (`src/auth/jwt.ts`) ships alongside the existing non-production
   `devHeaderResolver`: local project accounts (`auth_users`, argon2id via
   `Bun.password`, `POST /auth/login`, a user-management CLI) and JWKS-backed
   external issuers are accepted through one resolver that dispatches on the
   token's `iss` claim, so a local account and an IdP identity (e.g. Entra ID)
   can be accepted simultaneously during a migration. Selected by
   `AUTH_JWT_SECRET`/`AUTH_ISSUERS`; unset, the dev resolver stays the
   default. The Player UI logs in with email/password instead of raw actor
   headers.
8. Authorization: DONE (`add-authorization`; see the "Authorization" entry
   under `docs/current-state.md`). Closes the gap stage 7 recorded. Two
   reserved roles on the `Actor.roles` every resolver already populates —
   `system:publish`, `system:cancel-any` — gate `POST /processes` and
   `POST /instances/:id/cancel`, the two operations that previously had no
   permission check at all. A caller lacking the role gets a distinct
   `AuthorizationError`, mapped to HTTP 403. Assignment/claim enforcement
   (stage 5d) is untouched — an actor holding neither reserved role still
   fully participates in any instance it is an assignment candidate for.
   **BREAKING**: any account that published or cancelled instances before
   this change needs the role granted via the existing `cli.ts set-roles`,
   or it now gets 403.
9. End-user app: DONE (`add-end-user-app`; see the `end-user-app` capability
   spec and the "End-User App" note this stage adds under
   `docs/current-state.md`). The participant-facing frontend stage 6
   anticipated ("frontend work becomes the main effort"). `packages/app`:
   Login / My-tasks (inbox, `scope=mine`) / Task / Start-a-process, four
   screens over a small hand-written routing hook, no dependency beyond
   React. `packages/form-ui`: the shared, source-only field-form renderer
   extracted so the editor's Player and the end-user app render forms
   identically — one place to fix a field-rendering bug, not two. Two small
   engine-side additions rode along: `InstanceSummary` gained
   `processLabel`/`stepLabel`/`processBaseLocale` so the inbox can render
   without shipping whole process bodies to the browser, and
   `POST /instances/:id/cancel` accepts `startedBy === actor.id` alongside
   `system:cancel-any` (see `authorization`'s "starter may cancel" note) so
   an abandoned start doesn't strand an unassigned instance. A same-session
   audit (2026-07-27) found and fixed one real gap in this stage: the
   `scope=mine` inbox filter matched a candidate by actor id only, never by
   role, so a released or unclaimed role-assigned task could silently vanish
   from a participant's inbox — see `instance-query`'s role-matching
   requirement and `docs/current-state.md`'s Read/query API entry.
   Out of scope, deliberately: case history view, notifications, attachments,
   comments, delegation, and a dedicated `groups` assignment filter (distinct
   from `Step.assignment.candidates`, which already matches by id or role).
10. Admin area: NOT STARTED (design approved 2026-07-27, see
    `docs/superpowers/specs/2026-07-27-admin-developer-area-design.md`). The
    operator's product: `packages/app` serves the participant,
    `packages/studio` (stage 11) the developer, `packages/admin` the operator.
    Two areas plus the migration run — operations (all instances, the merged
    transition+event record, outbox with dead-letter retry/discard, pending
    timers), user administration, and `POST /admin/migrations/run`.
    Same boundaries as the other frontends: runtime access through the
    HTTP wrapper only, no direct database reads. One new reserved role,
    `system:admin`, checked directly like the two from stage 8. One new engine
    module, `src/engine/admin-queries.ts`, for the reads that have no API
    today (outbox rows by status, pending timers, instances per published
    version); one new function, `users.ts::setDisabled`. Every other operation
    reuses an existing engine path, so the only new writes are the two
    outbox-row repairs, which touch no instance state and therefore cannot
    interact with the `transitionSeq` OCC invariants.
    **BREAKING**: `GET /instances?scope=all` and `GET /instances/:id/record`
    are reachable today by any authenticated actor — every logged-in
    participant can list all instances and read any record. Both move behind
    `system:admin`. No current caller is affected (the end-user app uses
    `scope=mine`, the Player drives a single instance it created), and
    `scope=mine` stays open to every authenticated actor.
    The design's original **Processes** and **Tools** areas were reassigned to
    stage 11 — authoring belongs to the developer, operating to the operator —
    which also moves `GET /admin/registry`, `POST /admin/migrations/plans` and
    `GET /admin/migrations/orphan-keys` to unprefixed studio routes and drops
    the standalone definition validator (studio's editing view already
    validates live against the same chain). Running a migration stays here.
    Out of scope, deliberately: forced transitions and direct `data` edits
    (both would write instance state outside the engine's paths), evaluating
    CEL against live instance data (needs an endpoint reading other people's
    instances; static type-checking against a version's field catalog is what
    an operator actually needs), deleting users (`user_id` *is* `Actor.id` and
    must stay resolvable in the append-only record — `auth_users.disabled`,
    which `verifyLogin` already honours, is the correct mechanism), and live
    updates (refresh control plus refetch-on-focus, as in stage 9).
    Delivery is three OpenSpec changes, only the first with scaffolding:
    `admin-shell-and-ops`, `admin-users`, `admin-migration-run`.
11. Process Studio: NOT STARTED (design approved 2026-07-27, see
    `docs/superpowers/specs/2026-07-27-process-studio-design.md`). The
    developer's product, `packages/studio`, and one new reserved role,
    `system:developer`. It supersedes stage 4's `packages/editor`, which was a
    proof of concept for the editing half only: it holds a draft in a file on
    one machine, renders the graph read-only, and cannot publish. Six routes
    plus login — process list, editing over three surfaces (canvas primary,
    the carried-over panels as inspector, a replacing JSON view), published
    versions with a JSON diff, Player beside the merged instance record,
    migration-plan authoring with a `findOrphanKeys` dry run, and tools
    (registry of the running server, static CEL scratchpad).
    One new table, `drafts` — one mutable draft per process, optimistic
    concurrency on a `revision` column (stale save = 409, no merge), `layout`
    stored beside the body because `definitionHash` is the JCS hash of
    `ProcessBody` and a moved box must not mint a version. Deliberately not
    `definitions` with the declared-but-inert `status='draft'`: that table is
    what the resolution and timer workers rehydrate running instances from.
    One new engine module, `src/engine/drafts.ts`; one new route file,
    `src/http/studio-routes.ts`. Publish, versions and migration planning
    reuse existing engine paths unchanged.
    Environment separation is an operational convention (`DATABASE_URL` per
    environment), not a product feature, so Player test instances can never
    reach production and no `is_test` column is needed. **Version numbers are
    environment-local** — `publishBody` counts per database, so the same
    definition may be v5 in dev and v2 in production; `definitionHash` is the
    only identity that carries across an environment boundary.
    Out of scope, deliberately: branches / multiple named drafts (merge
    semantics over a graph is its own project), guard-level execution tracing
    (the instance record already answers "why is it parked"), multi-environment
    transport as a product feature, a standalone validator screen, and live
    collaboration.
    Delivery is five OpenSpec changes, only the first with scaffolding:
    `studio-shell-and-drafts`, `studio-canvas`, `studio-json-view`,
    `studio-lifecycle`, `studio-tools-and-player` (the last deletes
    `packages/editor`).
