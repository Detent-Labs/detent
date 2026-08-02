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
12. Unified shell (consolidate app/admin/studio/reporting): DONE
    (`serve-web-assets` for step 0, `consolidate-frontend-shell` for steps
    1-5, both archived 2026-08-01). One package, `packages/web`, one build,
    one login, one address; the engine serves it from `WEB_ROOT`. See the
    `unified-shell` and `web-asset-serving` capabilities, and the "Unified
    shell" entry in `docs/current-state.md`.
    Four things in the plan below were wrong against the code and were
    corrected while building it. The four route tables are NOT rewritten: the
    shell strips the prefix inbound and prepends it outbound, so each area's
    `matchRoute`/`routePath` moved verbatim minus its `login` case, and
    Studio's migrate route needed no attention. Three of four sessions already
    carried `roles`. `ClientError` was never one type wearing four names, so it
    moved up as the union of every server error type. And an area prefix can
    collide with an API prefix: `/admin/outbox`, `/admin/timers` and
    `/admin/users` name both a screen and a `GET` admin route, so a browser
    navigation is now answered from the web root BEFORE route matching.
    The plan as it stood follows, for the record. It was
    raised 2026-07-28 as a "someday" question and re-brainstormed 2026-07-30
    without a trigger; the trigger is now stated — an installation must
    present itself as one system with one address, not four systems with four
    ports and four logins. No design document was written by request; this
    entry carries the design, and the two OpenSpec changes below carried it
    into code.
    Bestand as of this entry: four independently-built Vite SPAs, not three —
    `packages/reporting` (stage 21) arrived with the same trio every other
    package carries, `session.ts`, `routing.ts`, `screens/LoginScreen.tsx`,
    plus its own `ErrorBoundary.tsx`, `app.css`, `main.tsx`, `index.html` and
    `vite.config.ts`. Nothing serves the built assets: `src/http/` has no
    static route, so the four exist only as dev servers on ports 5173-5176
    and no deployment model exists yet.
    **Step 12a (shared session across origins) is dropped.** It would build a
    shared session/login package that the shell then dissolves — the same
    work twice. The two objections the old entry raised against 12b are
    answered: bundle size by route-level `React.lazy` (one build, one chunk
    per area, so a participant never downloads the Studio canvas), and
    coupled deploys by the delivery rule that an installation always
    installs everything and gates areas by role. The end state is smaller
    than today: one `vite.config.ts`, one `index.html`, one `main.tsx`, one
    `routing.ts`, one `session.ts`, one `LoginScreen`, one `ErrorBoundary`.
    Of 43 frontend tests, twelve files (4x `session.test.ts`, 4x
    `routing.test.ts`, 4x `vite-config.test.ts`) become three.
    Target layout — one package `packages/web` (named `web`, not `ui`, since
    `form-ui` already exists), the four old packages deleted:
    `src/main.tsx`; `src/shell/` (prefix routing, session, `LoginScreen`,
    `ErrorBoundary`, `AreaNav`, chrome CSS); `src/api/` (`API_BASE`,
    `ClientError`, `parseErrorBody`, authenticated fetch); `src/i18n/`
    (locale selection and persistence, catalogs stay per area);
    `src/areas/{app,admin,studio,reporting}/`, each keeping its own
    `screens/` and its own `api/` route functions and `types.ts`. The
    `areas/` level is deliberate: it makes "area" the name of the unit that
    owns one URL prefix, one lazy chunk and one role gate, and it makes the
    one rule that keeps the merge from tangling expressible as a path
    pattern — an area never imports from another area, only upward into
    `shell/`, `api/`, `i18n/`.
    URL scheme: `/login`; `/app/*`, `/admin/*`, `/studio/*`, `/reporting/*`;
    `/` redirects by role **client-side** (never a server 302 — the engine
    must not need to know its own outward address). An unknown prefix
    redirects to `/`. Role gating mirrors what the HTTP layer already
    enforces — app needs only a session, admin `system:admin`, studio
    `system:developer`, reporting `system:reports` — and needs no backend
    change: `POST /login` already returns `actor: {id, roles}`
    (`src/auth/login.ts:101`), which today's `session.ts` discards. The
    consolidated session persists `{token, actorId, roles, expiresAt}`. The
    gate is display logic only; the server still answers 403 on a direct
    hit. The area switcher sits inside the account menu on the right of the
    header next to language and logout, lists only the other permitted
    areas, and is absent for an actor with one area — a participant sees no
    trace of the consolidation. Current location shows in the URL prefix and
    the document title, not as a label in the header.
    Static serving hooks in as a fallthrough **behind** every API route,
    at the terminal 404 in `src/http/server.ts:518`, so no prefix is
    reserved and later API routes need no special case. GET/HEAD only;
    an existing file under the root is served (`Cache-Control:
    max-age=31536000, immutable`, since Vite hashes asset names), anything
    else falls back to `index.html` (`no-cache`) for the history API. Root
    from `WEB_ROOT`, defaulting relative to `import.meta.dir`; absent
    directory means the branch is skipped and the engine runs unchanged
    without a built frontend. The resolved path must stay under the root —
    a trust boundary, with its own test for `..` and its encoded forms.
    A reverse proxy in front stays mandatory-possible, which is what forbids
    absolute URLs in the build (`base: "/"`), forbids the server-side `/`
    redirect, and is why an absent `WEB_ROOT` has to be a supported
    configuration. CSP needs no work — the policy is a build-time `<meta>`
    tag from `vite.config.ts`'s `contentSecurityPolicy()`, and same-origin
    is already its `connect-src 'self'` default. CORS/`allowedOrigins` stays
    for dev (Vite on 5173 against the engine via `VITE_API_URL`).
    Two findings that shape the work and were confirmed against the code:
    - All four `matchRoute`/`routePath` pairs assume they own `/` (Studio's
      `routePath({name:"processes"})` returns `"/"`). Under prefixes all four
      are **rewritten, not moved** — the largest hidden cost, and it falls on
      every step alike. Route names themselves do not collide: apart from
      `login`, each name (`tasks`, `instances`, `processes`, `edit`,
      `migrate`, `tools`, `play`, `outbox`, `timers`, `users`, ...) occurs in
      exactly one package, so the union type needs no renaming.
    - Nine type names recur across the four `api/types.ts` (`ClientError`,
      `LoginResponse`, `ProcessSummary` in all four; `Actor`, `InstanceView`
      in three; `InstancePage`, `InstanceSummary`, `InstanceRecordPage`,
      `InstanceRecordElement`, `VersionSummary` in two). Separate modules, so
      not a compile error — and mostly not a duplication either: each package
      declares only the fields it reads, off different endpoints with
      different projections. Only `ClientError`, `LoginResponse` and `Actor`
      move to `src/api/types.ts`; every domain type stays per area, including
      pairs that currently look identical.
    Order (studio second on purpose — it holds the hardest routing case,
    `/processes/:processId/migrate/:from/:to`, and meeting it while only two
    areas hang off the shell is far cheaper than meeting it fourth):
    0. Static serving in the engine — DONE (`serve-web-assets`). The only
       backend change, reviewed alone, tested against a fixture directory
       rather than a real build. `src/http/static.ts` falls through behind
       every API route at `createServer`'s terminal 404; `WEB_ROOT` names the
       directory and defaults, inertly for now, to `packages/web/dist`.
    1. `packages/web` with `shell/` + `areas/app`, `packages/app` deleted.
       DONE. Carries the prefix-routing contract and the session gaining
       `roles`. Two findings above were corrected against the code while
       building it: the four route tables are NOT rewritten (the shell strips
       the prefix on the way in and prepends it on the way out, so each area's
       `matchRoute`/`routePath` moves verbatim minus its `login` case, and
       Studio's migrate route needed no attention), and three of the four
       sessions already carried `roles` — only `packages/app` discarded them.
    2. `areas/studio`, `src/api/` extracted here (largest client, 278 lines,
       against app's 166 — a more honest cut than two mid-sized ones).
    3. `areas/admin`. 4. `areas/reporting`. 5. Cleanup: root scripts,
       `docs/current-state.md`, CLAUDE.md's repository layout, this entry.
    Intermediate states stay shippable: `AreaNav` and the `/` redirect list
    only already-migrated areas, and areas not yet migrated stay reachable on
    their old Vite port.
    `packages/form-ui` stays a separate package throughout — it is imported
    from two sides for the whole migration and must not move. Folding it in
    as `src/form/` is a separate decision after step 5.
    Two OpenSpec changes, both archived 2026-08-01: `serve-web-assets`
    (step 0) and `consolidate-frontend-shell` (steps 1-5, one change with the
    task list in the order above). A third change splitting off
    admin/reporting was considered and rejected: it would carry no spec
    delta, only more areas under the same capability.
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
    actually gets scheduled. Re-brainstormed 2026-07-30: confirmed still
    no committed trigger for either, so no design was produced. Revisit
    (a) once a process actually ships in two or more locales and the gaps
    become hard to find by hand. Revisit (b) once a specific customer asks
    for its own UI-chrome wording, not before.
14. Deployment & operations readiness: DONE. Sub-projects (a), (b), and (c)
    all DONE. Raised 2026-07-28 as a "someday" question
    while sketching what shipping to a real customer needs beyond stages
    1–13. Today the only run path is the devcontainer. Three independent
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
<!-- antislop: allow sentence-length, run-ons, passive-voice, em-dash. This
     entry matches the dense technical-prose convention every other DONE
     entry in this file already uses; see the antislop-targeted-allow-
     not-file-all memory for why that convention exists and why a
     block-scoped allow is the correct tool here, not a file-wide one. -->
    b. Production Docker image(s) for the engine and each frontend: DONE
       (`add-production-docker-images`; see the `production-docker-images`
       spec and the archived change
       `2026-07-30-add-production-docker-images`). `docker/engine.Dockerfile`
       is single-stage (`oven/bun:1.3.11-slim`, `bun install --production
       --frozen-lockfile`, runs as the base image's non-root `bun` user),
       since Bun runs TypeScript directly and there is no build tool to
       strip out of a later stage. Its `HEALTHCHECK` calls `GET /readyz`
       using Bun's own `fetch`, reading `PORT` from its own runtime
       environment rather than a hardcoded value, so an overridden `PORT`
       does not desync the check from the server. `docker/frontend.Dockerfile`
       is one parameterized multi-stage image, not three near-duplicate
       files: a `PACKAGE` build arg selects `app`/`admin`/`studio`, and
       `VITE_API_URL` is a build-arg-only origin, since Vite inlines it at
       `vite build` time and a container runtime env var would arrive too
       late to matter. The serve stage is `nginxinc/nginx-unprivileged:alpine`
       (non-root by default) with a shared `docker/nginx.conf` (an SPA
       fallback to `index.html` for each package's client-side History API
       routing) and a `HEALTHCHECK` targeting `127.0.0.1`, not `localhost` —
       this base image resolves `localhost` to an IPv6 address nginx does
       not listen on, and BusyBox `wget` does not retry a second resolved
       address on connection refused, confirmed empirically while building
       the image. A repo-root `.dockerignore` keeps `node_modules`, `.git`,
       `.devcontainer`, `docs`, and test directories out of every build
       context.
    c. A documented backup/restore runbook for the Postgres schema: DONE
       (`docs/runbooks/backup-restore.md`; design at
       `docs/superpowers/specs/2026-07-30-backup-restore-runbook-design.md`).
       Pure packaging/ops documentation. No engine or schema change.
       Independent of (a) and (b); sequenced last because it caps off the
       "deployment readiness" story, not because it depends on either. One
       Postgres database backs an entire environment (the existing
       environment-separation convention), so a whole-database `pg_dump -Fc`
       is the backup unit, not a per-table one. Restore stops the engine
       first, since the outbox worker and timer scheduler both write to the
       database continuously, then runs `pg_restore --clean --if-exists -d
       <target> <dump-file>`, then restarts the engine and checks `GET
       /readyz` (Stage 14a) to confirm the restore worked. No new engine
       code and no new script: `pg_dump`/`pg_restore` already do this job.
       Deliberately out of scope: automated backup scheduling
       (deployment-specific), point-in-time recovery/WAL archiving (no
       stated recovery-point requirement needs it yet), and backup-file
       encryption (delegated to the deployment's existing storage/ops
       tooling). Delivered as OpenSpec change `backup-restore-runbook`,
       departing from the design's own "no OpenSpec change" note — a
       deliberate choice for this docs-only task, not a default for future
       ones of the same shape. Stage 14 (a, b, c) is fully DONE.
<!-- antislop: allow sentence-length run-ons passive-voice em-dash. This
     entry matches the dense technical-prose convention every other DONE
     entry in this file already uses; see the antislop-targeted-allow-
     not-file-all memory for why that convention exists and why a
     block-scoped allow is the correct tool here, not a file-wide one. -->
15. Observability: DONE (`add-observability`; design at
    `docs/superpowers/specs/2026-07-30-observability-design.md`). Raised
    2026-07-28. No structured logging convention, no metrics, no tracing
    existed before this; outbox backlog, timer latency, and
    `faulted`-instance rate were visible only by hand through the admin
    area. Scoped during brainstorming to exactly the two things the
    roadmap names — metrics and a logging convention, deliberately not
    tracing — following stage 14a's dependency-free precedent: a
    hand-rolled structured-JSON logger (`src/log.ts`, a process-wide
    `LOG_LEVEL` threshold, existing `console.*` call sites converted) and
    an unauthenticated `GET /metrics` Prometheus-text endpoint computed
    fresh from the database on every scrape, exposing exactly the three
    signals named above — outbox backlog by status (reusing
    `countOutboxByStatus`), timer overdue count/max lag (a new
    `getTimerLagStats`), and faulted-instance count (a new, general-shaped
    `countInstancesByStatus`). Returns `HttpBinaryResult`, not
    `HttpResult` — the design's original sketch missed that `server.ts`'s
    shared `toResponse` always `JSON.stringify`s an `HttpResult` body,
    which would have corrupted the exposition text; caught and fixed
    during proposal review by reading `server.ts`/`errors.ts` directly,
    before implementation started. A query failure reports 503 with an
    empty body rather than a crash or a false all-zero 200. `GET /metrics`
    is documented in `docs/openapi.yaml` alongside `/livez`/`/readyz`, the
    same unauthenticated-exception treatment stage 14a's routes already
    get. Generic HTTP request metrics and any metrics/logging library
    stayed out of scope; see the design's non-goals for the full
    reasoning.
16. Notifications: DONE (`add-notifications`, implemented 2026-07-31; see the
    `notification-email-action-handler` capability spec and the
    "Notifications" entry under `docs/current-state.md`). Raised 2026-07-28.
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
    pattern the DB-backed suites already use against `db`.
    Implemented 2026-07-31 as designed, plus five decisions the design did
    not settle, each found while reviewing the proposal against the code
    rather than during implementation. **The stage is only half of what its
    own rationale asked for, and this is not a wording quibble**: a static
    `config.to` reaches a team or manager mailbox, never the actor a step is
    assigned to, so "a participant is pushed to instead of polling" stays
    open. That gap is now measured, not guessed: `HandlerContext` is
    `{action, config, idempotencyKey, instanceId}` and carries no `db`,
    because `deliver` runs outside any transaction, so resolving an assignee
    to `auth_users.email` widens the handler seam itself. It is a stage
    (#16b), not a follow-up patch. The escalation recipe (#17) is unaffected:
    an escalation notifies a tier, and a tier is a static address.
    The other four: the handler returns `{messageId, recipients}` as a
    declared `result` shape, since `evalOutput` throws a plain (transient)
    error when an `Action.output` entry cannot read `result`, which would
    redeliver a message the server already accepted; the `250` on
    end-of-`DATA` is a point of no return, after which `QUIT`, a socket
    reset and the session timeout can no longer fail the delivery, because
    SMTP has no idempotency contract and most receivers ignore `Message-ID`;
    every `RCPT TO` is checked before `DATA`, so one rejected address aborts
    with nothing sent rather than duplicating for the accepted addresses on
    the retry a `4xx` triggers; and an unset `SMTP_FROM` is permanent like an
    unset `SMTP_HOST`, with no substitute sender, since a synthesized address
    fails SPF at a real relay. `socket.upgradeTLS` was verified present in
    the pinned Bun 1.3.11 before the transport decision was accepted.
    `examples/expense-approval.json` gained a `notification.email` action
    beside `escalated_review`'s existing `http.request`, so #17's recipe
    now shows both notifying handlers at one action position. Three
    hand-built test registries needed the new type, the same ripple #17
    recorded.
    **One gap stays open and is not a missing test.** The handler's STARTTLS
    decisions are covered: it issues `STARTTLS` when the server advertises
    it, sends no credential before the upgrade, refuses to authenticate in
    the clear against a server that offers none, and reports a stalled
    upgrade as `... during TLS handshake` rather than a bare timeout. What
    is NOT covered is a completed TLS handshake, and no local harness could
    produce one: Bun refuses a server-side `upgradeTLS` outright ("Use
    upgradeDuplexToTLS with isServer: true"), and a `node:tls`
    `TLSSocket({isServer: true})` never handshakes with a Bun client socket
    in-process — traced to the byte, the client's ClientHello never lands.
    So the authenticated-relay path, the main production case, is verified
    by reading only. Closing it needs either a TLS-capable Mailpit (a
    committed test certificate plus `NODE_EXTRA_CA_CERTS`) or one
    handshake-only probe against a real public relay. Both are decisions
    beyond this change.
17. Escalation pattern: DONE (`add-escalation-pattern`, archived
    2026-07-31). Raised
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
    Implemented 2026-07-31 exactly as designed: `examples/expense-approval.json`
    gained the `escalated_review` step, its `finance-manager` assignment and the
    sibling forcing timer, plus an end-to-end test in `test/runtime-api.test.ts`
    and a new `escalation-pattern` capability spec. Two existing happy-path
    tests whose hand-built registries did not know `http.request` were fixed in
    the same change.
18. Environment promotion: DONE (`add-environment-promotion`). Raised
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
    instance data, and a cross-database diff before import.
    Implemented 2026-07-31. Two pure modules
    (`packages/studio/src/screens/promotionExportLogic.ts`,
    `promotionImportLogic.ts`), one new client function `publishProcess`, an
    Export action per version row, and an import flow on the process list
    behind a native `<dialog>` preview. The exported `body` is the COMPILED
    body, shipped and re-published verbatim: `publishBody` always calls
    `compileProcessBody`, which returns an already-compiled body unchanged, so
    the target recomputes the source's own `definitionHash`. Stripping it back
    to the authored shape (what the adjacent `seededDraftInput` must do for a
    draft) would reach the same hash by a longer road, and is explicitly ruled
    out in the module. Two additions the approved design did not anticipate,
    both found while implementing: the import preview warns when a DIFFERENT
    process in the target already publishes under the incoming `key` (nothing
    enforces key uniqueness — `definitions` is keyed `(process_id, version)`
    and `key` lives in the body — and a published process cannot be deleted),
    and Studio's client learned the six publish-time rejections it had been
    collapsing into a generic "the server hit an error", which the existing
    Publish action had hit identically. Verified against two live databases
    and through a browser: hash carries across, a re-import mints no version,
    a parent before its child is refused with the server's own message.
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
    one today. The original mitigation (the script never runs on its own)
    rested on there being no production deployment path yet; stage 14
    shipped one, so 2026-08-01 replaced it with an explicit opt-in: an
    unset `SEED_ALLOW` aborts before `initSchema`, writing nothing. Five
    fixed-password accounts, one of them `system:admin`, were otherwise a
    mistyped `DATABASE_URL` away from a real database. The script's own
    output still states the accounts are for local development only.
    Calls `src/auth/users.ts` and
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
20. Data retention & deletion policy: DONE (`add-data-retention-deletion`;
    design at
    `docs/superpowers/specs/2026-07-30-data-retention-deletion-design.md`).
    Raised 2026-07-28, design approved 2026-07-30, implemented 2026-07-31.
    The runtime record is append-only by design (see "Runtime record" in
    CLAUDE.md), and nothing was ever archived or deleted before this
    stage, so storage grew unbounded and a GDPR erasure request had no
    defined answer against an append-only audit trail. The design treats
    both problems as one policy: a retention period counted from an
    instance's completion triggers automatic clearing, and the same
    clearing runs early, on demand, for one instance, when an erasure
    request arrives first. A schema read settled where personal data
    actually lives: `HistoryEntry` and `InstanceEvent` carry only
    structural facts (step ids, path ids, opaque actor ids, field ids
    inside `ActionOutcome`), never a field value, so the append-only audit
    trail needed no change at all. The only place a participant's
    submitted field values live is `instances.body.data`, one
    non-historized object overwritten in place at every writeback.
    Redaction clears that one field to `{}` and stamps a new nullable
    `instances.redacted_at` column, matching a new `Instance.redactedAt`
    in the schema; no `history_entries`/`instance_events` row is ever
    touched. `redactInstance` (`src/engine/retention.ts`) refuses a
    `running` instance unconditionally, whether the trigger is automatic
    or manual, since live `data` is still read by guards and actions, and
    is idempotent (a second call against an already-redacted instance is
    a no-op). It also deletes that instance's `instance_comments` and
    `instance_attachments` rows in the same transaction, per the
    2026-07-30 addendum below. An automatic sweep
    (`startRetentionSweep`/`sweepRetention`) runs only when an operator
    sets `DATA_RETENTION_DAYS` to a positive integer; there is no default
    value, a deliberate departure from the `DATABASE_URL` convention,
    since a default would start an existing deployment erasing data the
    moment this code ships, with no operator opting in. An invalid-but-set
    value fails engine startup outright rather than silently leaving the
    sweep off, so a misconfiguration can't masquerade as "retention is
    active." When active, the sweep runs hourly, keyset-paginates eligible
    instances in batches of 500 (mirroring `migrateInstances`'s own
    pagination), and covers `completed`/`cancelled` instances past the
    window while excluding `faulted` ones, which stay an anomaly an
    operator may still need to inspect. A `system:admin`-gated route,
    `POST /admin/instances/:id/redact`, covers the manual case for
    `completed`/`cancelled`/`faulted` instances, matching every other
    destructive admin action; `packages/admin`'s instance detail screen
    gained a "Redact data" action and a redacted-on-`<date>` badge, backed
    by a new `redactedAt` field on `InstanceView`
    (`src/runtime/api.ts::getInstanceView`). `docs/openapi.yaml`
    deliberately does not document the new route: its own scope statement
    excludes every `admin/*` route, the same exclusion
    `/admin/migrations/run` already falls under. Deliberately out of
    scope: per-process retention configuration, erasure of a running
    instance, `auth_users.email` erasure (stage 10's disable-not-delete
    decision already covers account-level requests), and data
    portability/export. **Addendum, 2026-07-30**: Stage 23b and 23c
    (instance comments, instance attachments, both DONE) each added a
    table that can carry personal data outside `instances.body.data`;
    `redactInstance`'s implementation (above) covers both. This did not
    change the design; it only extended its existing scope to two tables
    the design predates.
21. Reporting & analytics: DONE (`add-reporting-analytics`, implemented
    2026-08-01; design at
    `docs/superpowers/specs/2026-07-30-reporting-analytics-design.md`). Raised
    2026-07-28, design approved 2026-07-30. Two of the approved design's
    claims did not survive a read of the engine, and the change corrects
    both rather than building on them. First, the design says a reminder
    *or escalation* timer firing is already a `timer.fired` event. It is not:
    `fireTimer` (`src/engine/transition.ts`) writes that event only on the
    reminder branch, while a transition timer (`onFire.targetPath`, the shape
    an escalation takes, and the shape Roadmap #17 established as the
    SLA-breach recipe) calls `commitTransition(..., "timer", ...)` and writes
    a `HistoryEntry` with `cause: "timer"` and the timer's `targetPath` as
    its `pathId` — no event at all. Reading only the event form would report a
    breach rate of zero over a full denominator for exactly the steps whose
    SLA escalates, so `reporting.ts` recognises both forms, and the test drives
    `expense-approval.json`'s own two timers. Second, `migrateOne` calls
    `planStepEntry` unconditionally, so an instance migrated in place gains a
    `HistoryEntry` whose `toStepId` is the step it already occupies; the
    timeline walk drops that entry, scoped to the `migration` cause only,
    since a self-loop path under `user`/`automatic`/`timer` is a real
    re-entry. Cancellation likewise writes a `HistoryEntry` to the cancel
    sink, so the step held at cancellation yields a real closing traversal
    (counted — an abandoned wait is time spent) while the sink itself yields
    none. Delivered as `src/engine/reporting.ts` (the timeline primitive plus
    the three views), `src/http/reporting-routes.ts` (four `GET /reporting/*`
    routes behind the new `REPORTS_ROLE`, checked before process resolution so
    a caller without it gets 403 rather than 404 for an unknown id), and
    `packages/reporting` (the fourth frontend). No schema change, no new
    table, no new index, no write route. A fourth frontend and a fifth
    reserved role made five existing capabilities factually wrong where they
    enumerated three packages or four roles; each is corrected in the same
    change (`frontend-security-headers`, `production-docker-images`,
    `development-toolchain` — port 5176 and the CORS allowlist —
    `database-seed-script`, and `http-api-documentation`, where `reporting/*`
    joins `admin/*` on the internal-only exclusion list). `spa-accessibility`
    and `spa-error-reporting` needed no delta: their requirements are already
    count-free, and only their Purpose prose was edited. The
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
    already-flagged session/login/routing duplication, which a fourth
    frontend continues and this change does not resolve). All of it held
    through implementation. One limitation is worth naming: the timeline
    walk reads the initial step from the instance's CURRENT pinned version,
    so an instance migrated onto a version that renamed its initial step
    names the target's. The engine records no creation-time version, so
    closing that needs a new persisted fact rather than a smarter walk; it
    carries a `ponytail:` comment. The unindexed
    `(body->>'startedAt')::timestamptz` range predicate carries another,
    naming the one-line index that fixes it when a real deployment measures
    it as slow.
22. HTTP API documentation: DONE (`add-http-api-documentation`; design at
    `docs/superpowers/specs/2026-07-30-http-api-documentation-design.md`).
    Raised 2026-07-28. The HTTP wrapper (`src/http/`) had no published
    contract document, needed once a customer's own system integrates
    against the engine directly instead of only through the three shipped
    frontends. Documentation only, no engine change. Delivered as
    `docs/openapi.yaml`, one hand-written OpenAPI 3.0 file covering the
    Runtime API Layer routes a customer would actually call: auth login,
    process create/list/versions/publish, and the full instance lifecycle
    — create/get/list/submit/claim/release/delegate/comments/cancel/record.
    `admin`/`drafts`/`migration-plans`/`registry` stay out, since those
    serve `packages/admin`/`packages/studio` themselves, not a customer
    integration. Not a generator: the repo has no schema-to-OpenAPI tool
    today, and adding one for a doc-only task on 16 routes costs more than
    hand-writing them, since a generator would still need hand-authoring
    for response shapes, error mappings, and auth requirements.
    A source review against the codebase, done while implementing this
    stage, corrected the approved design on three points before
    transcription started: the design's route list predated
    `POST /instances/:id/delegate` and the two `.../comments` routes
    (Roadmap #23a/b), both now included; the design listed 404 among the
    statuses every route documents, but `src/http/errors.ts` never maps a
    specific route to 404 (a not-found instance or process returns 500 by
    design, and 404 stays reserved for an unmatched path); and
    `POST /auth/login` does not route through `errors.ts` at all —
    `src/auth/login.ts` builds its own 400/401 responses and a 429 for its
    per-email rate limit, a status no other route returns. Delivered
    through an OpenSpec change, departing from the design's own "no
    OpenSpec change" note for a docs-only deliverable — the same
    deliberate departure Roadmap #14c already took for the same reason.
23. Extended task collaboration: DONE. Sub-projects (a), (b), and (c) all
    DONE. Raised 2026-07-28. Stage 9
    explicitly excluded attachments, comments, and delegation from the
    end-user app. Re-brainstormed 2026-07-30, at the user's direction, into
    three designs instead of staying deferred: delegation first, since it
    sits closest to the existing engine core, then comments, then
    attachments.
    a. Task delegation: DONE (`add-task-delegation`; design at
       `docs/superpowers/specs/2026-07-30-task-delegation-design.md`). A
       new `delegateClaim(instanceId, actor, toActorId, db)` sits next to
       the existing `claimStep`/`releaseClaim` (Roadmap #5d) and reuses
       their `updateAssignment` helper unchanged. The calling actor must
       hold the current claim; the delegate becomes the new claimant
       without joining the permanent candidate pool, so a release lets the
       original candidates reclaim the step. A new `InstanceEvent` kind,
       `assignment.delegated`, payload `{fromActorId, toActorId}`, records
       it, added to the same discriminated union as the other nine kinds.
       `POST /instances/:id/delegate` and a "Delegate to" action on
       `packages/app`'s Task screen expose it.
    b. Instance comments: DONE (`add-instance-comments`; design at
       `docs/superpowers/specs/2026-07-30-instance-comments-design.md`). A
       new table, `instance_comments` (`id`, `instanceId`, `actorId`,
       `text`, `createdAt`), not `InstanceEvent`: comment text is
       free-form and can carry personal data, which would break Roadmap
       #20's approved design, resting on `HistoryEntry`/`InstanceEvent`
       carrying only structural facts, never a field value.
       `postComment`/`listComments` (`src/runtime/api.ts`) reuse
       `getInstanceView`'s participant-facing visibility rule, not
       `getInstanceRecord`'s narrower audit-trail one, via a new shared
       `loadInstanceForActor` helper the two functions now both call; no
       new permission tier. `POST`/`GET /instances/:id/comments` expose
       them, text capped at a new `MAX_COMMENT_LENGTH` (10,000
       characters), enforced only at the HTTP boundary — `postComment`
       itself trusts it, the same division of labour `delegateClaim`
       already applies to `toActorId`. `packages/app`'s Task screen gains
       a comment thread beside the field form, visible independent of
       claim state. This change adds no new capability spec; it extends
       four existing ones (`persistence`, `runtime-api`, `http-wrapper`,
       `end-user-app`) instead, the same shape (a) already used.
       Implementing this surfaced and fixed a real pagination bug in its
       own new `listComments` cursor (Bun's Postgres driver returns
       `timestamptz` as a millisecond-precision `Date`, so building a
       keyset cursor from it silently lost the sub-millisecond precision
       Postgres itself still compares on, reintroducing the boundary row
       on the next page) by encoding the cursor from `created_at::text`
       instead. `fix-instance-list-cursor-precision` closed the
       identical latent bug in `listInstances` (Roadmap #6,
       `instance-query`) the same way. There, DESC ordering made the
       symptom worse than a duplicate: any instance sharing a
       millisecond with the page boundary silently vanished from the
       walk instead of reappearing.
       Roadmap #20's `redactInstance` needs a required addition: delete
       `instance_comments` rows for a redacted instance, the same erasure
       guarantee it already gives `instances.body.data`.
    c. Instance attachments: DONE (`add-instance-attachments`; design at
       `docs/superpowers/specs/2026-07-30-instance-attachments-design.md`).
       A new table, `instance_attachments`, stores file bytes as Postgres
       `bytea`, not object storage: no new dependency, works identically
       on-premise and in SaaS, and reuses the Roadmap #14c backup/restore
       runbook unchanged. `uploadAttachment`/`listAttachments`/
       `getAttachment` (`src/runtime/api.ts`) use instance-scoped lookup,
       matching (b)'s `loadInstanceForActor` visibility rule. Three HTTP
       routes expose them, including a non-JSON binary response for
       download. `MAX_ATTACHMENT_BYTES` defaults to 5 MB, staying under the
       existing `MAX_REQUEST_BODY_SIZE` once base64 overhead is accounted
       for, following the `DATABASE_URL`-style environment-variable
       convention. `packages/app`'s Task screen gains an upload/list/
       download section, and `docs/openapi.yaml` documents the new routes.
       The same `redactInstance` addition (b) needs applies here too.
    Each spec's own Non-goals section stays authoritative; none of the
    three touches `definitions`, `history_entries`, or `instance_events`.
24. Multi-tenancy: design DONE, implementation NOT STARTED (see
    `docs/superpowers/specs/2026-07-30-multi-tenancy-design.md`). Raised
    2026-07-28, deferred twice as a business decision. Re-brainstormed
    2026-07-30 once that decision was made: the engine must support both a
    shared SaaS deployment and today's on-premise, per-customer
    deployment, from one codebase. Two isolation models were considered
    and rejected: a row-level `tenant_id` column on every table (cheapest,
    but one missed `WHERE` clause leaks one tenant's data into another's
    response) and schema-per-tenant (stronger, but one shared migration
    run still couples every tenant together). The recommended model is one
    database per tenant, reusing Roadmap #11's existing
    environment-separation convention exactly: on-premise stays one
    deployment, one `DATABASE_URL`, one tenant, unchanged; SaaS runs many
    tenant databases behind one shared `Bun.serve` process, with a new
    control-plane `tenants` table (`id`, `key`, `name`, `databaseUrl`) the
    only new shared state. No table gains a `tenant_id` column and no
    query gains a tenant filter, since every route handler already takes a
    `db` argument the server resolves per request in SaaS mode; `auth_users`
    needs no change either, since each tenant's database already carries
    its own. Tenant resolution reuses Stage 7's existing multi-resolver
    JWT-`iss` dispatch. Provisioning a new tenant is a CLI action mirroring
    `src/auth/cli.ts`, not self-service. One environment variable (a
    control-plane connection string) turns SaaS mode on; unset, the server
    behaves exactly as it does today. Deliberately out of scope: cross-
    tenant billing/usage dashboards, self-service signup, forced migration
    of an on-premise deployment into the SaaS control plane, and per-
    tenant quotas. No OpenSpec change yet.
<!-- antislop: allow sentence-length run-ons passive-voice em-dash. This
     entry matches the dense technical-prose convention every other entry
     in this file already uses; see the antislop-targeted-allow-
     not-file-all memory for why a block-scoped allow is the correct tool
     here, not a file-wide one. -->
25. Per-instance step assignment: design DONE (approved 2026-08-02, see
    `docs/superpowers/specs/2026-08-02-pluggable-step-assignment-design.md`);
    change B DONE, A and C NOT STARTED. Raised 2026-08-01 as a
    reality check on how a user acquires a role a process names. The answer
    exposed a deeper gap: `planStepEntry` copies `assignment.strategy.config
    .candidates` verbatim from the frozen definition onto the instance, so
    every instance of a definition carries an identical list. That serves
    "anyone in accounting" and cannot express "the requester's manager". It
    also cannot scope a shared definition per instance — a company-wide leave
    request listing `["dept-a:manager", "dept-b:manager"]` lets department B's
    manager approve department A's request, silently, and puts it in their
    inbox too (`listInstances` with `scope=mine` queries the same array). No
    role naming repairs that: any name sits in the immutable body, which knows
    nothing about the instance. Two independent pieces are missing —
    organizational facts (`auth_users` holds email, password hash, roles and a
    disabled flag, no manager and no department) and a path for the answer to
    reach the step. Three OpenSpec changes:
    a. Role editing in the admin area: NOT STARTED. `PATCH
       /admin/users/:userId/roles` behind `system:admin`, over the existing
       `src/auth/users.ts::setRoles`, plus a control in `packages/web`'s
       `UsersScreen`. Closes the CLI-only gap stage 10's `admin-users`
       deliberately left, which becomes untenable once business roles multiply.
       No contract change; independent of (b).
    b. Assignment strategy registry: DONE (archived
       `2026-08-02-add-assignment-strategy-registry`; see the
       "Auth/Actor-Resolution + Assignment/Claim-Enforcement" entry under
       `docs/current-state.md`, which now carries the registry). `AssignmentRegistry`
       becomes a third map beside the action `Registry` and the
       `DataSourceRegistry`, `publishBody` takes it, `checkAssignmentRegistry`
       resolves against it (reusing `checkTypedConfig` and deleting its
       hand-written loop plus `staticAssignmentConfigSchema`), and
       `commitTransition`/`createInstance` call the registered resolver before
       the transaction opens — `planStepEntry` receives the resolved set as a
       caller-supplied override beside `opts.timers` and stays pure and
       synchronous. `"static"` becomes a registered entry with unchanged
       behaviour, so the change alters no behaviour at all and needs no
       migration; `Step.assignment.strategy` already uses the generic `plugin`
       envelope, so the JSON contract is untouched. The resolver signature is
       async even though `static` needs no I/O, copying
       `DataSourceHandlerDef.resolve`'s reasoning. **This contradicted a stated
       rule**: `CLAUDE.md` and `docs/current-state.md` both recorded that
       assignment strategy is not an extension point; the same commit corrected
       them and `docs/authoring-guide.md`.
       Two things landed wider than the proposal stated. The caller set is four,
       not two — `commitTransition`, the subprocess spawn handler,
       `startInstance` and `api.ts::createProcessInstance` — and
       `StepEntryOpts.assignment` is required rather than optional, so a missed
       caller fails to compile instead of silently unassigning a step; migration
       passes `{ carry: true }` and runs no resolver at all. Three of the four
       resolve before their transaction opens, but the subprocess RETURN path
       resolves the parent's candidates while holding the parent's row lock,
       because it derives the step it enters from the row it read under that
       lock. `static` performs no I/O, so nothing shipped waits there; (c) owns
       bounding it, and `CLAUDE.md`'s "Decided, not yet built" list records the
       two ways out. Deferred to (c) after
       review: a resolution deadline, a failure classification and an
       `assignment.unresolved` event — `static` cannot fail, so nothing in (b)
       exercises them, and deciding them here would repeat the speculative
       timeout/error semantics `CLAUDE.md` already defers for a dynamic data
       source. An unregistered type reaching step entry resolves to an empty
       candidate list rather than raising, and substitutes no fallback assignee.
    c. Manager service: NOT STARTED. One field on the user (manager → person, a
       pointer, not a tree) edited on the same screen (a) touches, plus a
       built-in `org.manager-of-starter` strategy resolving the manager of
       `instance.startedBy`, which every instance already records. This is the
       first fallible resolver, so it owns the deadline, the failure handling
       and the `assignment.unresolved` event (b) deferred. A later switch to
       Entra ID or AD replaces only what the strategy asks internally: a
       definition names the strategy, never a storage location, and stage 7's
       JWT resolver already accepts an external issuer. Identity stays
       consistent because the value written into `candidates` is always the id
       the person authenticates with; instances created before such a switch
       keep the old ids, which is a migration concern for the switch itself.
    Deliberately out of scope across all three, each rejected during
    brainstorming with its reason recorded in the design: a permission store per
    process (two instances of one frozen definition would behave differently on
    data outside the body, breaking versioning, migration pinning and the audit
    record), a role hierarchy such as `dept-all:manager` implying
    `dept-a:manager` (hierarchies broaden, the requirement narrows per instance;
    `src/auth/authorize.ts` already records the no-hierarchy decision, and
    `isEligibleCandidate` plus the JSONB `?|` inbox filter would both have to
    expand identically or a step becomes claimable but invisible), a general
    expression-backed strategy computing candidates by CEL over instance data,
    an automatic fallback assignee when resolution yields nobody, re-resolution
    when someone's manager changes mid-instance (delegation already covers the
    one-off case), and the Entra/AD integration itself.
<!-- antislop: allow sentence-length run-ons passive-voice em-dash. This
     entry matches the dense technical-prose convention every other entry
     in this file already uses; see the antislop-targeted-allow-not-file-all
     memory for why a block-scoped allow is the correct tool here. -->
26. DB-backed data lists: DONE (archived `2026-08-03-add-db-data-lists`; design
    at `docs/superpowers/specs/2026-08-02-db-data-lists-design.md`; see the
    "Database-backed data lists" and "Two-role admin area" entries under
    `docs/current-state.md`). Raised
    2026-08-02 while working through what a data source actually is today.
    `"static"` is the only type that ships, and its option list lives in
    `config.options` inside the immutable, hashed body — so changing one value
    costs a published version plus a migration for every running instance.
    Four needs converged on one mechanism: business staff editing lists during
    operation, several processes sharing a list, an external system feeding the
    values, and a list holding more entries than belong in a body.
    Adds a second data source type, `"db.list"`, whose values live in two
    engine-owned tables (`data_lists`, `data_list_values`) instead of the body.
    This is the type stage 5e's sibling design (`2026-07-24-data-source-
    resolution-design.md`) deferred, and the one `CLAUDE.md`'s "Decided, not yet
    built" list still records as open: a DB-backed type answers the deferred
    timeout/cache/error questions far more cheaply than an HTTP-backed one —
    same connection pool, no network, one indexed `SELECT` — which is why it
    lands first. Stage 25b defers the same speculative semantics for the
    assignment registry and stays unaffected.
    Four decisions carry the change. The declaration stays in the body
    (`config: {listKey}`) and only the values move, so a body remains
    self-contained for promotion export, version diff and `definitionHash`.
    `list_key` is flat with no scope column: the body already records which
    process uses which list, so the admin screen derives usage from
    `definitions` rather than a second, contradictable notion of ownership —
    "global vs. process-specific" is the answer to a query, not a column.
    `DataSourceContext` gains `heldValues: string[]` and the query adds `OR
    value = ANY(...)`, so a value an operator retires stays visible to exactly
    the instances holding it; because `optionValuesValid` already reads resolved
    options, that one mechanism fixes rendering and validation together and
    changes no validation code. And `PUT /admin/data-lists/:listKey/values`
    replaces a whole set while deactivating what it omits, so no API path ever
    deletes a value row and no running instance can lose the label of a value it
    holds. Publishing deliberately does not read the tables — an existence check
    would make the same body valid or invalid by table contents and break
    "an identical re-publish is a no-op" — so the mistyped key is prevented in
    the studio instead, by a `listKey` picker plus a warning, never an error.
    Six admin routes behind a new narrow role, `system:datalists`, plus two
    admin screens; read access also accepts `system:developer` so the studio
    picker needs no second route. Nothing in `definition.ts` changes.
    Seven capabilities: `db-data-source-type` and `data-list-administration` are
    new; `data-source-resolution`, `authorization`, `persistence`, `admin-app`
    and `studio-app` gain deltas. The task list was cut so the engine-side read
    path landed and stayed green before the routes and screens, which are the
    larger half of the work.
    Three decisions the proposal left open were settled while building it.
    `createDefaultDataSourceRegistry` takes the database handle and the handler
    closes over it, rather than every other type ignoring a handle on
    `DataSourceContext`. `MAX_DATA_LIST_VALUES` is 500 and counts the ACTIVE
    values, with the `LIMIT` leaving room for the held rows on top — counting
    rows would break the very instances the retirement rule protects, since 500
    offered values plus one retired value a holder names is 501 rows; the
    handler throws above the bound rather than resolving a short list, because a
    truncated list rejects a value a participant legitimately holds. And the
    shell's area table now carries a SET of roles per area, since the data list
    screens live in the admin area while their maintainers must not hold
    `system:admin`: area entry became the weaker gate, each screen keeps its own
    check, and `requireRole` on every `/admin/*` route stays the enforcement.
    Deliberately out of scope, each with its reason in the design: search and
    typeahead (a list too large for a dropdown needs its own route, field type
    and renderer), caching across calls, a change history beyond
    `updated_at`/`updated_by`, a separate import endpoint (a sync job writes
    through the values route — it is the same operation), and CEL-readable data
    sources, which stay a publish error exactly as before.
<!-- antislop: allow sentence-length run-ons passive-voice em-dash. This
     entry matches the dense technical-prose convention every other entry
     in this file already uses; see the antislop-targeted-allow-not-file-all
     memory for why a block-scoped allow is the correct tool here. -->
27. No-code / low-code process authoring: NOT STARTED, no OpenSpec change yet.
    Raised 2026-08-03 as the product direction the README and `CLAUDE.md` now
    state: a business analyst builds a process in the studio area without
    writing JSON or CEL. This is a stage, not a rewrite. The studio area already
    covers the structural half — canvas, steps, paths, fields, views, the
    Player, publish, versions — and every gap below is an authoring surface,
    never a contract change.
    **The two words name two different things, on purpose.** No-code is the
    target for the subset the builders cover: an author completes a whole
    process through forms and a canvas, never typing CEL or JSON, and never
    seeing either. Low-code is what stays underneath, permanently: the JSON
    view, the CEL text input and hand-authored bodies remain first-class, for a
    developer and for every case a builder cannot express. The two are one
    product, not two editions, and an author moves between them per field. That
    is also why "no-code" here is never a promise that a process needs no
    developer — it is a promise about one authoring path through one product.
    **The rule that governs the whole stage.** An authoring surface PRODUCES the
    serialized JSON definition; it never becomes a second language beside it.
    Nothing here enters `src/schema/definition.ts`, so `definitionHash`,
    version immutability and migration stay untouched, and a hand-authored body
    stays first-class. The JSON view is the escape hatch and stays reachable
    from every screen a builder covers.
    Four gaps, measured against the code rather than guessed, ordered cheapest
    and most valuable first:
    a. A plugin config form. `panels/shared/PluginEnvelopeEditor.tsx` edits
       every `{ type, config }` position — actions, data sources, assignment
       strategies, a custom field type — as a free-text `type` input beside a
       raw JSON textarea. An author must know both the type string and the
       config shape, and a typo surfaces at publish. The registry already holds
       what a form needs: `HandlerDef.configSchema` (and its data-source and
       assignment siblings) declares the shape the publish-time check already
       parses against. `GET /registry` (`src/http/studio-routes.ts`) returns
       only the three type-name arrays, so the change widens that route and
       owns one decision: `configSchema` is a Zod schema (`z.ZodTypeAny`), so
       either the server serializes it to JSON Schema or each entry ships a
       hand-written descriptor beside it. Everything downstream — a type
       picker, a generated form, inline per-field errors — follows from that
       one answer.
    b. A condition builder over CEL. `panels/shared/ExpressionInput.tsx` is one
       text input writing `{ lang: "cel", src }`; publish type-checks it and
       the Tools scratchpad checks it ahead of time, but the author writes CEL
       by hand. A builder reads the field catalog and emits CEL text. The hard
       part is not emitting it but reading it back: a guard someone typed by
       hand, or emitted by an older builder, must still open in the builder, or
       the two surfaces silently diverge. Parsing CEL back into a builder model
       is the honest option, since the library already parses. A sidecar
       recording "how this guard was built" is the tempting one and must be
       weighed carefully: it cannot live in `ProcessBody` (that changes the
       hash), and beside the draft it dies at publish, which leaves a published
       version uneditable in the builder. This is the largest of the four and
       deserves its own design.
    c. Migration-plan authoring without JSON. Stage 11 shipped a `MigrationSpec`
       textarea on purpose — no field-by-field form existed to extend and the
       server owns validation. A field-mapping UI over the two versions'
       catalogs is the same shape of work as (a), and both versions are already
       fetchable.
    d. Process templates. Nothing seeds a new process today; an author starts
       from an empty draft. A template is a stored draft body, so this needs no
       engine concept — only a decision about where templates live and who
       curates them.
    One open question the stage must answer before (a) ships, not after: the
    studio area sits behind one coarse role. `system:developer` reaches drafts,
    the registry, migration planning and the Player alike, and publishing needs
    `system:publish` on top. A business analyst authoring a process is exactly
    the actor that role was not shaped for. Either the analyst gets
    `system:developer` (and with it migration planning), or the area splits its
    gate the way stage 26 split the admin area's — a set of roles per area,
    each screen keeping its own check.
    Deliberately out of scope: a natural-language or AI-assisted authoring
    surface (it produces the same JSON, so it is a later surface over the same
    contract, not a reason to reshape one), executable code authored in the
    browser (actions stay declarative handler references, per the contract),
    and relaxing any v1 boundary — no parallelism arrives because a canvas
    could draw it.
