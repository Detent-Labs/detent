## 1. Widen the shared read

- [x] 1.1 Widen `InstanceQueryFilter.currentStepId` (`src/runtime/api.ts:256`)
  to `StepId | StepId[]`, and compile an array to `= ANY(...)` in the shared
  `buildInstanceWhere`.
  <!-- "parameter type" names buildInstanceWhere's own TS argument type, a different concept from a FieldOption; not a synonym for "option". -->
  <!-- antislop: allow synonym-rotation -->
  Its own parameter type, `InstanceWhereFilter` (`api.ts:1295`), is
  `Omit<InstanceListFilter, "includeDegraded" | "dataWhere">` today. That type
  derives from `InstanceListFilter`, not `InstanceQueryFilter`. So widening
  `InstanceQueryFilter.currentStepId` alone does not type-check at
  `queryInstances`'s `buildInstanceWhere(filter, db)` call. Change
  `InstanceWhereFilter` to `Omit<InstanceListFilter, "includeDegraded" |
  "dataWhere" | "currentStepId"> & { currentStepId?: StepId | StepId[] }`,
  leaving `InstanceListFilter.currentStepId` itself untouched. Verify a
  single id produces the same SQL it produces today, by an existing
  `test/runtime-api.test.ts` case passing unchanged. Verify `bun run
  typecheck` passes with no other call site edited.
- [x] 1.2 Reject an empty `currentStepId` array as a caller error, beside the
  existing membership-list check. Verify a new `test/runtime-api.test.ts` case
  asserts the rejection.
- [x] 1.3 Add a `test/runtime-api.test.ts` case covering a two-step
  `currentStepId` joined with a `status` filter. Assert disjunction across
  the steps and conjunction with the status.
- [x] 1.4 Add an `instanceIds?: InstanceId[]` member to
  `InstanceQueryFilter` (`src/runtime/api.ts:256`) and to `InstanceWhereFilter`
  (the same type edited in 1.1). Both compile in the same shared
  `buildInstanceWhere`. It selects the named instances and joins
  conjunctively with every other filter. Reject an empty list as a caller
  error, as 1.2 does. Verify `test/runtime-api.test.ts` covers selection by
  id, an unknown id contributing no row without failing, and an empty list
  rejected. A further case covers a `status` filter still excluding a
  named-but-cancelled instance.

## 2. Carry the reading instance into resolution

- [x] 2.1 Add a required `instance: { id, processId, data, baseLocale }`
  member to `DataSourceContext` (`src/engine/registry.ts:293`). Verify `bun
  run typecheck` names every construction site rather than compiling
  silently.
- [x] 2.2 Thread `instance` through `resolveDataSourceOptions`
  (`src/runtime/api.ts:518`). Its one caller is `resolveFields`
  (`api.ts:545`), which already takes the whole `Instance` and `body:
  ProcessBody` (for `baseLocale`). Pass the committed `data`, not a merged
  payload. Do NOT hoist `mergedData` (`api.ts:820`) above the `resolveFields`
  call at `api.ts:812`; see design.md for why that breaks `heldValues`.
  Verify a new `test/data-source-resolution.test.ts` case asserts a handler
  sees the pre-submit value of a field filled in the same submission.
- [x] 2.3 Confirm `"static"` and `"db.list"` ignore the new member, by their
  existing `test/data-source-resolution.test.ts` and `test/data-lists.test.ts`
  cases passing unchanged.

## 3. The instance.query handler

- [x] 3.1 Define the config Zod schema beside `staticDataSourceConfigSchema`
  and `dbListDataSourceConfigSchema` in `src/engine/host.ts`: `processId`,
  `stepIds`, `statuses` defaulting to `["running"]`, `where`, `labelFieldId`,
  `attributes`. Enforce the comparison right-side XOR (`value` or
  `valueFromField`, never both and never neither) as a refinement. Verify new
  `test/data-source-registry-check.test.ts` cases reject both-sides,
  neither-side, an unknown key, and a missing `processId`.
- [x] 3.2 Implement `resolve` in its own module, registered from
  `createDefaultDataSourceRegistry` (`src/engine/host.ts:141`). Both existing
  handlers sit inline there, so this deviates from that pattern deliberately.
  The `db.list` handler is already about sixty inline lines, and this one adds
  two reads plus substitution on top. Build the `InstanceQueryFilter` with
  `currentStepId` omitted (`undefined`), never an empty array, when
  `config.stepIds` is absent or empty. The config's "no filter" reading and
  the read's "empty array is a caller error" reading must never collide.

  Verify registration by a `test/data-source-registry.test.ts` case asserting
  the type resolves. That file already tests `static`'s own handler. Verify a
  further case asserts a source with no `stepIds` resolves normally rather
  than raising the read's caller-error rejection.
- [x] 3.3 Substitute a `valueFromField` comparison from `ctx.instance.data`
  before building the filter. Resolve the whole source to an empty option
  list when the named field is unset. Verify new tests cover a substituted
  match and the unset-field empty list, asserting the second raises nothing.
- [x] 3.4 Pass `excludeInstanceId` when the config's `processId` equals
  `ctx.instance.processId`. Verify tests cover a self-targeting query omitting
  the reader, a sibling instance staying offered, and a cross-process query
  excluding nothing.
- [x] 3.5 Build each option. Take `value` from the instance id, and take
  `label` from `labelFieldId`, with the id as fallback when unset or
  non-scalar. Wrap the chosen value as `{ [ctx.instance.baseLocale]:
  String(value) }`, since `FieldOption.label` is `LocalizedText`, never a
  plain string. Build `attributes` by walking the configured declaration,
  not the instance's `data`. Skip a column whose current value is non-scalar
  (an array or an object). The handler treats it the same way it treats an
  unfilled one.

  Verify tests cover the label fallback and the `LocalizedText` wrapping
  under the reading process's own `baseLocale`. Verify tests also cover an
  unfilled attribute producing no entry, and a non-scalar attribute value
  producing no entry. Verify a source declaring no `attributes` produces no
  `attributes` key.
- [x] 3.6 Drop an item carrying `redactedAt` from the filtered result. Verify
  a test asserts a redacted instance is not offered.
- [x] 3.7 Run the second read for `ctx.heldValues` through the `instanceIds`
  filter from 1.4, passing the configured `processId` and no step, status or
  comparison filter. Skip the call when the list is empty. Resolve a held
  instance the filters exclude. Resolve a held redacted instance with the id
  as its label and no `attributes`. Return no option for a held id the target
  process does not hold. Verify a test per case, plus one asserting the
  handler runs no second read when `heldValues` is empty.
- [x] 3.8 Define `MAX_INSTANCE_QUERY_OPTIONS` beside `MAX_DATA_LIST_VALUES`
  (`src/engine/host.ts`, currently 500) and throw a plain `Error` naming
  the `processId` on `truncated` or on a match count over the bound. Verify
  tests cover both raise paths and one within-bound resolution. Assert that a
  held id does not count against the bound.
- [x] 3.9 Order the result by the read's own order, with held-only options
  following, ordered by instance id. Verify a test asserts two resolutions of
  an unchanged config agree.

## 4. Publish findings channel

- [x] 4.1 Define `PublishFinding` and `PublishResult = ProcessVersion & { findings: PublishFinding[] }`. Return it from `publishBody`
  (`src/engine/definitions.ts:276`) with an empty list on every existing path,
  including the hash-hit early return. Verify `bun run typecheck` passes with
  no existing caller edited, and that `test/definitions.test.ts` passes
  unchanged.
- [x] 4.2 Carry `findings` in the publish route's response body
  (`src/http/routes.ts:573`, `src/http/studio-routes.ts`). Neither response
  spreads the publish result, so add the key explicitly in each. Verify an
  `test/http-*.test.ts` case asserts the key exists and holds an empty list
  for a clean publish.
- [x] 4.3 Add a trailing optional `actor?: Actor` to `publishBody`
  (`src/engine/definitions.ts:276`), used only by the read-grant check in 5.4.
  Verify `bun run typecheck` passes with no existing caller edited, since
  `actor?` is optional and trailing.
- [x] 4.4 Pass the resolved actor from both publish routes
  (`src/http/routes.ts:572`, `src/http/studio-routes.ts`). Each already
  resolves one for its own `requirePermission` gate. Verify a test per route
  asserts a publish carrying an `"instance.query"` source fails with an
  authorization error. That test's actor holds no `read` grant on the target.

## 5. Publish-time validation

- [x] 5.1 Reject an `"instance.query"` `processId` resolving to no published
  process, beside the existing `process.start` check in cross-process
  validation. Verify new `test/cross-process.test.ts` cases cover the
  rejection, a resolvable target publishing, and a source naming the
  publishing process itself publishing.
- [x] 5.2 Resolve `stepIds`, every compared field id, `labelFieldId` and every
  `attributes` field id. Resolve them against the union of the catalogs and
  step sets of the target's versions holding live instances. Emit a
  `PublishFinding` naming the data source, the reference, the versions
  carrying it, and the live-instance count outside them. Verify tests cover a
  fully carried reference reporting nothing and an uncarried one reporting.
  Verify a partially carried one naming its versions, and a target with no
  live instances reporting every reference.
- [x] 5.3 Reject a comparison naming a target field whose declared type is
  `multiselect` or `group`. Suppress the type verdict for a reference the
  union does not carry. Verify tests cover the rejection, a scalar comparison
  publishing, and an unresolvable compared field reporting rather than
  rejecting.
- [x] 5.4 Reject the publish when the actor from 4.3 holds no `read`
  permission on the target process, through `requirePermission`
  (`src/auth/authorize.ts:115`). Skip the check when the caller supplies no
  actor. Verify tests cover the rejection, a granted author publishing, and
  the operator role short-circuiting with no grant row. One more test covers a
  no-actor publish skipping the check.
- [x] 5.5 Reject a `where` entry whose `valueFromField` resolves to no
  field of the reading (publishing) process's own catalog. Also reject one
  whose declared type is `multiselect` or `group`. This check is in-process
  only, unlike 5.1-5.3, since `valueFromField` names the publishing body's
  own catalog, not a target process's. It runs beside `instance.query`'s
  other config validation, not as a `configSchema` refinement: field-id
  resolution needs the surrounding `ProcessBody`, which
  `configSchema.parse()` does not see. Verify tests cover an unresolvable
  `valueFromField`, a `multiselect`-typed one, and a scalar one publishing.

## 6. Studio

- [x] 6.1 Add a purpose-built `"instance.query"` control in
  `packages/web/src/areas/studio/panels/DataSourcesPanel.tsx`. Follow the
  precedent at its lines 45-57 and 94-100. There, `db.list`'s `listKey`
  already sits carved out of the generated form in favour of a dedicated
  control. It takes precedence over the generated form and the raw JSON
  fallback for this type alone. Verify in a browser that selecting the type
  shows the form, and that `"db.list"` still shows its existing control.
- [x] 6.2 Offer pickers for the target process, its steps and its fields
  rather than free-text ids. Mark a reference the live-version union does
  not carry. The engine module `src/engine/config-descriptor.ts` reaches the
  browser through `GET /registry` and stays unchanged. Its flat subset is
  `string`, `number`, `boolean`, `enum` and `string-array`.
  Verify in a browser that picking a process populates the step
  picker. Confirm that the form marks a stale reference.
- [x] 6.3 Offer a comparison row with a target field, an operator, and a right
  side. The right side is either a literal or a field of the process the
  author is editing. Verify in a browser that a row commits the config shape
  the raw JSON path produces.
- [x] 6.4 Keep the raw JSON escape hatch reachable for this type, through
  `PluginEnvelopeEditor.tsx`'s existing `showRawJson` path. Its line 185
  chooses the generated form, and its line 247 the textarea. Verify in a
  browser that switching to the textarea shows the config and accepts a
  change.
- [x] 6.5 Render the publish response's `findings` after a publish. Verify in
  a browser that publishing a draft with a stale reference shows the finding.
  Confirm the publish still succeeds.
- [x] 6.6 Record the browser checks that stay manual in
  `docs/browser-checks.md`, per `development-toolchain`'s split rule.

## 7. Documentation and sweep

- [x] 7.1 Teach the type in `docs/authoring-guide.md`. Cover the config shape,
  the step-not-status rule, the self-exclusion rule and the id-as-value rule.
  Cover the convention binding a pointer field to its `columnMapping` copies.
  Cover the constraint that a `valueFromField` comparison reads the value its
  field held at step entry. The field therefore belongs on an earlier step.
  Verify the guide states the rules the specs state.
- [x] 7.2 Sweep `examples/`. No example declares a `db.list` source today, so
  the sweep adds an `"instance.query"` example rather than updating one. The
  example `purchase-requisition.json:189` already carries the only
  `columnMapping` in the examples, on the vendor field. It reads as the model
  to follow. Verify
  `expense-approval.json` and `purchase-requisition.json` still parse and
  publish unchanged, by the example-loading tests passing.
- [x] 7.3 Rewrite `docs/current-state.md`'s data source passage to name three
  types, confirming each symbol it names still exists first.
- [x] 7.4 Annotate the aggregated-data-source entry in `docs/decisions.md`
  as shipped. Match the pattern the "Instance data tables" entry already
  uses: "Shipped 2026-08-28 as `instance-data-tables`". Do not relocate or
  delete the entry: `docs/decisions.md` has no separate "Shipped" section to
  move it to. Keep the transition action recorded as the open follow-up.

  Correct that entry's description of `DataSourceContext`: it gains
  `{ id, processId, data, baseLocale }`, not the `{ id, data }` the entry
  states. It also no longer mirrors `AssignmentContext`'s shape as the entry
  claims. That type, `AssignmentContext.instance`, is itself
  `{ id, startedBy, data }`, one member short of the entry's own
  `{ id, data }` description of it. Verify both corrected lines against
  `src/engine/registry.ts`.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`, then `bun run build`, then the full
  `bun test` suite with `DATABASE_URL` set. Report what each printed. Check
  the skip count rather than the pass count alone.
- [x] 8.2 Pipe the test run through `scripts/gates/silent-green.sh` to confirm
  no silent-green and no skip-floor regression.
- [x] 8.3 Run the antislop check over every Markdown file this change touched:
  `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`.
- [x] 8.4 Run `sh scripts/gates/whitespace.sh < /dev/null`.
