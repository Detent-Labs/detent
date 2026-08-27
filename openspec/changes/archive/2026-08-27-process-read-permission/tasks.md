## 1. The permission seam

- [x] 1.1 Add `"read"` to the `Permission` union in `src/auth/authorize.ts`
- [x] 1.2 Map `read` to `ADMIN_ROLE` in `PERMISSION_ROLE`
- [x] 1.3 Add a test: an admin-only actor answers true for `read`
- [x] 1.4 Add a test: a reports-only actor answers false for `read`
- [x] 1.5 Add a test: a read grant admits one process and refuses another
- [x] 1.6 Run `bun run typecheck` and confirm no new error

## 2. The grant body

- [x] 2.1 Add `"read"` to the `permission` enum in `src/auth/grants.ts`
- [x] 2.2 Add a test: a POSTed read grant stores, and the list carries it
- [x] 2.3 Add a test: an unknown permission still answers 400 (already covered
      by the existing "the engine refuses an unknown permission with 400 and
      stores no row" test in `test/http-admin.test.ts`)
- [x] 2.4 Widen `writeGrant`'s (`test/auth-authorize.test.ts:145`) and
      `grantRole`'s (`test/http.test.ts:192`) `permission` parameter from the
      literal union `"publish" | "cancel" | "migrate"` to the `Permission`
      type imported from `src/auth/authorize.ts`, so a test can write a
      `"read"` grant through either helper

## 3. The listing route

- [x] 3.1 In `src/http/routes.ts`, split the `scope=all` branch by `processId`
- [x] 3.2 With a `processId`, await `requirePermission` with `read` over it
- [x] 3.3 Without one, keep `requireRole(actor, ADMIN_ROLE)` unchanged
- [x] 3.4 Raise an error text naming the missing `processId`, still 403
      (`requirePermission`'s existing message already names the process when
      one is given; `requireRole`'s existing message stays for the omitted
      case, and both throw `AuthorizationError` -> 403, so no new error path
      was needed — see design.md "gets 403, not 400")
- [x] 3.5 Confirm the check runs before the read builds its filter (the gate
      closure runs before the `fn` closure inside `route()`, unchanged)

## 4. Route tests

- [x] 4.1 Add a test: an admin lists unfiltered with no grant row, 200 (already
      covered by "GET /instances?scope=all with system:admin succeeds", since
      `beforeEach` truncates `permission_grants`)
- [x] 4.2 Add a test: a grant holder naming its process gets 200
- [x] 4.3 Add a test: a grant holder naming another process gets 403
- [x] 4.4 Add a test: a grant holder naming no process gets 403
- [x] 4.5 Add a test: an actor with neither role nor grant gets 403 (already
      covered by "GET /instances?scope=all without system:admin maps to 403")
- [x] 4.6 Confirm the existing listing tests still pass unchanged (verified in
      section 6's full `bun test` run)

## 5. Documentation

- [x] 5.1 Update the permission list in `docs/authoring-guide.md` if it names
      one (it names none — no change needed)
- [x] 5.2 Update `docs/current-state.md` where it counts the permissions
- [x] 5.3 Mark the `scope=all` half done in the `docs/decisions.md` entry
- [x] 5.4 Note in that entry that the reporting half stays open
- [x] 5.5 Update the Purpose paragraph in
      `openspec/specs/permission-grant-administration/spec.md` ("one of the
      three process-scoped permissions" -> "one of the four process-scoped
      permissions")
- [x] 5.6 Update `ROADMAP.md` stage 40 (~line 89, "over three permissions:
      `\"publish\"`, `\"cancel\"` and `\"migrate\"`") to name four
      permissions, including `read`

## 6. Verification

- [x] 6.1 Run `bun run typecheck`, then `bun run build`, and report both
- [x] 6.2 Run the full `bun test` with `DATABASE_URL` set, and report the counts
- [x] 6.3 Pipe that run through `scripts/gates/silent-green.sh` and report it
- [x] 6.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
      over the touched Markdown
- [x] 6.5 Run `sh scripts/gates/whitespace.sh < /dev/null` and report it
- [x] 6.6 No browser check applies, since no UI changes here
