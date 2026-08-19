## Context

See proposal.md - Why. `can(actor, "migrate", processId, db)`
(`src/auth/authorize.ts`) and `src/auth/grants.ts` already ship. The three
migration-plan HTTP routes already call `requirePermission(actor, "migrate",
...)`. Only the client's show-or-hide decision, and the two spec files that
describe access to those routes, still name `system:developer` alone.

`VersionsScreen` already fetches `getDraft(processId, token)` on load. It
fetches this alongside `listVersions`. That response is the natural carrier
for a new field. It is per-process. It is already fetched once per screen
visit. Nothing outside the studio area depends on its shape.

## Goals / Non-Goals

**Goals:**
- Make the Studio Versions screen's "Plan migration" control agree with the
  server. The server's `can()` check already decides who may act on the
  process in view.
- Correct the two spec files whose text still names `system:developer` as
  the sole gate on behavior the code already widened.

**Non-Goals:**
- No general permissions-boolean framework across resource views. An audit
  of Publish, Cancel and area entry found no second case that needs one.
- No change to server-side enforcement. `requirePermission` on the three
  migration-plan routes keeps its current logic.
- No change to `Tools`. It names no process, so no grant type reaches it.

## Decisions

**Carry `canPlanMigration` on `GET /drafts/:processId`, not on `GET
/processes/:processId/versions`.** The versions route returns a bare
`VersionSummary[]` array with no per-process wrapper. Adding a field there
would mean wrapping every caller's response in an object. That is a
breaking change to a route other than the one this proposal needs. The
draft route already returns an object per process, and `VersionsScreen`
already fetches it. This adds one field, additive, on a response already
in flight.

**Compute the field with the existing `can()`, not a new check.** The seam
is one process-scoped `can(actor, permission, processId, db)`, by design
(`authorization`). Reusing it here keeps one place answering "may this
actor migrate this process." A second check would duplicate its two-test
logic: the global role, then `hasGrant`.

**Widen `ROUTE_ROLE.migrate` to `AUTHORING` rather than adding an async
gate to the router.** The router's `may(roles)` check is synchronous. It
reads the cached session roles alone. A per-process boolean needs a
network call the router does not make. Widening the static gate to
"developer or author" lets the route mount for both roles.

The real show-or-hide decision then moves inside `VersionsScreen`, driven
by the already-loaded `canPlanMigration`. An actor with neither the role
nor a grant may still call the route directly. The route still meets that
actor with the same graceful 403 handling Publish and Cancel already use.
This mirrors how `edit` and `versions` already work: reaching the route
does not, by itself, mean every control inside it is available.

## Risks / Trade-offs

[An author with no role or grant can reach the migrate URL `ROUTE_ROLE`
blocked.] → The screen still hides the control. A direct call still meets
the server's existing 403. Publish and Cancel already carry this same
risk. The server stays the real gate for both.

[`canPlanMigration` goes stale if an admin revokes a grant between the
draft fetch and the click.] → `requirePermission` re-checks on the actual
`PUT /migration-plans/...` call. A stale `true` cannot let a revoked grant
through. Every role-derived UI affordance already carries this same
staleness window.

## Migration Plan

No data migration. The field is additive on an existing response, so no
existing consumer reads an unexpected shape. Deploy stays a normal rolling
release. The server change and the client change land in the same release.
An old client against a new server keeps working, since it reads no such
field. A new client against an old server reads `undefined` as falsy and
falls back to hiding the control, a safe degradation.

## Open Questions

None. Three questions drove this design. Which resource view carries the
field? Which check computes it? How should the route gate widen? This
document answers all three.
