<!-- antislop: allow-file passive-voice -->
<!-- This tasks file is new (no prior committed version), so the ratchet reads every finding as a rise; its passive "is refused"/"is created" task-verification phrasing matches this repo's established tasks.md style, which is not being rewritten here. -->

## 1. Storage: `draft_snapshots` and `Instance.kind`

- [x] 1.1 Add `kind text NOT NULL DEFAULT 'published'` to the `instances`
      table via `ALTER TABLE instances ADD COLUMN IF NOT EXISTS kind text
      NOT NULL DEFAULT 'published'` in `src/engine/store.ts`, following the
      same idempotent-add pattern as `resolve_state`/`cancel_sweep_state`
      (`store.ts:194-272`), and verify `bun run typecheck` + a fresh
      `bun test` DB setup creates the column with no error and every
      pre-existing row reads back `kind = 'published'`.
- [x] 1.2 Add the `draft_snapshots` table via `CREATE TABLE IF NOT EXISTS
      draft_snapshots (process_id text, version integer` negative sentinel,
      `definition_hash text`, `body jsonb`, `created_at timestamptz,
      PRIMARY KEY (process_id, version))` to the schema migration, matching
      task 1.1's idempotency wording, and verify `bun run typecheck` + a
      fresh `bun test` DB setup creates it with no error.
- [x] 1.3 Add `kind: z.enum(["published", "test"]).default("published")` to
      the `Instance` schema in `src/schema/definition.ts`, matching the SQL
      column's own `NOT NULL DEFAULT` from task 1.1, and verify a parsed
      `Instance` literal omitting `kind` reads back as `"published"`.
- [x] 1.4 Add a helper to compute the next negative sentinel version for a
      `processId` against `draft_snapshots` and verify a unit test creates
      two sentinels for the same process and gets two distinct, non-colliding
      negative values.
- [x] 1.5 Add a concurrency test for the same helper: two simultaneous "play"
      instance creations for the same `processId` must not collide on the
      sentinel version value (via a unique constraint or advisory lock,
      whichever the design implies for `draft_snapshots`'s primary key), and
      verify a `bun:test` case asserts no duplicate/conflicting version is
      produced under concurrent creation.
- [x] 1.6 Add `kind` to `InstanceView` (`src/runtime/api.ts`) and populate it
      in `getInstanceView`'s construction, and verify a `bun:test` case
      asserts the returned `kind` for both a `"published"` and a `"test"`
      instance.
- [x] 1.7 Add `kind?: "published" | "test"` to `createInstance`'s `opts` type
      in `src/engine/store.ts`, include it in the INSERT's column list
      (defaulting to the SQL column's own `DEFAULT 'published'` when
      omitted), and include it in the seed object passed to
      `instanceSchema.parse`. Add the same optional `kind` field to
      `createSeededInstance`'s opts in `src/engine/seeded-create.ts`,
      threaded into its own `createInstance` call. Verify a `bun:test` case:
      creating an instance with `kind: "test"` persists and reads back
      `kind === "test"`, and omitting `kind` still defaults to `"published"`.

## 2. `resolveBody` fallback

- [x] 2.1 Change `resolveBody(processId, version)` in
      `src/engine/definitions.ts` so `version < 0` resolves from
      `draft_snapshots` instead of `definitions`, and verify a unit test:
      resolving a persisted `draft_snapshots` row returns its frozen body.
- [x] 2.2 Verify a unit test: resolving a real, positive `(processId,
      version)` behaves identically to before this change (regression case
      from the `definition-store` delta spec).
- [x] 2.3 Verify a unit test: the two identifier spaces never resolve to each
      other's body, per the `definition-store` delta's "never resolve to
      each other's body" scenario.

## 3. Test-instance creation

- [x] 3.1 Add a draft-instance creation path to `createProcessInstance`
      (`src/runtime/api.ts`) that reads the current draft body via
      `getDraft` (`src/engine/drafts.ts`), computes the next sentinel,
      inserts the frozen body + `definitionHash` into `draft_snapshots`, and
      stamps `kind: "test"` on the created instance's stub by passing
      `kind: "test"` through to `createInstance` via task 1.7's new `opts`
      field, and verify a `bun:test` case creates a test instance for a
      process with a draft and no published version and asserts
      `kind === "test"`.
- [x] 3.2 Verify a `bun:test` case: the created test instance's
      `definitionHash` matches the real JCS hash of the frozen draft body
      (same computation the published path already uses).
- [x] 3.3 Verify a `bun:test` case: editing the draft after a test instance
      is created does not change the already-created instance's resolved
      body (the frozen-snapshot guarantee).
- [x] 3.4 Verify a `bun:test` case: an unresolvable draft (e.g.
      `workflow.initialStep` naming a step id absent from the draft) fails
      creation with a diagnostic, typed error — not an unhandled crash.
- [x] 3.5 Verify a `bun:test` case: a test instance reaching a `subprocess`
      step whose child has no resolvable published version fails in a
      controlled way, per the "subprocess step always fails gracefully for a
      test instance" requirement's unresolvable-child scenario, rather than
      crashing or spawning a real child.
- [x] 3.6 Add a `kind === "test"` gate to the spawn handler in
      `src/engine/subprocess.ts`, checked before `resolveLatestByContract` is
      called, so a test instance reaching a `subprocess` step fails in the
      same controlled way even when the referenced child process HAS a
      resolvable published version, and verify a `bun:test` case: a test
      instance's subprocess step, with a child process that DOES have a
      published version, fails gracefully with a diagnostic and creates no
      child instance, per the requirement's resolvable-child scenario.
- [x] 3.7 Change `src/handlers/process-start.ts` so the instance it starts is
      created with `kind: acting.kind` instead of defaulting to
      `kind: "published"`, passed through `processStartHandler`'s
      `createSeededInstance` call via task 1.7's new `opts` field, and
      verify two `bun:test` cases: a `process.start` action dispatched from a
      `kind: "test"` acting instance starts a new instance with
      `kind: "test"`, and one dispatched from a `kind: "published"` acting
      instance starts a new instance with `kind: "published"` (regression,
      matching today's behavior). `src/engine/subprocess.ts`'s spawn handler
      (task 3.6) never needs this plumbing itself, since task 3.6 already
      blocks it from reaching `createSeededInstance` for a test instance.

## 4. Route and authorization

- [x] 4.1 Add `POST /drafts/:processId/instances` to
      `src/http/studio-routes.ts`, gated by the same `requireAuthoring` check
      as the other `/drafts/*` routes, calling the new draft-instance
      creation path, and verify an integration test: an actor holding
      `AUTHOR_ROLE` or `DEVELOPER_ROLE` succeeds.
- [x] 4.2 Verify an integration test: an actor with neither role is refused
      with a 403/`AuthorizationError`, before any draft lookup or instance
      creation runs.
- [x] 4.3 Verify an integration test: a process with no draft at all returns
      the existing `notFound()` shape, matching `handleGetDraft`'s pattern —
      no new error type introduced.

## 5. Visibility: list and direct access

- [x] 5.1 Change `buildInstanceWhere` (`src/runtime/api.ts:1329`) to exclude
      `kind: "test"` by default (`kind <> 'test' OR
      filter.includeTestInstances`), add `includeTestInstances` only to
      `InstanceListFilter`, and have `listInstances` set it true only for
      administrative scope (`scope: "all"`), leaving it unset for every
      participant-facing scope; `InstanceQueryFilter` (the type
      `queryInstances` accepts) gains no such field, so every
      `queryInstances` caller stays excluded unconditionally. Verify a
      `bun:test` case: `scope: "mine"` excludes a test instance the calling
      actor is claimant/candidate/`startedBy` on.
- [x] 5.2 Verify a `bun:test` case: administrative scope (`scope: "all"`)
      includes a test instance like any other.
- [x] 5.3 Add the `kind` check to `loadInstanceForActor` (a non-administrative
      actor addressing a test instance directly by id is authorized only as
      that instance's own `startedBy`; a claim or candidacy alone, sufficient
      for an ordinary instance, is not sufficient for a test instance; the
      refusal is the same `AuthorizationError` shape as a nonexistent
      instance), and verify a `bun:test` case: a claimant who is not the
      test instance's `startedBy` is refused direct access via
      `getInstanceView`.
- [x] 5.4 Verify a `bun:test` case: a test instance's own `startedBy` actor
      retains access via `getInstanceView`, and an administrative actor's
      direct access to a test instance is unaffected.
- [x] 5.5 Verify a `bun:test` case: `postComment` and `listComments` apply
      the same `startedBy`-only narrowing for a non-administrative,
      non-starter claimant on a test instance.
- [x] 5.6 Verify a `bun:test` case: `uploadAttachment`, `listAttachments`,
      and `getAttachment` apply the same `startedBy`-only narrowing for a
      non-administrative, non-starter claimant on a test instance.
- [x] 5.7 Verify a `bun:test` case: the `instance.query` CEL data source
      (`src/engine/instance-query-source.ts:130`, via `queryInstances`)
      never resolves a test-kind instance as a field option, even when its
      status/step/data comparisons would otherwise match it — no code
      change is needed here beyond task 5.1's `buildInstanceWhere` default,
      since `InstanceQueryFilter` carries no `includeTestInstances` opt-in.
- [x] 5.8 Verify a `bun:test` case: `runReportQuery`
      (`src/runtime/api.ts:1918`, backing `executeReport`,
      `previewReportDraft`, and the instance-data-tables preview) never
      returns a row for a test-kind instance, even when the report's
      `query` filters would otherwise match it — same "no code change
      needed beyond task 5.1" reasoning as 5.7.

## 6. Reporting exclusion

- [x] 6.1 Add a `kind`-based exclusion to `selectInRange`/`scan()`
      (`src/engine/reporting.ts`), the shared query `cycleTime`, `bottleneck`'s
      ranking, and `sla` all read through, and verify a `bun:test` case: a
      process's reported cycle-time percentiles, bottleneck ranking, and SLA
      breach rate are identical with and without a test instance present.
- [x] 6.2 Add the same `kind`-based exclusion to `bottleneck`'s separate,
      standalone work-in-progress query (the one that does NOT go through
      `selectInRange` — grep `src/engine/reporting.ts` for the raw
      `body->>'status' = 'running'` count query), and verify a `bun:test`
      case: a test instance parked mid-step contributes nothing to that
      step's reported work-in-progress count.

## 7. Admin UI

- [x] 7.1 Before implementing, invoke `/frontend-design:frontend-design` for
      visual direction on the badge and filter control (plus the installed
      Vercel skills per CLAUDE.md), per CLAUDE.md's rule that UI work in
      `packages/web` goes through the design skills first. Add a `kind`
      badge to the admin instances-list screen
      (`packages/web/src/areas/admin`), reusing the existing
      `admin-badge-${status}` pattern, shown by default (not hidden), and
      add a filter dimension for test/ordinary instances alongside the
      existing five filters, following `instancesLogic.ts`'s existing
      pure-module pattern with its own `bun:test` coverage per
      `packages/web/src/areas/app/screens/inboxLogic.ts`'s convention.
- [x] 7.2 Verify with a real browser (per CLAUDE.md's UI-change rule): open
      the admin instances list with both an ordinary and a test instance
      present, confirm the test instance is visually identifiable and the
      filter dimension works; record the check in `docs/browser-checks.md`.

## 8. Studio Player UI

- [x] 8.1 Before implementing, invoke `/frontend-design:frontend-design` for
      visual direction on the new action and marker (plus the installed
      Vercel skills per CLAUDE.md), per CLAUDE.md's rule that UI work in
      `packages/web` goes through the design skills first. Add a "Create
      test instance" action to
      `packages/web/src/areas/studio/screens/PlayerScreen.tsx`, calling the
      new route, alongside the existing "Create new instance" action, and
      verify a `bun:test`/component test: choosing it for a process with a
      draft and no published version creates and renders a running instance.
- [x] 8.2 Add a visible test-instance marker to the Player's instance view
      (created via the new action, or opened by id) and verify a
      `bun:test`/component test: an ordinary instance shows no marker, a
      test instance does.
- [x] 8.3 Verify a `bun:test`/component test: the existing "Create new
      instance" action against a published version is unaffected and still
      creates a non-test instance.
- [x] 8.4 Verify with a real browser (per CLAUDE.md's UI-change rule): play
      a process with only a draft (no published version) end-to-end through
      "Create test instance" — submit at least one step and confirm the
      Player renders the next step correctly.

## 9. Verification

- [x] 9.1 Run `bun run typecheck` and confirm zero errors.
- [x] 9.2 Run `bun run build` and confirm it succeeds.
- [x] 9.3 Run the FULL `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes with no silent skips
      (check the skip count, per CLAUDE.md's `silent-green.sh` gate).
