## Context

See `proposal.md` for motivation. The seam this change widens already exists:
`can` and `requirePermission` in `src/auth/authorize.ts`, over the
`permission_grants` table behind `src/auth/grants.ts`.

Two facts shape the approach. The `scope=all` listing already sits behind
`requireRole(actor, ADMIN_ROLE)` at `src/http/routes.ts:437`. So this change
loosens a closed gate rather than closing an open one. And a grant names one
process, while `GET /instances` accepts a request naming none.

## Goals / Non-Goals

**Goals:**

- One new way to say "this role reads this process's instances in bulk".
- Every account keeps the answers it has today. No grant row, no deployment
  step.
- The reserved-role short-circuit keeps costing an operator nothing. An
  `ADMIN_ROLE` holder reads no grant row.

**Non-Goals:**

- No result-set predicate over the processes an actor holds a grant over.
- No change to the three reporting routes. See `proposal.md` for that split.
- No new reserved role. The role set stays at eight.
- No UI. Nothing in `packages/web` reads or offers a read grant.

## Decisions

### The read permission takes `ADMIN_ROLE` as its reserved role

The `PERMISSION_ROLE` map holds one role per permission. That role
short-circuits before any query. Today `ADMIN_ROLE` gates the bulk read.
Mapping the new permission to it reproduces today's answer for every existing
account. That is what makes the change additive.

Two alternatives lost. Folding this into `REPORTS_ROLE` would put two
questions in one role. The first is area access. The second is which
process's data an actor sees. An installation could then never narrow the
second without removing the first.

A fresh role such as `system:read-any` would separate the two cleanly. It
would also strip the bulk read from every current `ADMIN_ROLE` holder on the
day it lands. No account holds a role that does not yet exist.

### The gate stays a gate

A request naming a `processId` goes through `requirePermission` with
`"read"`. A request naming none keeps `requireRole(actor, ADMIN_ROLE)`.

The alternative is the predicate `docs/decisions.md` sketches. It reads the
grants, collects the processes, and narrows the listing query to them. It
answers a question nobody asks. A report reads one process, and the admin
instances screen runs as an operator.

The predicate also changes what an empty result means. A caller could no
longer tell an empty process from an ungranted one. Leave it until somebody
wants a listing spanning processes.

### A grant holder omitting `processId` gets 403, not 400

A 400 would tell that caller what to send. It would also rewrite two existing
scenarios in `http-wrapper`, which state 403 for this exact shape of request.
Keeping 403 leaves every existing scenario true word for word. It also leaves
the route with no new error path. The trade is a less helpful message for one
caller, addressed under Risks.

### The check runs before the read, in the branch that already exists

The listing handler resolves the actor, parses `scope`, then builds the
filter. Its `scope=all` branch already sits between those two points, and
already holds `db`. The check therefore moves in place. It does not reshape
the route. The enclosing handler is async, so awaiting `requirePermission`
costs no restructuring.

## Risks / Trade-offs

- A grant holder omits `processId` and reads a 403 naming `ADMIN_ROLE` → The
  branch raises its own error text instead. It names the missing `processId`
  rather than the role. The status code stays 403, so no
  scenario changes.
- One extra database round trip per non-admin `scope=all` call → Bounded by
  construction. `can` reaches the store only after the
  short-circuit fails. An operator and an unauthenticated caller both pay
  nothing.
- A later per-instance visibility rule could make process-level read look
  redundant → The two compose rather than collide. Process-level read stays
  the coarse gate, and a per-instance rule narrows inside it.
- An operator grants the read permission and expects the reporting views to
  follow → They do not, in this change. The three reporting routes keep
  `REPORTS_ROLE`. The follow-up change owns that migration.

## Migration Plan

None. No table changes, no backfill, no deployment step. The
`permission_grants` table stores `permission` as `text`
(`src/engine/store.ts:312`), so a read row needs no column change.

Rollback is the revert. A stored read row then matches no permission the code
defines. The grant lookup answers false over it. The route returns to the
plain `ADMIN_ROLE` test.
