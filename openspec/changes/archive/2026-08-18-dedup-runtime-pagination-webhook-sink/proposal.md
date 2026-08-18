## Why

An over-engineering audit found four small defects in the runtime handlers
and the devcontainer config. The file `src/runtime/api.ts` repeats two bits
of pagination logic instead of sharing them. One memoization layer caches
nothing worth caching. The file `src/auth/login.ts` runs a brute-force
eviction loop. A JS `Map`'s insertion order already tracks earliest-window
order for free, if the re-arm path stays in sync. The devcontainer's
webhook sink builds a whole second container image to serve a 35-line echo
script.

A fifth candidate drops out of scope: removing `runtime-api`'s
`patternCache`. An existing `runtime-api` requirement already mandates
that cache: the compiled pattern must persist per published body.
Removing it would break a live spec, not clean up dead code. This change
makes no such change. See design.md.

None of the four findings changes behavior. Each one removes code that
duplicates work the runtime already does another way. One fixes an
eviction helper so it keeps doing what it already promised. Together they
form one grouped cleanup: about 140 lines removed, and one fewer container
image built per devcontainer start.

## What Changes

<!-- antislop: allow synonym-rotation -->
This list uses "update" for editing a file. It uses "change" elsewhere for
the OpenSpec change itself. Those are two different concepts sharing a
word family, not a rotation to fix.

- **`src/auth/login.ts`**: replace `checkAndRecordAttempt`'s 12-line
  minimum-`windowStart` scan with one guarded call,
  `if (map.size >= capacity) map.delete(map.keys().next().value)`. Make
  the expired-entry re-arm path remove the key before it re-inserts. The
  guard matters: it skips eviction when the sweep already freed enough
  room. The re-arm fix matters too: it stops a re-armed entry from keeping
  its old map position. Eviction behavior stays identical to today's scan.
  See design.md for the ordering scenario and the capacity-guard
  reasoning, and tasks.md for the new test both need.
- **`src/runtime/api.ts`**: extract one paged-read helper (table, columns,
  row-mapper) that `listComments` and `listAttachments` both call. The
  helper replaces the cursor-decode, `LIMIT limit+1`, and
  hasMore-slice-encode logic the two functions duplicate today. That
  includes the `created_at::text` lossless-cursor column each selects.
  `listComments` carries the inline comment explaining that fix.
  `listAttachments`'s own doc comment references it rather than repeating
  it.
- **`src/runtime/api.ts`**: extract a `keysetPage(rows, limit, cursorOf)`
  helper for the hasMore/slice/last-row/encodeCursor tail. That tail
  currently stands in four near-identical copies, in `listInstances`,
  `getInstanceRecord`, `listComments`, and `listAttachments`. The helper
  takes raw rows and a row-to-cursor-tuple mapper. It returns the sliced
  page rows, `hasMore`, and the encoded cursor. It does not map rows to
  items. Each call site maps `pageRows` itself, including `listInstances`'s
  async, filtering `Promise.all` mapping, before or after the helper call.
- **`src/runtime/api.ts`**: remove `resolveDataSourceOptions`'s per-call
  `Map` cache. It rebuilds on every `resolveFields` call, so it dedupes
  nothing beyond one step's single resolution. The call site calls the
  handler directly. This change does not touch `patternCache`; see Why.
- **`.devcontainer/docker-compose.yml`**: remove the `webhook-sink` service.
  That drops its own `build:` block, its volumes, its healthcheck, and its
  `depends_on` entry on `app`. Run `scripts/dev-webhook-sink.ts` inside the
  existing `app` container instead. Point `HTTP_ACTION_ALLOWED_HOSTS` at
  `localhost:8080` (the script's own `PORT` constant, unchanged) in place
  of `webhook-sink:8080`.
- **`examples/expense-approval.json`**: update the `book` and
  `escalated_review` steps' `http.request` action targets to the new
  `localhost:8080` host. The shipped example keeps reaching a target that
  answers.
- **`examples/purchase-requisition.json`**: update the `issue_po` step's
  two `http.request` targets to the same new `localhost:8080` host. One
  target is its `onEntry` action posting the order; the other is its
  `onCancel` action posting the cancellation. This example names
  `webhook-sink:8080` too. An earlier pass of this proposal missed it; see
  design.md.
- **BREAKING**: a contributor's gitignored `docker-compose.override.yml`
  may have published a port for the old `webhook-sink` service. That
  override now names a removed service. It needs to target `app` instead.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `development-toolchain`: "The devcontainer runs a webhook sink" changes
  from a dedicated compose service to a script run inside the `app`
  container. "The devcontainer permits the shipped example's HTTP target"
  changes the allowed-hosts entry from `webhook-sink:8080` to the new
  `localhost` target.

## Impact

- Affected code: `src/auth/login.ts` (`checkAndRecordAttempt`).
  `src/runtime/api.ts` (`listComments`, `listAttachments`, `listInstances`,
  `getInstanceRecord`, `resolveDataSourceOptions`). `.devcontainer/docker-
  compose.yml`. `examples/expense-approval.json`.
  `examples/purchase-requisition.json`. `checkConstraints`'s pattern
  compilation (`patternCache`) is explicitly out of scope; see Why.
  `src/engine/admin-queries.ts`'s `listOutbox` and `listPendingTimers`
  duplicate the same pagination tail `keysetPage` targets but stay out of
  scope too; see design.md.
- Affected tests: `test/auth-login.test.ts` gets the new re-arm-then-evict
  ordering case (tasks.md's 1.3). The file `test/data-source-resolution.test.ts`
  gets two assertion changes and two comment rewrites for the dropped
  memoization (tasks.md's 4.3 and 4.4). The file `test/view-layout-hash.test.ts`
  gets a recomputed `PRE_CHANGE_HASHES` entry for `expense-approval.json` once
  its `http.request` targets change (tasks.md's 6.5).
- Affected docs: `README.md`, `docs/current-state.md`, and
  `docs/authoring-guide.md` each name `webhook-sink` and get updated to match
  the in-container sink (tasks.md's 7.1).
- No API surface or schema changes. Pagination responses (cursor shape,
  ordering, page size) stay the same. Rate-limit eviction semantics stay
  the same too.
- Data source resolution *results* stay the same. Finding 4's removed
  cache is the one exception to "no externally observable behavior
  change." It can double the number of `handler.resolve` calls a data
  source's plugin handler sees. That happens when two fields on the same
  step share a data source with matching held values.
- The resolved values are identical either way. A plugin handler backed
  by real I/O is different: a rate limited or paid external API. That
  handler now sees the call twice instead of once. See design.md's
  Risks/Trade-offs section.
- Devcontainer: one fewer image built and one fewer container started per
  `devcontainer up`. A contributor with a local port override for the old
  `webhook-sink` service needs to repoint it at `app`.
