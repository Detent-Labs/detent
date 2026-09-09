## 1. `docs/openapi.yaml`

- [ ] 1.1 Apply C1 through C4 of `tmp/doc-audit/09-openapi.md`. Those four
      corrections cover the draft-save entry, the three visibility entries, the
      three component schemas and the summary sentence. Take the replacement
      text from the report, which is byte-exact and anchor-checked.
      Verify: `grep -c '^  /instances/{instanceId}/draft:' docs/openapi.yaml` reports 1.
      Verify: `grep -c '^  /instances/{instanceId}/visibility/' docs/openapi.yaml` reports 3.
      Verify: `grep -cE '^    (InstanceDraftRequest|InstanceDraftSaved|VisibilityRequest):' docs/openapi.yaml` reports 3.
      Verify: `grep -c 'save a form draft' docs/openapi.yaml` reports 1.
      Verify: `grep -c '"404"' docs/openapi.yaml` reports 0.

## 2. `test/openapi-exclusions.test.ts`

- [ ] 2.1 Add `templates` to `EXCLUDED` at line 15. Add one assertion per new
      documented path, and one that no studio version read appears. Match the
      full version-read path: a prefix also matches
      `/processes/{processId}/versions`, which stays documented.
      Verify: `grep -c '"templates"' test/openapi-exclusions.test.ts` reports 1 or more.
      Verify: `grep -oE 'instanceId\}/(draft|visibility/(grant|revoke|restore))' test/openapi-exclusions.test.ts | wc -l` reports 4 or more. `grep -oE` counts matches, so a one-line array literal still reports 4 where `grep -c` would report 1.
      Verify: `grep -cE 'versions/\{version\}|orphan' test/openapi-exclusions.test.ts` reports 1 or more. That is the version-read assertion, which the other two commands never see.

## 3. `packages/web/test/studio-stepsRail.test.tsx`

- [ ] 3.1 Add one assertion: no rail row carries `aria-expanded`. That
      assertion is what makes the rewritten first scenario testable.
      Verify: `grep -c 'aria-expanded' packages/web/test/studio-stepsRail.test.tsx` reports 1 or more.

## 4. `packages/web/test/studio-stepPage.test.tsx`

- [ ] 4.1 Correct the comment at `:172-173`. It reads "The page's one
      disclosure is the Developer view, and it is a `<details>`", and the page
      carries a second one, the guard editor's toggle
      (`ConditionInput.tsx:154-164`). The assertion below it scans `<h3>` tags
      and stays as it is. Comment only, no assertion changes.
      Verify: `grep -c 'one disclosure' packages/web/test/studio-stepPage.test.tsx` reports 0.

## 5. Verification

Run every command below inside the devcontainer. Both gate scripts take their
file list from the committed range. They report nothing until the controller
commits this change's files. The whitespace gate then reads worktree bytes for
its CR probe (`scripts/gates/whitespace.sh:64`). A gate that finds no file in
its range prints "nothing to check" and exits 0, which is no pass.

- [ ] 5.1 Run `bun run typecheck` and confirm it exits 0.
- [ ] 5.2 Run `bun run build` and confirm it exits 0.
- [ ] 5.3 Run the full `bun test` with `DATABASE_URL` set. Two test files gain
      an assertion here, so this is a real gate. Confirm 0 fail, and check the
      skip count against the baseline.
      Verify: `bun test 2>&1 | tee /tmp/t.log; sh scripts/gates/silent-green.sh /tmp/t.log` exits 0.
- [ ] 5.4 Run the prose gate over the pushed range and confirm it exits 0.
      Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` exits 0.
- [ ] 5.5 Run the whitespace gate over the same range and confirm it exits 0.
      Verify: `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` exits 0.
- [ ] 5.6 Confirm the change's own artifacts still validate.
      Verify: `openspec validate spec-drift-corrections --type change --strict` reports valid.
- [ ] 5.7 Confirm no file under `src/` or `packages/web/src/` changed. No
      browser check applies, because no screen changes.
      Verify: `git diff --stat origin/main..HEAD -- src packages/web/src` prints nothing.
