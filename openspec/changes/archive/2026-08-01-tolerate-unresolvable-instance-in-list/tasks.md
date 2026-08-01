## 1. Engine: error type and degraded summary shape

- [x] 1.1 In `src/runtime/api.ts`, add a `StepNotInBodyError` class local to
      the module. Throw it at line 195 in `toSummary`, replacing the bare
      `new Error(...)`.
- [x] 1.2 In `src/runtime/api.ts`, add and export a `DegradedInstanceSummary`
      type: `instanceId`, `processId`, `version`, `status`, `currentStepId`,
      `transitionSeq`, `startedBy`, `createdAt`, a `degraded: true`
      discriminant, and `reason: "missing-definition" |
      "current-step-not-in-body"`.
- [x] 1.3 Export `InstanceSummaryItem = InstanceSummary |
      DegradedInstanceSummary`.
- [x] 1.4 Add `includeDegraded?: boolean` to `InstanceListFilter`
      (`src/runtime/api.ts:149-157`).

## 2. Engine: listInstances gates degrade-vs-omit on includeDegraded

- [x] 2.1 In `listInstances` (`src/runtime/api.ts:779-828`), wrap each
      `toSummary` call. On `NotFoundError` or `StepNotInBodyError`: if
      `filter.includeDegraded` is true, produce a degraded item with the
      matching `reason`; otherwise omit the row from `items` entirely. Let
      any other exception rethrow regardless of `includeDegraded`.
- [x] 2.2 Change `listInstances`'s return type from
      `Promise<Page<InstanceSummary>>` to `Promise<Page<InstanceSummaryItem>>`.

## 3. HTTP: wire scope to includeDegraded

- [x] 3.1 In `handleListInstances` (`src/http/routes.ts:297`), set
      `filter.includeDegraded = scope === "all"`. This is the existing
      boolean that already gates `requireRole(actor, ADMIN_ROLE)` at line
      308, not a new check.

## 4. Tests

- [x] 4.1 Test: an admin-scoped (`includeDegraded: true`) call against an
      instance whose pinned `(processId, version)` has no published body
      degrades that item with `reason: "missing-definition"`. The page
      still returns, and every other instance in it resolves normally.
- [x] 4.2 Test: an admin-scoped call against an instance whose
      `currentStepId` is absent from its pinned body's steps degrades that
      item with `reason: "current-step-not-in-body"`.
- [x] 4.3 Test: the same missing-definition instance, called without
      `includeDegraded` (or with it false), is silently omitted from
      `items`. No degraded item appears, and no error is thrown.
- [x] 4.4 Test: an unrelated exception inside `store.resolveBody` (something
      other than the two known causes) still fails the whole
      `listInstances` call, regardless of `includeDegraded`. This is the
      narrow-catch decision from `design.md`, not a blanket one.
- [x] 4.5 Test: a degraded item carries `instanceId`, `processId`,
      `version`, `status`, `currentStepId`, `transitionSeq`, `startedBy`,
      and `createdAt`. It carries no `processLabel`, `stepLabel`, or
      `processBaseLocale`.
- [x] 4.6 HTTP-level test: `GET /instances?scope=mine` against an inbox
      containing an unresolvable instance returns 200 with that instance
      absent from the page, never a degraded item.
- [x] 4.7 HTTP-level test: `GET /instances` (default scope, i.e. `all`) as
      `system:admin` against the same data returns 200 with a degraded item
      for that instance.

## 5. Admin UI

- [x] 5.1 In `packages/web/src/areas/admin/api/types.ts`, widen the
      instance-list item type to match the engine's `InstanceSummaryItem`
      union.
- [x] 5.2 In `packages/web/src/areas/admin/screens/InstancesScreen.tsx`,
      render a degraded row: instance id, process id, version, and reason.
      Follow the outbox screen's existing dead-letter-row pattern instead
      of inventing a new visual treatment.
- [x] 5.3 Confirm `packages/web/src/areas/app` needs no code change: it
      calls `scope=mine`, which never receives a degraded item, so its
      `InstanceSummary` type and `inboxLogic.ts` stay as they are.

## 6. Documentation

- [x] 6.1 Change `docs/openapi.yaml`'s `InstanceSummaryPage`/`InstanceSummary`
      schema for `GET /instances` to document the degraded-item shape,
      keeping it accurate per `http-api-documentation`'s existing
      "each route documents auth, schema, and errors" requirement.

## 7. Verification

- [x] 7.1 Run `bun run typecheck`.
- [x] 7.2 Run the full `bun test` suite with `DATABASE_URL` set. Read the
      skip count, not just the pass count, to confirm the DB-backed suites
      ran.
