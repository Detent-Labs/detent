## 1. Schema

- [x] 1.1 Add `instances_current_step_idx` on `((body->>'currentStepId'))` in `initSchema`
- [x] 1.2 Add `instances_started_by_idx` on `((body->>'startedBy'))` beside it
- [x] 1.3 Comment each index with its readers: `listInstances` and
      `queryInstances`, both reaching it through `buildInstanceWhere`'s shared
      `currentStepId`/`startedBy` filters
- [x] 1.4 Test: a fresh init creates both indexes, and a second run is a no-op

## 2. The shared predicate

- [x] 2.1 Capture `EXPLAIN` for the inbox predicate against the unchanged read
- [x] 2.2 Extract `buildInstanceWhere` from `listInstances`, filters unchanged
- [x] 2.3 Carry `assignedToRoles` into the fragment; test the role half survives
- [x] 2.4 Point `listInstances` at it; the full suite stays green
- [x] 2.5 Capture `EXPLAIN` again for that predicate; the two plans match

## 3. New filters

- [x] 3.1 Add `version`, comparing `body->>'version'` as text so the index applies
- [x] 3.2 Test: `version` excludes another version of the same process
- [x] 3.3 Reject a `version` carrying no `processId`; test the list read refuses it
- [x] 3.4 Add `excludeInstanceId`; test it omits the named instance, keeps the rest
- [x] 3.5 Bound `created_at` with `createdAfter` and `createdBefore`, both inclusive, in SQL
- [x] 3.6 Test: a window returns an instance created inside it, omitting one created before and one created after
- [x] 3.7 Test: a bound naming an instance's `created_at::text` value matches on either end
- [x] 3.8 Test: write a row whose `created_at` carries microseconds; a `createdBefore` carrying that row's summary `createdAt` omits it
- [x] 3.9 Add the `DataComparison` type in `src/runtime/api.ts`: field id, operator, right side
- [x] 3.10 Add `dataWhere` to `InstanceListFilter` beside the new plain filters
- [x] 3.11 Reject a non-scalar right side; test an array, an object, and a membership list holding an array. Also reject an empty membership list; test it
- [x] 3.12 Compile equality to jsonb containment; test a string, number, boolean, null
- [x] 3.13 Cast every bound field id `::text` where it lands in a `VARIADIC "any"` argument. Test that an equality comparison with a bound field id runs
- [x] 3.14 Compile inequality; test it against a scalar right side
- [x] 3.15 Compile membership over one bound parameter: `body->'data'->$fid IN (SELECT jsonb_array_elements($n::text::jsonb))`, binding the list as one JSON string. Test two listed values match and a third does not
- [x] 3.16 Cast every bound JSON value `::text::jsonb`; test a number and a boolean
- [x] 3.17 Test the fragment fold at 0, 1 and 3 bound comparisons. The bound values arrive in order, and a two-level nesting binds in order too
- [x] 3.18 Reject a `dataWhere` carrying no `processId`; test that it runs no comparison query
- [x] 3.19 Probe each compared field id over the other filters alone, before the main query: `SELECT 1 ... WHERE jsonb_typeof(body->'data'->$fid) IN ('array','object') LIMIT 1`
- [x] 3.20 Test: a selected instance holding a `multiselect` array raises, and one holding an object raises
- [x] 3.21 Test: an absent field matches neither equality nor inequality, and does not throw
- [x] 3.22 Test: comparisons combine conjunctively with each other and with `currentStepId`
- [x] 3.23 Bind every field id as a parameter; test an id holding SQL metacharacters
- [x] 3.24 Test: an equality comparison on field F and number 1 omits an
      instance holding the string `"1"` under F, and an equality comparison
      on field F and string `"1"` omits an instance holding the number 1
      under F

## 4. The data read

- [x] 4.1 Add `InstanceQueryFilter` in `src/runtime/api.ts`, declaring the ten members its requirement enumerates and nothing else; it carries no `assignedTo`, no `assignedToRoles` and no `includeDegraded`
- [x] 4.2 Add `queryInstances` returning an `InstanceDataPage` of `InstanceDataItem`: `instanceId`, `version`, `data` and `redactedAt`
- [x] 4.3 Reject a `version` carrying no `processId` on the data read; test it refuses it
- [x] 4.3a Reject a `dataWhere` carrying no `processId` on the data read; test it runs no comparison query
- [x] 4.4 Test: no returned item carries `processLabel`, `stepLabel`, `status` or `transitionSeq`
- [x] 4.5 Reject `assignedTo`, `assignedToRoles`, `scope` and `includeDegraded` at runtime, not by type alone. Test each raises, and test the read ignores an unrecognized key. The `scope` case builds the key by hand, since `InstanceListFilter` declares none
- [x] 4.6 Test: the result envelope carries no cursor for a following page
- [x] 4.7 Test: a redacted instance carries `redactedAt`, an unwritten field does not
- [x] 4.8 Resolve no labels and open no definition store; test an unresolvable body still returns
- [x] 4.9 Bound it with `DEFAULT_LIST_LIMIT` and `MAX_LIST_LIMIT`; test the cap holds
- [x] 4.10 Detect truncation by selecting `limit + 1` and dropping the extra row, the shape `src/runtime/api.ts:312` already uses; report it on the envelope
- [x] 4.11 Test the flag three ways: fewer matches than the bound, exactly the bound, and more than the bound. Exactly the bound reports no truncation
- [x] 4.12 Order by `created_at DESC, instance_id DESC`; test two cut runs match
- [x] 4.13 Test: two callers passing one identical filter receive the same items
- [x] 4.14 Test: both reads name the same ids for one `processId`, one `currentStepId` and one `dataWhere` comparison together

## 5. HTTP surface

- [x] 5.1 Map `version`, `excludeInstanceId`, `createdAfter` and `createdBefore`; test each
- [x] 5.2 Reject a malformed `version` or creation bound with 400; test both
- [x] 5.3 Reject a `version` parameter carrying no `processId` with 400; test it
- [x] 5.4 Test: a `dataWhere` query parameter reaches no filter on the read
- [x] 5.5 Leave the `scope=all`, `scope=mine` and `scope=started` gates untouched; test all three

## 6. Documentation

- [x] 6.1 Update `docs/current-state.md`: the filter enumeration at `:992-1005`, and the `queryInstances` read beside the `listInstances` passage. Add the two new indexes beside the `:988-991` passage, leaving its three-index count alone
- [x] 6.2 Add the new query parameters to `GET /instances` in `docs/openapi.yaml`
- [x] 6.3 Fix the stale filter comment in `packages/web/src/areas/admin/screens/instancesLogic.ts:4`
- [x] 6.4 Record the two date ranges in `docs/decisions.md`, beside its
      promote-out-of-`body` note
- [x] 6.4a Correct that entry's index-count claim, per design.md's "The two new
      indexes are expression indexes" decision: today one expression index
      (`instances_selection_idx`) stands in for three of the note's six named
      fields (`processId`, `version`, `status`); this change adds two more
      (`instances_current_step_idx`, `instances_started_by_idx`), each
      covering one more field (`currentStepId`, `startedBy`) for five of six
      covered; `startedAt` still has none. `instances` carries four
      expression indexes total today and six after this change, but three of
      the six (`instances_claimed_by_idx`, `instances_candidates_idx`,
      `instances_parent_idx`) stand in for keys the note does not name, so a
      future promotion of the note's six fields retires three indexes
      (selection, current-step, started-by), not six and not four
- [x] 6.5 Refresh `openspec/config.yaml`'s `context:` block: add
      `queryInstances` beside `listInstances`/`getInstanceRecord` at line 84,
      and note the new `instance-data-query` capability

## 7. Spec sync

- [x] 7.1 Confirm the five delta spec files under
      `openspec/changes/instance-query-core/specs/` match the shipped
      behaviour once groups 1 to 6 land. The archive step syncs them into
      `openspec/specs/`; this task only checks for drift

## 8. Verification

- [x] 8.1 Run `bun run typecheck`, then `bun run build`; report both outputs
- [x] 8.2 Run the full `bun test` with `DATABASE_URL` set; report pass and skip counts
- [x] 8.3 Pipe that run through `scripts/gates/silent-green.sh`; report its verdict
- [x] 8.4 Pipe `scripts/gates/range.sh` into `scripts/gates/prose.sh`; report its verdict
- [x] 8.5 Pipe `scripts/gates/range.sh` into `scripts/gates/whitespace.sh`; report its verdict
- [x] 8.6 Confirm with `EXPLAIN` that the `currentStepId` and `startedBy` filters reach their indexes
