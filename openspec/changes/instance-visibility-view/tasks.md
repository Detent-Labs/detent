## 1. Principal helper

- [x] 1.1 Add `actorPrincipals(actor, db)` to `src/auth/groups.ts`. It returns the actor's id, roles and group ids
- [x] 1.2 Move `handleListInstances`'s `scope=visible` branch in `src/http/routes.ts` onto it
- [x] 1.3 Move `listMyReports` in `src/runtime/api.ts` onto it

## 2. The direct read

- [x] 2.1 In `loadInstanceForActor`, run the two-probe query from design.md after the live-assignment test fails. Admit on `(matched OR startedBy) AND NOT denied`. The starter skips the group lookup
- [x] 2.2 Keep the test-instance branch and the `ADMIN_ROLE` branch unchanged
- [x] 2.3 Rewrite the loader's doc comment. It states the ordered rule, why the live test runs before the denial, and names its six callers
- [x] 2.4 In `test/runtime-api.test.ts`, the test on a candidacy "on a step the instance has since left" now expects the view. Every other refusal test uses a role-less outsider and stays

## 3. Tests

- [x] 3.1 In a new `test/instance-visibility-view.test.ts`, published bodies and the real write points, add a direct-read block. Past candidate admitted. Group member admitted. Revoked participant refused. Revoked starter refused
- [x] 3.2 Same block: revoked claimant admitted with the denial row still present. Revocation applies again after the step moves on. Granted actor admitted
- [x] 3.3 Add the comments and attachments scenario. A past participant lists, posts, uploads, lists and downloads. A revoked one gets the refusal on each
- [x] 3.4 Add the test-instance scenario. A group principal on a test instance does not admit a member
- [x] 3.5 Add one test that an unrelated actor gets the same `AuthorizationError` for a nonexistent id and for a real one

## 4. Documentation

- [x] 4.1 `docs/decisions.md`: the per-instance visibility entry states that the direct read now consults the set
- [x] 4.2 `docs/current-state.md`: the `loadInstanceForActor` passages state the new rule
- [x] 4.3 `ROADMAP.md`: stage 58 row, `instance-visibility-view`, listing `authorization`, `instance-visibility-set`, `runtime-api`
- [x] 4.4 `tmp/offene-items.md` (untracked, the owner's tracker): item 29 moves through the status column

## 5. Verification

- [x] 5.1 `bun run typecheck`, `bun run build`, full `bun test` with `DATABASE_URL`, piped through `scripts/gates/silent-green.sh`
- [x] 5.2 Prose and whitespace gates over the pushed range
