## 1. Claim admission

- [x] 1.1 Cover each scenario of "A test instance admits its starter and an administrator to a claim". Put the DB-backed cases in `test/draft-test-instances.test.ts`. Call the runtime `claimStep`. Confirm both admission cases fail against today's guard, in a full `bun test` run.
- [x] 1.2 Admit a test instance's starter and any `system:admin` holder in `src/engine/transition.ts::claimStep`, as design.md decides. Confirm every case from 1.1 passes, in a full `bun test` run.

## 2. Docs

- [x] 2.1 In `docs/openapi.yaml`, name the test-instance admission in the claim route's description and in its 403 text. Confirm by reading the route entry back.
- [x] 2.2 In `docs/current-state.md`, add the claim admission to the "Draft test instances" section. Reconcile the authorization passage that calls `claimStep` untouched. Confirm with the prose gate over the range.
- [x] 2.3 In `docs/decisions.md`, add an open entry under its own heading: a candidate can claim a test instance it cannot open. Cite `authorization` and `instance-visibility-set`, which both say the engine never hands out such a task. Confirm with the prose gate.

## 3. Verification

- [x] 3.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer. Both exit 0.
- [x] 3.2 Run the full `bun test` with `DATABASE_URL` set, piped through `scripts/gates/silent-green.sh`. It reports no failure and no skip past the floor.
- [ ] 3.3 Run the prose gate and the whitespace gate over the range, each fed by `scripts/gates/range.sh`. Both pass.
- [ ] 3.4 In a real browser, open the Player for `it-onboarding` as a `system:admin` actor who is no candidate. Create a test instance and claim `service_request`. The claim succeeds and no "not a candidate" message appears.
