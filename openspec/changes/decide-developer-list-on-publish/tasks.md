# Tasks

## 1. The shared list check

- [ ] 1.1 Move `requireDeveloperListOrAdmin` from `src/http/studio-routes.ts` to `src/auth/process-access.ts`, export it, and import it back. Verify `bun run typecheck` passes.
- [ ] 1.2 Add `requirePublishListAccess(actor, processId, db)` to `src/auth/process-access.ts`, per `design.md`. Cover admin, first publish, listed, group member and unlisted in `test/process-access.test.ts`.
- [ ] 1.3 Export `appendCreatorAsDeveloper` from `src/engine/drafts.ts`. Verify `bun run typecheck` passes.

## 2. The draft publish route

- [ ] 2.1 Call `requirePublishListAccess` in `handlePublishDraft` after `requirePermission`. Verify new tests in `test/http-studio.test.ts` pass.
- [ ] 2.2 Add tests there for the unlisted publisher, the listed group member and the admin. Assert that the refused call persists no version.
- [ ] 2.3 Give every existing publish test in the suite a list entry for its publisher, or an admin publisher. Verify no test fails on the new 403.

## 3. The POST /processes route

- [ ] 3.1 Call `requirePublishListAccess` in `handlePublish` after `requirePermission`. Verify the unlisted-publisher test gets 403.
- [ ] 3.2 Seed the first publisher in one `withTransaction` with `publishBody`. Verify version 2 by the same actor succeeds, and a failed first publish leaves no list entry.
- [ ] 3.3 Cover a listed publisher, an admin, a first publish and a publisher without an authoring role. Verify each against its spec scenario.
- [ ] 3.4 Run the full suite and fix each test that republishes through `POST /processes` as an unlisted non-admin. Verify no test fails on the new 403.

## 4. Documentation

- [ ] 4.1 Update the header comment of `src/http/studio-routes.ts` and the list comment in `src/auth/process-access.ts` to name the two publish routes. Verify by reading both.
- [ ] 4.2 Describe the list check and the new 403 on `POST /processes` in `docs/openapi.yaml`. Verify the openapi test passes.
- [ ] 4.3 Delete the `decide-developer-list-on-publish` entry from the audit index in `docs/decisions.md`. Verify with grep that no entry remains.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`, then `bun run build`, then the full gated `bun test` with `DATABASE_URL` set. Record what each printed.
- [ ] 5.2 Run the prose gate and the whitespace gate over the branch range. Record what each printed.
