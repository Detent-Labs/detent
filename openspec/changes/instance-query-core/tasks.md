## 1. Schema

- [ ] 1.1 Add the generated `current_step_id` column in `initSchema`; a fresh init shows it
- [ ] 1.2 Add its index with a comment naming its readers; verify both exist
- [ ] 1.3 Test: init twice, second run is a no-op
- [ ] 1.4 Test: a step transition updates the column with no engine write
- [ ] 1.5 Test: the datastore rejects a direct write to the column

## 2. The shared predicate

- [ ] 2.1 Extract `buildInstanceWhere` from `listInstances`, filters unchanged
- [ ] 2.2 Point `listInstances` at it; the full suite stays green
- [ ] 2.3 Capture `EXPLAIN` for the inbox predicate before and after; plans match

## 3. New filters

- [ ] 3.1 Add `version` to the filter type and the builder; test excludes another version
- [ ] 3.2 Add `excludeInstanceId`; test omits the named instance, keeps the rest
- [ ] 3.3 Add the `DataComparison` type: field id, operator, literal right side
- [ ] 3.4 Compile equality to jsonb containment; test a string, number, boolean, null
- [ ] 3.5 Compile inequality and membership; test each against a jsonb array
- [ ] 3.6 Test: an absent field matches neither equality nor inequality, and does not throw
- [ ] 3.7 Test: comparisons combine conjunctively with each other and with `currentStepId`
- [ ] 3.8 Bind every field id as a parameter; test an id holding SQL metacharacters

## 4. The data read

- [ ] 4.1 Add `queryInstances` returning `{ instanceId, data }` and a truncation flag
- [ ] 4.2 Resolve no labels and open no definition store; test an unresolvable body still returns
- [ ] 4.3 Bound with a maximum count reusing `DEFAULT_LIST_LIMIT`; test the flag both ways
- [ ] 4.4 Test: the read resolves with no actor passed
- [ ] 4.5 Test: both reads name the same ids for one shared filter

## 5. The list read's data payload

- [ ] 5.1 Add `includeData`, off by default; test no `data` field without it
- [ ] 5.2 Return `data` on non-degraded summaries when set; other fields unchanged
- [ ] 5.3 Test: a degraded summary carries no `data` even with `includeData` set

## 6. HTTP surface

- [ ] 6.1 Map `version` and `excludeInstanceId` on the list route; test each
- [ ] 6.2 Decide and test how `dataWhere` reaches the route without a query-string encoding trap
- [ ] 6.3 Leave the `scope=all` admin gate untouched; test it still rejects a non-admin

## 7. Verification

- [ ] 7.1 Run `bun run typecheck`, then `bun run build`; report both outputs
- [ ] 7.2 Run the full `bun test` with `DATABASE_URL` set; report pass and skip counts
- [ ] 7.3 Pipe that run through `scripts/gates/silent-green.sh`; report its verdict
- [ ] 7.4 Run `sh scripts/gates/prose.sh < /dev/null` and `sh scripts/gates/whitespace.sh < /dev/null`
- [ ] 7.5 Measure the column rewrite against a seeded `instances` table; record the timing
- [ ] 7.6 Confirm with `EXPLAIN` that the `body->>'currentStepId'` predicate reaches the generated column
