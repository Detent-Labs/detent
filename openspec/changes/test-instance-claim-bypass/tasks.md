## 1. Claim admission

- [ ] 1.1 Add DB-backed cases to `test/draft-test-instances.test.ts`, one per scenario of "A test instance admits its starter and an administrator to a claim". Call the runtime `claimStep`. Confirm both admission cases fail against today's guard, in a full `bun test` run.
- [ ] 1.2 Admit a test instance's starter and any `system:admin` holder in `src/engine/transition.ts::claimStep`, as design.md decides. Confirm every case from 1.1 passes, in a full `bun test` run.

## 2. Docs

- [ ] 2.1 In `docs/openapi.yaml`, name the test-instance admission in the claim route's description and in its 403 text. Confirm by reading the route entry back.
- [ ] 2.2 In `docs/current-state.md`, add the claim admission to the "Draft test instances" section. Confirm with the prose gate over the range.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck`, then `bun run build`, in the devcontainer. Both exit 0.
- [ ] 3.2 Run the full `bun test` with `DATABASE_URL` set, piped through `scripts/gates/silent-green.sh`. It reports no failure and no skip past the floor.
- [ ] 3.3 Run the prose gate and the whitespace gate over the range, each fed by `scripts/gates/range.sh`. Both pass.
- [ ] 3.4 In a real browser, open the Player for `it-onboarding` as a `system:admin` actor who is no candidate. Create a test instance and claim `service_request`. The claim succeeds and no "not a candidate" message appears.
