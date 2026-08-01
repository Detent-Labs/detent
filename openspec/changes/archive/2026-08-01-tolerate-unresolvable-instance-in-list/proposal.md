## Why

`GET /instances` (`listInstances` in `src/runtime/api.ts`, backing
`instance-query`'s "List instance summaries with filters" requirement) fails
its entire request with a generic 500. One unresolvable instance in the page
is enough. The usual cause: the instance's pinned `(processId, version)` no
longer resolves to a published body.

Nothing in the shipped engine deletes a `definitions` row today. There is no
delete-version operation, and `data-retention` clears instance data only,
never `definitions`. So this failure is not an ordinary consequence of using
the product. It comes from manual database edits, a restore that left
`definitions` out of sync, or a future deletion feature.

It reached this project's own database that way. Manual API testing left a
stale instance behind, not any supported operation.

That still leaves a real gap. Nothing in the engine stops one bad row from
reaching the database by accident. Once it does, this endpoint should
survive it.

`toSummary` (`src/runtime/api.ts:191-211`) throws `NotFoundError` at line 193
when `store.resolveBody` returns nothing. It throws a plain `Error` at line
195 when the instance's `currentStepId` is not among that body's steps. Both
throws happen inside `Promise.all(pageRows.map((r) => toSummary(...)))` (line
824), so either one aborts the whole page. Every other instance in the
batch disappears with it, resolvable or not. The caller learns nothing about
which instance failed or why.

<!-- antislop: allow synonym-rotation -->
Manual testing surfaced this directly. One stale instance pointing at a
process id absent from `definitions` took down the admin instance list for
every operator. The frontend showed only "The server hit an error. Try
again."

An audit-focused operator tool should degrade one bad record, not the whole
list.

## What Changes

- `listInstances` no longer lets one instance's summary failure fail the
  whole page. It catches two failures per item: a `NotFoundError` (missing
  published body), and the structural `currentStepId`-not-in-body mismatch.
  Neither propagates out of the page's `Promise.all` anymore.
- The failure is visible only to a caller authorized to see every instance.
  That is `GET /instances` with `scope=all`, which already requires
  `ADMIN_ROLE` at `src/http/routes.ts:308-310`. That caller's page carries a
  minimal degraded marker in place of the failed item: `instanceId`,
  `processId`, `version`, and the failure reason. It omits `processLabel`,
  `stepLabel`, and `processBaseLocale`.
- Any other caller, including `scope=mine` (the participant inbox), never
  sees the failed item at all. `listInstances` omits it from `items`
  silently. The page may come back shorter than `limit`, the same way any
  filtered read can.
- `InstanceListFilter` gains an `includeDegraded` field.
  `handleListInstances` sets it from the existing `scope === "all"` check.
  This reuses an authorization boundary that already exists, instead of
  adding a new one.
- `Page<InstanceSummary>`'s item type changes to
  `Page<InstanceSummary | DegradedInstanceSummary>` for an admin-scoped
  call. Pagination, filtering, and ordering do not otherwise change. A
  degraded instance still counts toward the page's `limit` and still
  advances the cursor. The query and keyset logic that produce `pageRows`
  stay the same.

## Capabilities

### Modified Capabilities
- `instance-query`: "List instance summaries with filters" gains a
  requirement. A caller who sets `includeDegraded: true` gets a degraded
  item for one instance's summary-resolution failure, instead of the whole
  list request failing. A caller who leaves it unset gets the item omitted.
- `http-wrapper`: "List instances over HTTP" gains a rule that ties
  `includeDegraded` to the route's existing `scope=all` / `ADMIN_ROLE`
  check. A `scope=mine` caller never receives a degraded item.

## Impact

- `src/runtime/api.ts`: `toSummary`, `listInstances`, `InstanceListFilter`,
  and the `InstanceSummary` page item type.
- `src/http/routes.ts` / `handleListInstances`: sets the new
  `includeDegraded` filter field from the existing `scope === "all"` check.
  One line, reusing an authorization decision the route already makes.
- `packages/web/src/areas/admin`: the instances list screen must render, or
  at least not crash on, a degraded item.
- `packages/web/src/areas/app` (the participant inbox) needs no change. It
  calls `GET /instances` with `scope=mine` and, under this design, never
  receives a degraded item.
- `docs/openapi.yaml`: `InstanceSummaryPage`'s schema needs the new
  degraded-item shape for `GET /instances`. This keeps it accurate per
  `http-api-documentation`'s existing "each route documents auth, schema,
  and errors" requirement. That requirement itself does not change. So this
  is an implementation task, not a capability delta.
- Test coverage needs three new cases. An admin-scoped call degrades one
  item while the rest of the page stays intact. A `scope=mine` call
  silently omits that same item. An unrelated exception still fails the
  whole request, regardless of scope.
