## Context

See `proposal.md` for the motivation. `handleView` in
`src/http/reporting-routes.ts` already resolves `processId` before its gate
closure runs. `route()` (`src/http/routes.ts`) already accepts an async
gate: `(actor: Actor) => void | Promise<void>`.

The functions `can` and `requirePermission`, in `src/auth/authorize.ts`,
already exist. They already run this exact check for
`handleExecuteReport` and `previewReportDraft`. Today they run at a
different call site: inside the Runtime API Layer, not the route gate.

## Goals / Non-Goals

**Goals:**
- Give the three aggregate routes the same `read` gate the report
  execute/preview routes already carry. Run it at the route layer, before
  any query runs.
- Fold both checks into one small helper. A future fourth process-scoped
  reporting route then inherits both by construction.

**Non-Goals:**
- No change to how an operator stores, administers, or resolves a grant.
  `can` and `requirePermission` keep their existing signatures and
  behavior.
- No result-set filtering (`scope=all`-style predicate). A failed `read`
  check on these three routes stays a `403`. It does not narrow or empty
  the result.
- No change to the nine other `/reporting/*` routes.

## Decisions

**Gate placement: the route layer, not the Runtime API Layer.**
`handleExecuteReport`/`previewReportDraft` check `read` inside
`src/runtime/api.ts`. Those two functions also decide report *membership*
(viewers/editors), a check with no HTTP-only meaning. The three aggregate
views carry no membership concept, and no non-HTTP caller today.

The gate therefore belongs where `REPORTS_ROLE` already lives: the
`route()` gate closure in `reporting-routes.ts`. That keeps the check
beside its sibling role check. Both the proposal and the `authorization`
spec already name that file as owning it.

**Failure mode: throw, not degrade.** `executeReport` and
`previewReportDraft` degrade to an empty result on a failed `read` check.
Report sharing (`viewers`/`editors`) is a real, independent grant a holder
may have even without process `read` access. Degrading preserves that the
recipient still sees the report shell. No such sharing concept exists for a
direct aggregate view. An actor either may see this process's numbers, or
may not.

`requirePermission` throws `AuthorizationError` on failure. `guarded()`
already maps that failure to `403`. That matches the `REPORTS_ROLE` check
beside it.

**One helper, not two inline checks per route.** `handleView` already runs
once for all three routes. A single well-placed `requirePermission` call
there would already cover them. A named helper (for example
`requireReportingAccess(actor, processId, db)`) still earns its extra
indirection. It names the two-part rule once. It gives that rule one place
to test. It is what a fourth process-scoped reporting route would reach
for, instead of copying `requireRole` plus `requirePermission` by hand.

**Alternative considered and rejected: extend `can`'s short-circuit.** One
option maps `read` to `REPORTS_ROLE` as a second short-circuit role. It
would sit alongside `ADMIN_ROLE`. Under that option a bare `REPORTS_ROLE`
holder would pass the `read` check with no grant at all.

This change rejects that option. `docs/decisions.md` already settles that
`REPORTS_ROLE` and `read` answer two different questions. A
`PERMISSION_ROLE` entry names only one role per permission. Widening it
would let a `REPORTS_ROLE` holder skip the grant check everywhere `read`
gets asked, not just on these three routes.

## Risks / Trade-offs

- **[Risk] An installation granted `REPORTS_ROLE` to every reporting
  account.** It expected that role to cover every process. Those
  `system:reports`-only accounts lose aggregate access on deploy. This loss
  is the proposal's stated **BREAKING** change, not an accident.
  Mitigation: an operator grants `read` per process, or grants
  `ADMIN_ROLE`, before or right after deploy.
  `process-read-permission` already documented the same remediation for
  `scope=all`.
- **[Risk] A shared helper hides which of the two checks failed.** A log
  reader sees one thrown `AuthorizationError`, not two. Mitigation: that
  thrown `AuthorizationError` already names the missing role or permission
  on its own (`src/auth/authorize.ts:115-120`). The helper needs no catch,
  and no rewrap.

## Migration Plan

No data migration runs. No route signature changes. Only the gate closure
inside `handleView` changes.

Deploy is a normal code release. An operator who wants zero-downtime
continuity for an existing `system:reports`-only integration writes its
`read` grant before the release reaches production. Granting `ADMIN_ROLE`
instead works too.

## Open Questions

None. `docs/decisions.md` settled the shape on 2026-08-25. This design
applies it and leaves no new choice open.
