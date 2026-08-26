## 1. Schema

- [ ] 1.1 Add `instances_current_step_idx` on `((body->>'currentStepId'))` in `initSchema`
- [ ] 1.2 Add `instances_started_by_idx` on `((body->>'startedBy'))` beside it
- [ ] 1.3 Comment each index with its reader, the list read's matching filter
- [ ] 1.4 Test: a fresh init creates both indexes, and a second run is a no-op

## 2. The shared predicate

- [ ] 2.1 Capture `EXPLAIN` for the inbox predicate against the unchanged read
- [ ] 2.2 Extract `buildInstanceWhere` from `listInstances`, filters unchanged
- [ ] 2.3 Carry `assignedToRoles` into the fragment; test the role half survives
- [ ] 2.4 Point `listInstances` at it; the full suite stays green
- [ ] 2.5 Capture `EXPLAIN` again for that predicate; the two plans match

## 3. New filters

- [ ] 3.1 Add `version`, comparing `body->>'version'` as text so the index applies
- [ ] 3.2 Test: `version` excludes another version of the same process
- [ ] 3.3 Reject a `version` carrying no `processId`; test the list read refuses it
- [ ] 3.4 Add `excludeInstanceId`; test it omits the named instance, keeps the rest
- [ ] 3.5 Bound `created_at` with `createdAfter` and `createdBefore`, both inclusive, in SQL
- [ ] 3.6 Test: a window returns an instance created inside it, and omits one created before it and one created after it
- [ ] 3.7 Test: a bound naming an instance's `created_at::text` value matches on either end
- [ ] 3.8 Test: write a row whose `created_at` carries microseconds; a `createdBefore` carrying that row's summary `createdAt` omits it
- [ ] 3.9 Add the `DataComparison` type in `src/runtime/api.ts`: field id, operator, right side
- [ ] 3.10 Add `dataWhere` to `InstanceListFilter` beside the new plain filters
- [ ] 3.11 Reject a non-scalar right side; test an array, an object, and a membership list holding an array. Also reject an empty membership list; test it
- [ ] 3.12 Compile equality to jsonb containment; test a string, number, boolean, null
- [ ] 3.13 Cast every bound field id `::text` where it lands in a `VARIADIC "any"` argument. Test that an equality comparison with a bound field id runs
- [ ] 3.14 Compile inequality; test it against a scalar right side
- [ ] 3.15 Compile membership over one bound parameter: `body->'data'->$fid IN (SELECT jsonb_array_elements($n::text::jsonb))`, binding the list as one JSON string. Test two listed values match and a third does not
- [ ] 3.16 Cast every bound JSON value `::text::jsonb`; test a number and a boolean
- [ ] 3.17 Test the fragment fold at 0, 1 and 3 bound comparisons. The bound values arrive in order, and a two-level nesting binds in order too
- [ ] 3.18 Reject a `dataWhere` carrying no `processId`; test that it runs no comparison query
- [ ] 3.19 Probe each compared field id over the other filters alone, before the main query: `SELECT 1 ... WHERE jsonb_typeof(body->'data'->$fid) IN ('array','object') LIMIT 1`
- [ ] 3.20 Test: a selected instance holding a `multiselect` array raises, and one holding an object raises
- [ ] 3.21 Test: an absent field matches neither equality nor inequality, and does not throw
- [ ] 3.22 Test: comparisons combine conjunctively with each other and with `currentStepId`
- [ ] 3.23 Bind every field id as a parameter; test an id holding SQL metacharacters

## 4. The data read

- [ ] 4.1 Add `InstanceQueryFilter` in `src/runtime/api.ts`, declaring the ten members its requirement enumerates and nothing else; it carries no `assignedTo`, no `assignedToRoles` and no `includeDegraded`
- [ ] 4.2 Add `queryInstances` returning an `InstanceDataPage` of `InstanceDataItem`: `instanceId`, `version`, `data` and `redactedAt`
- [ ] 4.3 Reject a `version` carrying no `processId` on the data read; test it refuses it
- [ ] 4.4 Test: no returned item carries `processLabel`, `stepLabel`, `status` or `transitionSeq`
- [ ] 4.5 Reject `assignedTo`, `assignedToRoles`, `scope` and `includeDegraded` at runtime, not by type alone. Test each raises, and test the read ignores an unrecognized key. The `scope` case builds the key by hand, since `InstanceListFilter` declares none
- [ ] 4.6 Test: the result envelope carries no cursor for a following page
- [ ] 4.7 Test: a redacted instance carries `redactedAt`, an unwritten field does not
- [ ] 4.8 Resolve no labels and open no definition store; test an unresolvable body still returns
- [ ] 4.9 Bound it with `DEFAULT_LIST_LIMIT` and `MAX_LIST_LIMIT`; test the cap holds
- [ ] 4.10 Detect truncation by selecting `limit + 1` and dropping the extra row, the shape `src/runtime/api.ts:312` already uses; report it on the envelope
- [ ] 4.11 Test the flag three ways: fewer matches than the bound, exactly the bound, and more than the bound. Exactly the bound reports no truncation
- [ ] 4.12 Order by `created_at DESC, instance_id DESC`; test two cut runs match
- [ ] 4.13 Test: two callers passing one identical filter receive the same items
- [ ] 4.14 Test: both reads name the same ids for one `processId`, one `currentStepId` and one `dataWhere` comparison together

## 5. HTTP surface

- [ ] 5.1 Map `version`, `excludeInstanceId`, `createdAfter` and `createdBefore`; test each
- [ ] 5.2 Reject a malformed `version` or creation bound with 400; test both
- [ ] 5.3 Reject a `version` parameter carrying no `processId` with 400; test it
- [ ] 5.4 Test: a `dataWhere` query parameter reaches no filter on the read
- [ ] 5.5 Leave the `scope=all`, `scope=mine` and `scope=started` gates untouched; test all three

## 6. Documentation

- [ ] 6.1 Update `docs/current-state.md`: the filter enumeration at `:992-1005`, and the `queryInstances` read beside the `listInstances` passage. Add the two new indexes beside the `:988-991` passage, leaving its three-index count alone
- [ ] 6.2 Add the new query parameters to `GET /instances` in `docs/openapi.yaml`
- [ ] 6.3 Fix the stale filter comment in `packages/web/src/areas/admin/screens/instancesLogic.ts:4`
- [ ] 6.4 Record the two date ranges in `docs/decisions.md`, beside its promote-out-of-`body` note. Correct that entry's six-expression-index count in the same pass. Four expression indexes stand in for `body` keys today, and six do once both new ones land. Promotion retires three of them

## 7. Spec sync

- [ ] 7.1 Confirm the five delta spec files under
      `openspec/changes/instance-query-core/specs/` match the shipped
      behaviour once groups 1 to 6 land. The archive step syncs them into
      `openspec/specs/`; this task only checks for drift

## 8. Verification

- [ ] 8.1 Run `bun run typecheck`, then `bun run build`; report both outputs
- [ ] 8.2 Run the full `bun test` with `DATABASE_URL` set; report pass and skip counts
- [ ] 8.3 Pipe that run through `scripts/gates/silent-green.sh`; report its verdict
- [ ] 8.4 Pipe `scripts/gates/range.sh` into `scripts/gates/prose.sh`; report its verdict
- [ ] 8.5 Pipe `scripts/gates/range.sh` into `scripts/gates/whitespace.sh`; report its verdict
- [ ] 8.6 Confirm with `EXPLAIN` that the `currentStepId` and `startedBy` filters reach their indexes
