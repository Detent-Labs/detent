# Tasks

## 1. Close draft snapshots on the version-body route

- [x] 1.1 In `test/http-studio.test.ts`, beside the test "a curator reads a published version's body", add two tests. In each, the `developer` fixture saves a draft and creates a test instance with `POST /drafts/:processId/instances`. The test confirms a snapshot row at version -1. In the first test, `curator` requests `versions/-1`. In the second, a `system:developer` actor absent from the Developer list requests it. Each test asserts 404 and a response text without the draft's label.
- [x] 1.2 Run the two tests against the current handler. Verify that each named test fails on its status assertion, which receives 200. Take the verdict from that named assertion alone.
- [x] 1.3 In `src/http/studio-routes.ts`, make `handleGetVersionBody` answer `notFound` for a version below 1 before it calls `resolveBody`, per design.md. Update the handler's comment to state that a draft snapshot never reads through this route. Verify that both new tests now pass and that the existing curator test still gets 200 on `versions/1`.
- [x] 1.4 Run a grep for `resolveBody(` under `src/http` and verify `handleGetVersionBody` is the only match.

## 2. Verification

- [x] 2.1 Run `bun run typecheck`, then `bun run build`, and verify both exit 0.
- [x] 2.2 In the devcontainer with DATABASE_URL set, run the full `bun test` suite. Pipe its log through `scripts/gates/silent-green.sh`. Verify zero failures and a skip count at or below the floor.
- [x] 2.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` and `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host, and verify both pass.
