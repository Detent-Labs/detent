## 1. `src/auth/login.ts`: simplify eviction

- [x] 1.1 Replace `checkAndRecordAttempt`'s minimum-`windowStart` while loop
      (the block after the expired-entry sweep) with a single **guarded**
      delete: `if (map.size >= capacity) map.delete(map.keys().next().value);`.
      The guard is required, not optional — do not drop it for an
      unconditional `map.delete(map.keys().next().value)`. The preceding
      sweep can free enough room on its own; an unconditional delete would
      then evict a live, unexpired entry anyway, violating
      `local-user-accounts`'s "Expired entries are reclaimed before capacity
      is judged" scenario, which requires the new email be "tracked
      normally" with no further eviction once the sweep frees space. See
      design.md's "The capacity guard" section.
- [x] 1.2 Make the expired-entry re-arm path remove `key` before it
      re-sets it. That path is the `map.set(key, { count: 1, windowStart: t
      })` call that runs when `entry` is truthy but its window has
      expired: `map.delete(key)` then `map.set(...)`, or an unconditional
      `map.delete(key)` ahead of the single shared `map.set` call. Without
      this, `map.set` on an already-present key updates its value without
      moving it in iteration order. A re-armed entry then keeps its old,
      early position while carrying the newest `windowStart` in the map.
      See design.md's concrete `A`/`B` scenario. Task 1.1's rewrite is
      correct only with this change included.
- [x] 1.3 Add a test for the ordering design.md describes, in design.md's
      own step order: insert key `A` (`windowStart = t0`), insert key `B`
      while `A` is still live (`windowStart = t1`, later than `t0`), let
      `A`'s window expire, then re-arm `A` via a request that lands after
      the expiry (`windowStart = t2`, the newest in the map). Then fill the
      map to capacity and force an eviction via a new key `C`. Assert `B`
      (the true oldest window) is evicted, not `A`. This scenario has no
      existing coverage.
- [x] 1.4 Confirm the existing `local-user-accounts` eviction tests still
      pass unmodified — they assert eviction order, not mechanism, so no
      existing test file should need editing beyond the new test added in
      1.3.

## 2. `src/runtime/api.ts`: keyset-pagination tail helper (finding 3)

- [x] 2.1 Add a `keysetPage<Row>(rows: Row[], limit: number, cursorOf:
      (row: Row) => string[]): { pageRows: Row[]; hasMore: boolean; cursor:
      string | undefined }` helper (or an equivalent signature) near
      `encodeCursor`/`decodeCursor`'s existing import. `cursorOf` returns
      `string[]` because `src/pagination.ts`'s `encodeCursor(parts:
      string[])` accepts nothing looser. The helper takes only
      raw rows and a row-to-cursor-tuple mapper — it does not take a
      row-to-item mapper and does not produce `items`. Each call site maps
      `pageRows` to its own item shape itself, since the four mappings are
      not uniform: `listInstances`'s is `async` (a `Promise.all`) and filters
      out `undefined` results, which a single `toItem: (row) => Item`
      parameter cannot express without forcing every caller through
      `await` or growing a second parameter. See design.md.
- [x] 2.2 Replace `listInstances`' hasMore/slice/last/`encodeCursor` block
      with a call to the helper over the raw overfetched `rows`, taking its
      `pageRows`/`hasMore`/`cursor` return. Apply the existing
      `toSummaryItem` mapping (the `async` `Promise.all`, filtering
      `undefined` results) to the helper's returned `pageRows` to build
      `items`. Assemble `{ items, cursor }` from the two results.
- [x] 2.3 Replace `getInstanceRecord`'s hasMore/slice/last/`encodeCursor`
      block with a call to the helper over the raw rows, taking its
      `pageRows`/`hasMore`/`cursor` return. Apply the existing
      transition/event payload mapping to the helper's returned `pageRows`
      to build `items`.

## 3. `src/runtime/api.ts`: paged-read helper for comments/attachments (finding 2)

- [x] 3.1 Add a paged-read helper taking a table name, a column list (with
      the `created_at::text AS created_at_cursor` lossless-cursor column
      always included), the `instanceId` filter, the page `limit`, and the
      incoming cursor. It decodes the cursor, runs the `LIMIT limit + 1`
      query, and returns the overfetched rows; it does not take a
      row-to-item mapper and does not produce `items`. Preserve the
      existing comment explaining why `created_at::text` is needed over
      the driver's `Date` conversion.
- [x] 3.2 Rewrite `listComments` to call the finding-2 helper for its query
      and the finding-3 `keysetPage` helper for its tail.
- [x] 3.3 Rewrite `listAttachments` to call the same two helpers, keeping
      its column list (`filename, content_type, size_bytes`, no `data`) and
      its existing doc comment noting it never selects `data`.
- [x] 3.4 Confirm the existing `runtime-api` pagination tests for
      `listComments`/`listAttachments` (cursor round-trip, `hasMore`, sort
      order) still pass unmodified.

## 4. `src/runtime/api.ts`: drop `resolveDataSourceOptions`'s memoization

`patternCache` is out of scope for this task and stays untouched.
`runtime-api` carries an existing requirement, quoted here verbatim:

<!-- antislop: allow passive-voice -->
> A pattern constraint is tested only after the length constraints pass,
> against a cached expression.

That requirement mandates caching a compiled pattern per published body.
`src/runtime/api.ts`'s `getStore`, wrapping `src/engine/definitions.ts`'s
`createDefinitionStore`, keeps the same `ProcessBody` object alive across
many submissions. So the cache amortizes a real, repeated cost. See
design.md's Decisions section.

- [x] 4.1 Remove `resolveDataSourceOptions`'s `cache` parameter and its
      `Map` lookup/set; call `handler.resolve(...)` directly. Update
      `resolveFields`'s call site to drop the `dataSourceCache` it currently
      constructs and passes in. Rewrite the function's JSDoc comment (lines
      386-397, currently describing the per-call memoization this task
      removes: "memoized by `DataSourceId` together with the held values
      within one `resolveFields` call, so fields on the same step sharing a
      data source *and* holding the same values resolve it once") so it
      documents the direct `handler.resolve(...)` call instead, with no
      memoization claim left in place.
- [x] 4.2 Confirm the existing data-source-resolution tests that do not
      depend on `resolveDataSourceOptions`'s call count (options resolution,
      held values, submission validation) still pass unmodified, and that no
      test exercises `patternCache`'s removal, since it is not removed.
- [x] 4.3 Update `test/data-source-resolution.test.ts`'s "two fields sharing
      one data source resolve it exactly once per resolveFields call" test
      (lines 110-121): change its assertion from `expect(calls() -
      beforeView).toBe(1)` to `.toBe(2)`, since `field_country` and
      `field_tags` now each trigger their own `handler.resolve` call instead
      of sharing one memoized result. Rename the test to describe the
      no-cache behavior (e.g. "two fields sharing one data source each
      resolve it independently") and rewrite its trailing comment to match.
      Also rewrite the body comment at lines 27-28 ("for the resolve-once
      memoization check") so it no longer describes a memoization guarantee
      this change removes. This test is DB-backed and asserts the exact
      behavior task 4.1 deletes; it goes red unmodified. See design.md's
      "Why `resolveDataSourceOptions`'s cache still goes" section.
- [x] 4.4 Update the same file's "two fields sharing one data source resolve
      once when their held values match" test (lines 187-198): the same
      `expect(calls() - before).toBe(1)` assertion depends on the same
      per-call cache task 4.1 removes, since `field_country: "us"` and
      `field_tags: ["us"]` share one held value and today resolve through
      one memoized call. Change the assertion to `.toBe(2)` and rename/
      re-comment the test the same way as 4.3's. The neighboring "resolve
      twice when differ" test (lines 174-185) already expects 2 and needs
      no change. See design.md's "Why `resolveDataSourceOptions`'s cache
      still goes" section.

## 5. `.devcontainer/docker-compose.yml`: move the sink in-container

**BREAKING**: a contributor's gitignored `docker-compose.override.yml` may
publish a port for the old `webhook-sink` service. This section removes that
service. `docker compose up` then fails, naming the unknown service. Call
this out in the PR description a contributor reads before pulling, alongside
proposal.md's own BREAKING bullet. See design.md's Risks section and
migration step 4.

- [x] 5.1 Remove the `webhook-sink` service block entirely.
- [x] 5.2 Remove `webhook-sink` from the `app` service's `depends_on` list.
- [x] 5.3 Update the `app` service's `command:` (currently `sleep infinity`,
      a plain string) to the exec-form array
      `["sh", "-c", "bun run scripts/dev-webhook-sink.ts & sleep infinity"]`,
      per design.md's Migration Plan. The shell form is required, not
      optional: compose's plain-string `command:` is word-split and execed
      directly against the base image, with no shell in between, so a bare
      `bun run scripts/dev-webhook-sink.ts & sleep infinity` string would
      pass `&` as a literal argument to `bun` instead of backgrounding the
      process — `bun` would then never reach `sleep infinity` and the
      container would hang waiting on the sink script itself. Wrapping the
      two commands in `sh -c "..."` gives `&` its shell meaning: the sink
      starts in the background, then `sleep infinity` runs and keeps the
      container alive across stop/start cycles. Do NOT use
      `devcontainer.json`'s `postCreateCommand` for this —
      it runs once at container creation, not on every start, and
      `devcontainer.json` declares no `postStartCommand`. Only `command:`
      re-runs on every container start, which the sink needs to survive a
      stop/start cycle without a rebuild. See design.md's rejected
      "`postCreateCommand`" alternative.
      In the same edit, add `working_dir: /workspace` to the `app` service.
      `app` declares no `working_dir` today (Docker's unset default is `/`),
      unlike the `webhook-sink` service being removed, which explicitly sets
      `working_dir: /workspace`. Without this addition, the wrapper's
      relative `scripts/dev-webhook-sink.ts` path resolves against `/`,
      where the repository is not mounted, `bun` fails immediately, and the
      failure hides behind the wrapper's backgrounding and `sleep infinity`
      — the container still reports healthy while the sink never listens.
      See design.md's "Webhook sink moves into the `app` container" section.
- [x] 5.4 Update `HTTP_ACTION_ALLOWED_HOSTS` from `webhook-sink:8080` to
      `localhost:8080` — `scripts/dev-webhook-sink.ts`'s `PORT` constant,
      unchanged by this task. Only the host the sink is reachable at
      changes, from the compose service name to `localhost`; the port
      number stays 8080.
- [x] 5.5 Update three now-stale comment blocks in the file: the
      top-of-file comment (currently describing "a webhook sink" as one of
      four services), the `HTTP_ACTION_ALLOWED_HOSTS` inline comment (lines
      37-42, which still says "webhook-sink:8080 is the sink service
      below"), and the `app` service's healthcheck comment ("this container
      runs no service of its own", false once the sink runs inside it).
      Rewrite each to describe the sink as running inside `app`.

## 6. `examples/*.json`: point at the new sink host

- [x] 6.1 Update `expense-approval.json`'s `book` step's `http.request`
      action target from `webhook-sink:8080/...` to the matching `localhost`
      target from task 5.4.
- [x] 6.2 Update `expense-approval.json`'s `escalated_review` step's
      `http.request` action target the same way.
- [x] 6.3 Update `purchase-requisition.json`'s `issue_po` step's two
      `http.request` action targets — the `onEntry` action posting to
      `webhook-sink:8080/hooks/purchase-order` and the `onCancel` action
      posting to `webhook-sink:8080/hooks/purchase-order-cancelled` — to the
      same `localhost` target from task 5.4. This file names `webhook-sink`
      too and was missed in an earlier pass of this task; see design.md.
- [x] 6.4 Reseed the devcontainer database and walk `expense-approval.json`
      end to end (capture through review, approval, and escalation) to
      confirm both actions still reach the sink and both scenarios in the
      `development-toolchain` spec delta hold. In the same walkthrough,
      also drive an instance of `purchase-requisition.json` through
      `issue_po`'s `onEntry` action (posting the order) and its `onCancel`
      action (posting the cancellation), confirming both reach the
      in-container sink. `test/strip-compiled.test.ts` only parses and
      strips `purchase-requisition.json`; it never runs the process or
      calls the `http.request` handler. This manual walkthrough is the only
      check task 6.3's edit gets.
- [x] 6.5 Recompute `test/view-layout-hash.test.ts`'s `PRE_CHANGE_HASHES`
      entry for `expense-approval.json`. Tasks 6.1/6.2 change two of that
      file's `http.request` action URLs, which changes `ProcessBody`
      content and moves `definitionHash` — the same mechanism the file's
      own comment already documents happening to this example for the
      prior `give-the-example-a-reachable-target` change. This test carries
      no `DB`/`DATABASE_URL` skip guard, so it fails unconditionally the
      moment the URLs change. Measure the new value with
      `definitionHash(processBody.parse(bodyOf("expense-approval.json")))`,
      the same method the file's comment describes, run fresh against the
      post-edit body and the current schema. Replace the literal and
      extend the file's explanatory comment to record this change as the
      new provenance for that entry, alongside the existing
      `give-the-example-a-reachable-target` note.

## 7. Documentation

- [x] 7.1 Grep the repo for other references to `webhook-sink` (`docs/`,
      `README.md`, `docker-compose.override.yml.example` if one exists,
      `CLAUDE.md`) and update or remove them. `README.md` names the
      `webhook-sink` service by name outside `docs/` and is easy to miss if
      the grep targets only the `docs/` directory.

## 8. Verification

- [x] 8.1 Run `bun run typecheck` and confirm it passes.
- [x] 8.2 Run `bun run build` and confirm it passes.
- [x] 8.3 Run the FULL `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm no test fails and the DB-backed suites
      are not silently skipped.
- [x] 8.4 Run the antislop linter over every Markdown file this proposal
      touched: its own `proposal.md`/`design.md`/`tasks.md`/spec delta,
      plus any doc task 7.1 touched.
- [x] 8.5 Run `git diff --check` and confirm no trailing whitespace or
      blank-line-at-EOF violations.
- [x] 8.6 Bring the devcontainer up from a clean state
      (`devcontainer up --build` or equivalent) and confirm it builds one
      fewer image than before and that `docker compose ps` no longer lists
      a `webhook-sink` service.
