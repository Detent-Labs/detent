## Why

Ponytail finding 44 (`PONYTAIL-AUDIT.md`) reports that `src/http` and
`src/auth` hold 4150 lines. 1132 of them are comment. Much of it narrates
change history by name, for example "before `http-route-table` a parallel
OPTIONS if-chain restated every route." That violates `CLAUDE.md`'s own
convention: "Comments state facts, not process history." It concentrates in
`server.ts` (~35% comment), `admin-routes.ts` (~29%), `users.ts` (~46%),
`static.ts` (~56%) and `authorize.ts` (~59%).

## What Changes

- Rewrite or remove comments in `src/http/server.ts`,
  `src/http/admin-routes.ts`, `src/http/static.ts`, `src/auth/authorize.ts`
  and `src/auth/users.ts`. Every remaining comment states a present fact
  about the code. Each one names an invariant, a non-obvious constraint, or
  a reason a check exists. None narrates which prior change introduced or
  replaced it.
- No behavior, signature, or test change. This change touches comments only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None -- no spec-level behavior change. This change sets `skip_specs: true`.

## Impact

Affected files: `src/http/server.ts`, `src/http/admin-routes.ts`,
`src/http/static.ts`, `src/auth/authorize.ts`, `src/auth/users.ts`. No API
or dependency impact, and no schema change. Estimated ~350 lines of
comment removed or rewritten.
