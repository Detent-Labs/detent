# Roadmap

CI: DONE (`add-ci-and-dependency-hygiene`). No hosted service runs this
repository, by the owner's decision. `.githooks/pre-push` is the gate. It
runs `bun run check` (typecheck, then the full `bun test` suite) in the dev
container, where `DATABASE_URL` is already set. A non-zero exit blocks the
push. See the "CI" entry in `docs/current-state.md` for the full shape. Not a numbered stage: it gates every stage below rather than adding a
capability of its own.

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
10. Admin area: DONE (design approved 2026-07-27, see
    `docs/superpowers/specs/2026-07-27-admin-developer-area-design.md`). The
    operator's product: `packages/app` serves the participant,
    `packages/studio` (stage 11) the developer, `packages/admin` the operator.
    Two areas plus the migration run — operations (all instances, the merged
    transition+event record, outbox with dead-letter retry/discard, pending
    timers), user administration, and `POST /admin/migrations/run`.
    Same boundaries as the other frontends: runtime access through the
    HTTP wrapper only, no direct database reads. One new reserved role,
    `system:admin`, checked directly like the two from stage 8.
    Delivery is three OpenSpec changes, all DONE:
    `admin-shell-and-ops`, `admin-users`, `admin-migration-run`.
    `admin-shell-and-ops` is DONE (see `docs/current-state.md`'s "Admin area
    (operations)" entry): `packages/admin` scaffolding and login/shell, one new
    engine module `src/engine/admin-queries.ts` for the reads that had no API
    (outbox rows by status, outbox counts, pending timers) plus the two
    dead-letter repairs (requeue, discard — a new `discarded` outbox status,
    pure row updates touching no instance state so neither can interact with
    the `transitionSeq` OCC invariants), one new route file
    `src/http/admin-routes.ts`, and the Operations screens (all-instances
    list, instance detail with cancel, outbox, timers).
    **BREAKING, shipped**: `GET /instances?scope=all` (and an omitted `scope`,
    which has always meant the same thing) and `GET /instances/:id/record`
    were reachable by any authenticated actor — every logged-in participant
    could list all instances and read any record. Both now require
    `system:admin`. No current caller was affected (the end-user app uses
    `scope=mine`, the Player drives a single instance it created); `scope=mine`
    stays open to every authenticated actor. An account that relied on either
    read without the role needs it granted via `src/auth/cli.ts set-roles`.
    `admin-users` is DONE (see `docs/current-state.md`'s "Admin area (user
    administration)" entry): the one HTTP carve-out from
    `local-user-accounts`'s CLI-only administration. Two new
    `src/auth/users.ts` functions — `listUsers` and `setDisabled(userId,
    disabled, db)`, the latter keyed by `userId` (unlike `setRoles`/
    `setPassword`'s `email`) since its caller addresses a row from a
    `listUsers` result, not a human typing an address — and three new
    `system:admin`-gated routes (`GET /admin/users`, `POST
    /admin/users/:id/disable`, `POST /admin/users/:id/enable`). Creating a
    user, changing a password, or assigning roles remain CLI-only. Disabling
    blocks the user's *next* login only; it does not revoke an already-issued
    JWT, since token verification performs no per-request database lookup —
    proven end-to-end (log in, disable via the new route, the pre-disable
    token still authenticates, a fresh login then fails). `packages/admin`
    gains a `/users` screen: list plus a disable/enable toggle, the disable
    action behind a confirmation naming that non-revocation caveat so an
    operator doesn't mistake it for an immediate lockout.
    `admin-migration-run` is DONE: `POST /admin/migrations/run`
    (`src/http/admin-routes.ts`, `system:admin`-gated) wraps `migrateInstances`
    unchanged, and `packages/admin` gained a Migrations screen to run an
    already-registered plan and see the migrated/skipped/conflicted/failed
    result grouped by bucket.
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
    which `verifyLogin` already honours and `admin-users` now exposes over
    HTTP, is the correct mechanism), and live
    updates (refresh control plus refetch-on-focus, as in stage 9).
11. Process Studio: DONE (design approved 2026-07-27, see
    `docs/superpowers/specs/2026-07-27-process-studio-design.md`). The
    developer's product, `packages/studio`, and one new reserved role,
    `system:developer`. It supersedes stage 4's `packages/editor`, which was a
    proof of concept for the editing half only: it held a draft in a file on
    one machine, rendered the graph read-only, and could not publish. Six routes
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
    Delivery is five OpenSpec changes, all DONE:
    `studio-shell-and-drafts`, `studio-canvas`, `studio-json-view`,
    `studio-lifecycle`, `studio-tools-and-player` (the last deleted
    `packages/editor`).

    **Process Studio — shell and drafts: DONE** (`studio-shell-and-drafts`).
    `DEVELOPER_ROLE` in `src/auth/authorize.ts`; the `drafts` table
    (`src/engine/store.ts::initSchema`); `src/engine/drafts.ts`
    (get/save/list/delete, revision-checked optimistic concurrency,
    `DraftConflictError`); `src/http/studio-routes.ts` (the four `/drafts`
    routes, gated by `DEVELOPER_ROLE`, mapped through `src/http/errors.ts`);
    `packages/studio` — login/session/shell mirroring `packages/admin`, the
    editor's `draft/`/`panels/`/`i18n/`/`registry/` carried over with
    file-persistence replaced by the draft routes, and a process list merging
    `GET /processes` with `GET /drafts`. The JSON surface is now DONE (see
    `studio-json-view` below), as are publish, versions, and migration
    planning (see `studio-lifecycle` below); tools/Player remains the only
    NOT STARTED piece (`packages/editor` stays untouched and functional
    until it lands).

    **Process Studio — canvas: DONE** (`studio-canvas`). `/processes/:id/edit`
    is now canvas-primary: a hand-rolled SVG canvas (deliberately not Mermaid,
    which is display-only, and not a graph-editing library — the interaction
    surface is small and the domain graph deliberately simple, no parallelism)
    replaces the stacked-panels-only column, with `StepsPanel` mounted
    unconditionally as a fixed-width inspector beside it (its own list and
    "+ Add step" stay reachable with nothing selected — canvas selection only
    drives which step's accordion `StepsPanel` expands, an edge selection
    resolving to its source step since a path isn't independently
    addressable). Steps are dragged to reposition and connected by dragging
    from a per-node handle; a new `checkPathTriggerConsistency` function
    extracted from `src/schema/definition.ts`'s step `superRefine` (one rule,
    two call sites) gives the canvas the same all-manual-or-all-automatic /
    priority check the engine already enforces, rejecting an inconsistent
    drag-to-connect inline instead of silently creating an invalid path.
    Position writes to `EditorArea`'s `saveState.layout` — never the Draft
    model's `mutate()`, since layout was never body — while a created path
    writes through `mutate()` the same way `PathsPanel`'s own "add path"
    action does. A step absent from `layout` is auto-placed by a one-time,
    client-side BFS-depth-from-`initialStep` traversal, rendered but never
    persisted until actually dragged. `@panzoom/panzoom` (already used by
    `packages/editor`'s read-only graph view) drives pan/zoom; every node and
    edge group carries Panzoom's own `panzoom-exclude` class; a live-browser
    check during implementation found that without it, Panzoom's native
    down-handler wins a race against React's synthetic events and silently
    turns every drag into a pan. Pure logic (`canvas/layout.ts`,
    `canvas/geometry.ts`, `canvas/connection.ts`) is unit-tested; SVG
    rendering/pointer wiring is not, per the repo's existing convention.
    Deletion and every field edit remain panel-only — the canvas adds no
    authoring operation the panels couldn't already do.

    **Process Studio — lifecycle: DONE** (`studio-lifecycle`). Closes the gap
    where a Studio draft could only be published via `packages/editor`'s
    export path plus a manual `POST /processes` call. `POST
    /drafts/:processId/publish` (`src/http/studio-routes.ts`) publishes the
    *persisted* draft server-side — never a client-supplied body — requiring
    both `system:developer` and `system:publish` (the latter implied by
    neither the former nor the reverse, per `authorization`); `publishBody`
    and the new `src/engine/drafts.ts::markDraftPublished` (a plain
    `base_version` stamp, outside `saveDraft`'s revision-checked optimistic
    concurrency) run inside one `withTransaction` so a stamp failure can't
    leave a published version un-stamped. Three more routes newly expose
    existing engine-only functions over HTTP for the first time, all
    `system:developer`-gated and unprefixed (studio-only by role, not by URL,
    same as the `/drafts` routes): `GET /processes/:processId/versions/:version`
    (the compiled body `resolveBody` already resolves, unlike its
    metadata-only, unauthenticated-role sibling), `GET`/`PUT
    /migration-plans/:processId/:fromVersion/:toVersion` (wrapping
    `registerMigrationPlan`/`resolveMigrationPlan` unchanged), and `GET
    /processes/:processId/versions/:version/orphan-keys` (wrapping
    `findOrphanKeys`, version-keyed rather than plan-keyed since the scan is
    independent of any migration target). `MigrationPlanError` gained one
    `src/http/errors.ts` mapping (409, `migration-plan`) shared by all three.
    `packages/studio` gained a Publish action on the edit screen
    (`DraftToolbar.tsx`, gated by a dirty-check pure module,
    `screens/publishGateLogic.ts` — a `confirm()` prompt offers to save then
    publish, mirroring the existing discard-confirmation convention rather
    than silently chaining or blocking), a Versions screen (list plus a
    from-scratch JSON diff, `screens/versionDiffLogic.ts` — no diff library
    exists anywhere in the repo to reuse, and none was added), and a
    migration-plan authoring screen (a JSON-textarea editor over
    `MigrationSpec` — no field-by-field form exists anywhere to extend, and
    the server already owns validation — plus an orphan-key dry-run panel).
    Deliberately out of scope: *executing* a migration plan (stays
    `admin-migration-run`'s future `POST /admin/migrations/run`, an operator
    action) and the registry/CEL-scratchpad tools screen plus Player
    (`studio-tools-and-player`).

    **Process Studio — JSON view: DONE** (`studio-json-view`). Adds the third
    of the edit screen's three surfaces: a JSON view alongside Canvas and
    Panels ("Structure"), switchable via a Structure/JSON toggle in
    `EditorArea` (`EditScreen.tsx`). The two are fully mutually exclusive —
    every draft-body-mutating component (`ProcessHeader`, `FieldCatalogPanel`,
    `DataSourcesPanel`, `ContractPanel`, Canvas, and everything nested under
    it) is grouped under "Structure" and unmounted while "JSON" is shown, so a
    stale JSON textarea can never silently clobber a panel edit made while it
    was open (`DraftToolbar`, the registry selector, and the content-locale
    switcher stay visible regardless, since none of them mutate the draft
    body — this exclusivity was tightened during review; the first draft of
    the change only toggled Canvas+StepsPanel). `JsonView`
    (`packages/studio/src/panels/JsonView.tsx`) seeds its local text from the
    current draft once, on mount — no live resync — and writes only on an
    explicit Apply, through `parseDraftText` (`panels/draftJsonLogic.ts`):
    `JSON.parse`, then the same load-time shape guard the editor's file-based
    Load already used, `checkDraftShape`, ported verbatim to
    `packages/studio/src/draft/load-guard.ts` rather than reimplemented more
    weakly. A parse or shape failure leaves the draft untouched and shows an
    inline error; empty/whitespace text is treated as a valid empty draft
    (`{}`), matching `migrationPlanLogic.ts`'s existing convention. Reuses the
    Draft model's existing `replace()` path — the one Load/Import already
    used — not a new mutation surface. Tools/Player is now DONE too, see
    below.

    **Process Studio — tools and Player: DONE** (`studio-tools-and-player`).
    Closes stage 11's last gap and deletes `packages/editor` outright. Adds
    two screens: a Tools screen (`/tools`) showing the running server's
    registered action-handler and data-source type names (`GET /registry`,
    a new `system:developer`-gated route in `src/http/studio-routes.ts`) and
    a static CEL scratchpad checking an ad-hoc expression against a chosen
    field catalog (a published version or the current draft), parsed and
    type-checked client-side through a new `workflow-engine/cel/check`
    export, `checkAgainstFields`; and a Player screen
    (`/processes/:processId/play`) driving a real instance through the
    Runtime API Layer, shown beside the instance's merged transition/event
    record. Player is not a file-for-file port of `packages/editor`'s
    Player, which had its own standalone serverUrl/login connection: Studio
    already has one shared, logged-in session, so `packages/app`'s
    `TaskScreen`/`api/client.ts` — which already calls the same Runtime API
    Layer routes over that same shared-session model — served as the
    template instead. Showing the merged record beside Player needed a real
    authorization change, not just a new route: `getInstanceRecord`
    (`src/runtime/api.ts`) gained an `actor` parameter and a second,
    additive access path mirroring `cancelInstance`'s existing starter
    bypass — `system:admin`, or `system:developer` together with
    `instance.startedBy === actor.id` — so a developer can read the record
    of an instance their own Player session created, without gaining
    `system:admin`; a plain participant is still refused even for an
    instance they started, unchanged. `packages/editor` (`src/`, `test/`,
    config, Playwright setup) is deleted; 12 capability specs that described
    only its internals are retired with no replacement, and the
    devcontainer's `postCreateCommand` no longer installs Playwright, since
    no remaining package needed it.
12. Unified shell (consolidate app/admin/studio): NOT STARTED, deliberately
    deferred — no urgency, raised 2026-07-28 as a "someday" question, not a
    committed stage. Today `packages/app`, `packages/admin`, and
    `packages/studio` are three independently-built Vite SPAs, each with its
    own near-identical `session.ts` (token+actorId in localStorage),
    `LoginScreen.tsx`, and hand-written `routing.ts` history-API hook — but
    all three already share one backend, one JWT auth flow (stage 7), and
    `packages/form-ui` as a common rendering layer, so there's no router or
    state-management mismatch to reconcile. Two independent, sequenceable
    steps, not one big-bang merge:
    a. Shared login/session across the three origins first — smallest change,
       biggest payoff ("log in once, stay in everywhere"), apps stay
       separately deployable.
    b. Only if still wanted later: one shell with role-gated routing
       (`/admin/*`, `/studio/*`, `/app/*`) replacing the three duplicated
       session/login/routing modules with one. Tradeoff to weigh before
       starting this step: one bundle for three audiences (operator/
       developer/participant) inflates bundle size for all three and couples
       deploys that are currently independent — so it's a deliberate call,
       not a default.
    Neither step has an OpenSpec change yet; write one (starting with 12a)
    when this actually gets scheduled.
13. i18n extensions (content-translation UI; UI-chrome white-label overrides):
    NOT STARTED, deliberately deferred — raised 2026-07-28 as a brainstorm, not
    a committed stage. Two independent sub-projects, not one change:
    a. Content-translation UI (Studio/Editor). `LocalizedText` (the
       process/step/field labels a participant sees) already lives in the
       DB — inline in the versioned JSON definition/draft body — so there is
       nothing to move. Studio/editor already support inline per-field
       locale editing (`ContentLocaleSwitcher`, `LocalizedTextInput`).
       Missing: a cross-cutting view showing which `LocalizedText` entries
       lack an entry for a given locale across all of a process's
       steps/fields (maybe across processes), instead of discovering gaps
       field-by-field. Pure UI addition, no schema/storage change.
    b. UI-chrome white-label overrides (app/editor/studio/admin). Motivated
       by a per-customer wording requirement (white-label), not language
       count: each customer already gets its own deployment/DB (existing
       environment-separation convention) and wants to edit its own
       UI-chrome wording (buttons/headings) itself, without a redeploy. This
       touches the same ground as `2026-07-24-collapse-editor-i18n`'s
       decision (fixed English in editor/studio) but only adds a
       per-deployment override layer — not a reversion to a general
       locale-switcher. Sketch: a new sparse table
       `ui_string_overrides(package, locale, key, value)` overlays the
       existing hardcoded catalogs (`override ?? builtin[locale] ??
       builtin[baseLocale] ?? key` — the same fallback shape `app`'s `t()`
       already uses), loaded once per session by each frontend, with a
       `system:admin`-gated editing screen in `packages/admin` (a new
       `src/engine/ui-strings.ts` plus routes, mirroring
       `admin-queries.ts`/`admin-routes.ts`). Scoped to text only — no
       logos/colors/theming. A UI-strings client duplicated across four
       packages continues the dedup question stage 12 already flagged as
       "someday" — not resolved here.
    Neither sub-project has an OpenSpec change yet; write one when either
    actually gets scheduled.
14. Deployment & operations readiness: IN PROGRESS. Sub-project (a) DONE,
    (b) and (c) NOT STARTED. Raised 2026-07-28 as a "someday" question while
    sketching what shipping to a real customer needs beyond stages 1–13.
    Today the only run path is the devcontainer. Three independent
    sub-projects, split out and ordered 2026-07-30 (each brainstormed and
    specced on its own rather than as one combined design):
    a. Health/readiness endpoints for orchestration: DONE
       (`add-health-readiness-endpoints`; see
       `docs/superpowers/specs/2026-07-30-health-readiness-endpoints-design.md`).
       Smallest sub-project, sequenced first because it is a prerequisite for
       (b): a production Docker image's `HEALTHCHECK` and a k8s-style
       liveness/readiness probe both need an endpoint to call, so designing
       the image around one that does not exist yet would just reopen that
       design later. Ships two unauthenticated routes on the existing
       `Bun.serve` wrapper: `GET /livez` (unconditional) and `GET /readyz`
       (a `SELECT 1` database ping, 503 on failure).
    b. Production Docker image(s) for the engine and each frontend
       (app/admin/studio) — today only the devcontainer image
       (`.devcontainer/Dockerfile`) exists, and it is dev-only (mounts the
       workspace, runs `sleep infinity`). Depends on (a) landing first.
    c. A documented backup/restore runbook for the Postgres schema. Pure
       packaging/ops documentation, no engine schema change implied.
       Independent of (a) and (b) — sequenced last because it caps off the
       "deployment readiness" story, not because it depends on either.
    No OpenSpec change yet for any sub-project; write one per sub-project as
    each is brainstormed.
15. Observability: NOT STARTED, deliberately deferred — raised 2026-07-28.
    No structured logging convention, no metrics, no tracing today; outbox
    backlog, timer latency, and `faulted`-instance rate are only visible by
    hand through the admin area. Design approved 2026-07-30 (see
    `docs/superpowers/specs/2026-07-30-observability-design.md`), scoped
    during brainstorming to exactly the two things the roadmap names —
    metrics and a logging convention, deliberately not tracing — following
    stage 14a's dependency-free precedent: a hand-rolled structured-JSON
    logger (`src/log.ts`, a process-wide `LOG_LEVEL` threshold, existing
    `console.*` call sites converted) and an unauthenticated `GET /metrics`
    Prometheus-text endpoint computed fresh from the database on every
    scrape, exposing exactly the three signals named above — outbox
    backlog by status (reusing `countOutboxByStatus`), timer overdue
    count/max lag, and faulted-instance count (two new reads added to
    `src/engine/admin-queries.ts`). Generic HTTP request metrics and any
    metrics/logging library are out of scope; see the design's non-goals
    for the full reasoning. No OpenSpec change yet.
16. Notifications: NOT STARTED, deliberately deferred — raised 2026-07-28.
    Stage 9 excluded notifications from the end-user app on purpose; an
    inbox-only model without email/webhook on assignment or reminder is a
    gap for customers used to being pushed to, not polling. Design approved
    2026-07-30 (see `docs/superpowers/specs/2026-07-30-notifications-design.md`):
    one new action-handler type, `notification.email`, on the existing
    action registry (mirroring `http.request`, roadmap #5e), not a new
    schema concept — the five existing action positions already cover
    "notify on assignment" (a step's `onEntry`) and "notify on reminder" (a
    timer's `onFire.actions`). Recipients are static config (`config.to`, a
    literal address list, exactly like `http.request`'s `config.url`), not
    resolved to the assignee — that needs a new actor-id/role to
    `auth_users.email` lookup that nothing in the engine does today, and
    stays a deliberate follow-on. Webhook notification is already covered by
    `http.request` at the same five positions, so it stays a documented
    recipe rather than new code. The handler speaks SMTP directly (`Bun.connect`
    plus TLS, no new npm dependency), keeping it as vendor-neutral as
    `http.request` is for webhooks; connection details
    (`SMTP_HOST`/`PORT`/`USER`/`PASSWORD`/`FROM`) come from the environment,
    never the process body, matching the `DATABASE_URL`/`AUTH_JWT_SECRET`
    convention. The devcontainer gains a `mailpit` service for real
    SMTP integration testing, the same "real dependency, not a mock"
    pattern the DB-backed suites already use against `db`. No OpenSpec
    change yet.
17. Escalation pattern: design DONE, implementation NOT STARTED. Raised
    2026-07-28. Design approved 2026-07-30 (see
    `docs/superpowers/specs/2026-07-30-escalation-pattern-design.md`). Timers
    are already first-class, but there was no documented recipe for "SLA
    breached → notify a manager / reassign" — today every customer would
    reinvent it per process. The design drops the originally-scoped
    dependency on stage 16 (Notifications): the pattern names an action
    position ("attach a notifying action here"), not a specific handler, so
    it works today with `http.request` (roadmap #5e) and will work
    identically with `notification.email` once stage 16 ships. No new
    engine capability. Two independent timers on a step with a human
    `assignment` — a non-forcing reminder (`onFire.actions`, existing) and a
    longer, forcing escalation timer (`onFire.targetPath`) whose target is an
    ordinary step with a *different* `assignment` (the escalation tier) and
    its own `onEntry` notify action. A step's paths stay all-manual or
    all-automatic (existing invariant), so a forced path into an escalation
    step must match the trigger type of its sibling paths. The design
    specifies a concrete extension of `examples/expense-approval.json`
    (`review`'s existing reminder timer gains a sibling escalation timer
    forcing a transition to a new `escalated_review` step, assigned to a new
    `finance-manager` role, with an `http.request` notify action), appended
    so every index-based reference in the six dependent test files
    (`test/validate.test.ts`, `test/compile-validation.test.ts`,
    `test/cel.test.ts`, `test/cancel.test.ts`, `test/http.test.ts`,
    `test/runtime-api.test.ts`) stays correct. Deliberately out of scope:
    chained/multi-tier escalation and a generic reusable escalation
    subprocess (both documented as possible future extensions, not built
    here), and resolving the notification recipient to the actual assignee
    (stays static config, per the stage 16 decision). No OpenSpec change
    yet — implementation (JSON edit + recomputed `definitionHash` + new
    end-to-end test) is tracked separately from this design.
18. Environment promotion: design DONE, implementation NOT STARTED. Raised
    2026-07-28. Design approved 2026-07-30 (see
    `docs/superpowers/specs/2026-07-30-environment-promotion-design.md`).
    Stage 11 explicitly excluded multi-environment transport as a product
    feature, and version numbers are environment-local (`definitionHash` is
    the only identity that carries across a boundary — see stage 11).
    Without an export/import path for process definitions between
    databases, moving a definition from staging to production was a manual
    rebuild. The design closes that gap with a pure `packages/studio` UI
    addition: no new engine capability, no new HTTP route, no schema
    change. Export downloads a published version as a `.json` file
    (`{processId, version, definitionHash, body}`) from the existing
    Versions screen; import reads that file back on the process list
    screen of the target environment and publishes it through the
    existing, unchanged `POST /processes { processId, body }` route. File
    transport only — no live network link or stored credentials between
    environments, keeping promotion an explicit, human-triggered action
    like publish and migration already are. Import republishes under the
    source's exact `processId` (Studio mints it client-side, not the
    server), the same fix `scripts/seed.ts` already applies by hand for
    `proc_credit_check`, so subprocess references stay valid once the
    referenced child has itself been promoted — no reference rewriting
    needed, and re-promoting an already-promoted version is a safe no-op
    via `publishBody`'s existing hash-idempotent check. Deliberately out of
    scope: a direct environment-to-environment network push, automatic
    dependency-graph bundling (subprocess children are promoted separately,
    child-first, same order `scripts/seed.ts` uses), promoting drafts
    instead of published versions, promoting migration plans/users/roles/
    instance data, and a cross-database diff before import. No OpenSpec
    change yet — implementation is tracked separately from this design.
<!-- antislop: allow sentence-length, run-ons, passive-voice. This entry
     matches the dense technical-prose convention every other DONE entry in
     this file already uses; see the antislop-targeted-allow-not-file-all
     memory for why that convention exists and why a block-scoped allow is
     the correct tool here, not a file-wide one. -->
19. Database seed data: DONE (`add-database-seed-data`; see the
    `database-seed-script` spec and the archived change
    `2026-07-30-add-database-seed-data`). `scripts/seed.ts`, wired to `bun
    run seed`, publishes the three `examples/*.json` bodies: `credit_check`
    first, under its literal pinned `processId` (`proc_credit_check`),
    since `subprocess-loan-parent.json` hardcodes that exact reference and
    a script-minted id would break the cross-process pin; then
    `loan_application` and `expense_approval`, each resolved to a stable
    `processId` by looking up an existing process's `key` first
    (`listProcesses`) so a re-run reuses it instead of minting a new one.
    It also provisions one demo account per reserved role
    (`system:publish`, `system:cancel-any`, `system:admin`,
    `system:developer`), looked up by email first so a re-run updates
    roles and password instead of hitting `auth_users.email`'s unique
    constraint. Idempotent by construction, not by a marker table: a
    re-run reports "already up to date" for every process and "updated"
    for every user, with zero duplicate rows, verified against a live
    database rather than only by test. Deliberately does not gate on
    `NODE_ENV` or any other environment signal — nothing in the repo reads
    one today, and no production deployment path exists yet (stage 14) to
    define what such a signal would mean; the accepted mitigation stays
    that the script never runs on its own, and its own output states the
    accounts are for local development only. Calls `src/auth/users.ts` and
    `src/engine/definitions.ts::publishBody` directly rather than
    `src/auth/cli.ts`, unlike this stage's original sketch guessed: the
    CLI is a thin argv-parsing wrapper over those same functions, so an
    in-process script calling them directly avoids a needless
    subprocess-spawn and string-argv round trip.
<!-- antislop: allow sentence-length, run-ons, passive-voice, em-dash. This
     entry matches the dense technical-prose convention every other DONE/
     design-DONE entry in this file already uses (including the closing
     "No OpenSpec change yet — implementation is tracked separately" phrase
     stages 17/18 both end on verbatim); see the antislop-targeted-allow-
     not-file-all memory for why that convention exists and why a
     block-scoped allow is the correct tool here, not a file-wide one. -->
20. Data retention & deletion policy: design DONE, implementation NOT
    STARTED. Raised 2026-07-28. Design approved 2026-07-30 (see
    `docs/superpowers/specs/2026-07-30-data-retention-deletion-design.md`).
    The runtime record is append-only by design (see "Runtime record" in
    CLAUDE.md), and nothing is ever archived or deleted today, so storage
    grows unbounded and a GDPR erasure request had no defined answer
    against an append-only audit trail. The design treats both problems
    as one policy: a retention period counted from an instance's
    completion triggers automatic clearing, and the same clearing runs
    early, on demand, for one instance, when an erasure request arrives
    first. A schema read settled where personal data actually lives:
    `HistoryEntry` and `InstanceEvent` carry only structural facts (step
    ids, path ids, opaque actor ids, field ids inside `ActionOutcome`),
    never a field value, so the append-only audit trail needs no change
    at all. The only place a participant's submitted field values live
    is `instances.body.data`, one non-historized object overwritten in
    place at every writeback. Redaction clears that one field to `{}`
    and stamps a new nullable `instances.redacted_at` column, matching a
    new `Instance.redactedAt` in the schema; no `history_entries`/
    `instance_events` row is ever touched. A new `redactInstance`
    (`src/engine/retention.ts`) refuses a `running` instance
    unconditionally, whether the trigger is automatic or manual, since
    live `data` is still read by guards and actions. An automatic sweep
    runs only when an operator sets `DATA_RETENTION_DAYS` in the
    environment; there is no default value, a deliberate departure from
    the `DATABASE_URL` convention, since a default would start an
    existing deployment erasing data the moment this code ships, with no
    operator opting in. When active, the sweep covers
    `completed`/`cancelled` instances past the window and excludes
    `faulted` ones, which stay an anomaly an operator may still need to
    inspect. A new `system:admin`-gated route, `POST
    /admin/instances/:id/redact`, covers the manual case for
    `completed`/`cancelled`/`faulted` instances, matching every other
    destructive admin action. Deliberately out of scope: per-process
    retention configuration, erasure of a running instance,
    `auth_users.email` erasure (stage 10's disable-not-delete decision
    already covers account-level requests), and data portability/export.
    No OpenSpec change yet — implementation is tracked separately from
    this design.
21. Reporting & analytics: design DONE, implementation NOT STARTED. Raised
    2026-07-28. Design approved 2026-07-30 (see
    `docs/superpowers/specs/2026-07-30-reporting-analytics-design.md`). The
    admin area (stage 10) is operations-focused (instances, outbox,
    timers); a process owner wants cycle time, bottleneck, and SLA views
    instead — a distinct audience from stage 10's operator, kept as its own
    stage rather than folded into admin since the consumer and the data
    shape both differ. The design closes that gap with a fourth product on
    the same engine, `packages/reporting` (new), gated by a new reserved
    role, `system:reports`, implying nothing else (no publish, no user
    administration, no migration run). Three views, each scoped to one
    selected process, mirroring Studio's process-first Versions/Migration
    screens: **Cycle-Time** (p50/p90/p99 total duration plus a per-step
    average dwell time, both restricted to `completed` instances, since a
    cancelled or faulted instance did not finish its normal path);
    **Bottleneck** (steps ranked by median dwell time, computed over every
    instance regardless of status since a step's own speed is observable
    the moment an instance has passed through it, plus a live, unfiltered
    count of `running` instances currently parked in each step); and
    **SLA** (a per-step breach rate, derived from the existing `timer.fired`
    `InstanceEvent` against a `timerId -> stepId` map resolved per version
    via the unchanged `resolveBody`, never a threshold typed into the UI —
    a step with no declared reminder/escalation timer carries no SLA and is
    absent from the view). Cycle-Time's per-step breakdown and Bottleneck
    share one primitive: a per-instance timeline of `(stepId, enteredAt)`
    built from `instances.startedAt` plus every `HistoryEntry.toStepId`/
    `at` in `transitionSeq` order, aggregated by step `id` across every
    published version of the process, since `id` is the stable reference
    anchor across versions per CLAUDE.md's "Identity" contract, the same
    key migration already re-maps by. Every view computes fresh on each
    request, no cache, no background aggregation job, matching the
    precedent `admin-queries.ts` and `/metrics` (stage 15) already set, and
    every view carries a date-range filter (default: last 30 days,
    adjustable) bounded by `instances.startedAt`. Deliberately out of
    scope: a cross-process dashboard (a step id, and therefore a bottleneck
    or an SLA breach, means nothing across processes), configurable SLA
    thresholds, precomputed or scheduled aggregation, editing anything, and
    a shared shell with `app`/`admin`/`studio` (stage 12's
    already-flagged session/login/routing duplication, unaffected by this
    design). No OpenSpec change yet — implementation is tracked separately
    from this design.
22. HTTP API documentation: NOT STARTED, deliberately deferred — raised
    2026-07-28. The HTTP wrapper (`src/http/`) has no published OpenAPI/
    contract document; needed once a customer integrates against it
    directly rather than only through the shipped frontends. Documentation
    only, no engine change. No OpenSpec change yet.
23. Extended task collaboration: NOT STARTED, deliberately deferred — raised
    2026-07-28. Stage 9 explicitly excluded attachments, comments, and
    delegation from the end-user app; classic BPM-suite expectations that
    may resurface as a customer ask rather than a committed direction. No
    OpenSpec change yet.
24. Multi-tenancy: NOT STARTED, deliberately deferred — raised 2026-07-28.
    Today's convention is one deployment/database per customer (see stage
    11's environment-separation note). A shared-infrastructure SaaS model
    would need tenant isolation this convention doesn't provide — this is a
    business-model decision to make first, not a technical default to build
    toward speculatively. No OpenSpec change yet.
