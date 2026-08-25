## 1. The permission seam

- [ ] 1.1 Add `"read"` to the `Permission` union in `src/auth/authorize.ts`
- [ ] 1.2 Map `read` to `ADMIN_ROLE` in `PERMISSION_ROLE`
- [ ] 1.3 Add a test: an admin-only actor answers true for `read`
- [ ] 1.4 Add a test: a reports-only actor answers false for `read`
- [ ] 1.5 Add a test: a read grant admits one process and refuses another
- [ ] 1.6 Run `bun run typecheck` and confirm no new error

## 2. The grant body

- [ ] 2.1 Add `"read"` to the `permission` enum in `src/auth/grants.ts`
- [ ] 2.2 Add a test: a POSTed read grant stores, and the list carries it
- [ ] 2.3 Add a test: an unknown permission still answers 400

## 3. The listing route

- [ ] 3.1 In `src/http/routes.ts`, split the `scope=all` branch by `processId`
- [ ] 3.2 With a `processId`, await `requirePermission` with `read` over it
- [ ] 3.3 Without one, keep `requireRole(actor, ADMIN_ROLE)` unchanged
- [ ] 3.4 Raise an error text naming the missing `processId`, still 403
- [ ] 3.5 Confirm the check runs before the read builds its filter

## 4. Route tests

- [ ] 4.1 Add a test: an admin lists unfiltered with no grant row, 200
- [ ] 4.2 Add a test: a grant holder naming its process gets 200
- [ ] 4.3 Add a test: a grant holder naming another process gets 403
- [ ] 4.4 Add a test: a grant holder naming no process gets 403
- [ ] 4.5 Add a test: an actor with neither role nor grant gets 403
- [ ] 4.6 Confirm the existing listing tests still pass unchanged

## 5. Documentation

- [ ] 5.1 Update the permission list in `docs/authoring-guide.md` if it names one
- [ ] 5.2 Update `docs/current-state.md` where it counts the permissions
- [ ] 5.3 Mark the `scope=all` half done in the `docs/decisions.md` entry
- [ ] 5.4 Note in that entry that the reporting half stays open

## 6. Verification

- [ ] 6.1 Run `bun run typecheck`, then `bun run build`, and report both
- [ ] 6.2 Run the full `bun test` with `DATABASE_URL` set, and report the counts
- [ ] 6.3 Pipe that run through `scripts/gates/silent-green.sh` and report it
- [ ] 6.4 Run `sh scripts/gates/prose.sh < /dev/null` over the touched Markdown
- [ ] 6.5 Run `sh scripts/gates/whitespace.sh < /dev/null` and report it
- [ ] 6.6 No browser check applies, since no UI changes here
