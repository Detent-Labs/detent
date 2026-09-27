# Tasks

## 1. Gate the test-instance route

- [ ] 1.1 In `test/http-studio.test.ts`, add failing route tests beside the existing `POST /drafts/:processId/instances` tests. An author and a developer, each missing from the process's Developer list, get 403 with error type `authorization` and no instance row. An admin missing from the list gets 201. Verify the two refusal tests fail against the current gate.
- [ ] 1.2 In `src/http/studio-routes.ts`, replace the `requireAuthoring` gate of `handleCreateTestInstance` with the branch `handleGetDraft` uses. Rewrite its doc comment so it names the Developer list. Verify the new tests and the four existing route tests pass.

## 2. Verification

- [ ] 2.1 Run `bun run typecheck` and `bun run build` in the devcontainer, and verify both exit 0.
- [ ] 2.2 Run the full `bun test` with `DATABASE_URL` set in the devcontainer, pipe it through `scripts/gates/silent-green.sh`, and verify zero failures.
- [ ] 2.3 Run the prose and whitespace gates over `range.sh`'s output on the host, and verify both pass.
