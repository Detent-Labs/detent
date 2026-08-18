## 1. src/http

- [x] 1.1 Read `src/http/server.ts` in full and rewrite/remove comments per
      design.md's keep-vs-cut rule.
- [x] 1.2 Read `src/http/admin-routes.ts` in full and rewrite/remove
      comments per the same rule.
- [x] 1.3 Read `src/http/static.ts` in full and rewrite/remove comments per
      the same rule.

## 2. src/auth

- [x] 2.1 Read `src/auth/authorize.ts` in full and rewrite/remove comments
      per the same rule.
- [x] 2.2 Read `src/auth/users.ts` in full and rewrite/remove comments per
      the same rule, without touching the default-`db`-parameter pattern
      finding 43 left in place.

## 3. Verification

- [x] 3.1 Run `bun run typecheck`.
- [x] 3.2 Run `bun run build`.
- [x] 3.3 Run the full `bun test` suite with `DATABASE_URL` set (not a
      single-file rerun) and confirm no new skips or failures.
- [x] 3.4 Confirm `git diff` for the five files touches comments only, no
      logic, signature, or whitespace-at-EOF change.
