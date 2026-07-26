## Context

Every `ActorResolver` (`devHeaderResolver`, `jwtResolver`) already resolves a
trusted `Actor { id, roles }`; local accounts already carry an arbitrary
`roles: string[]` (`auth_users.roles`, set via `createUser`/`setRoles`,
already exposed by the existing `cli.ts`); JWT already carries roles via a
configurable claim. None of that is consulted for permission today — `roles`
exists end-to-end but nothing reads it except `Step.assignment` (a *business*
concept: who may act on a step, resolved per-instance) which is unrelated to
*administrative* authorization (who may publish a definition or cancel an
arbitrary instance). Two Runtime API Layer operations currently perform no
permission check at all beyond "the credential resolved to *some* `Actor`":
`publishBody` (invoked from `handlePublish`, which resolves an actor only to
discard it) and `cancelInstance` (already takes `actor: Actor`, but never
inspects it for permission — only for the resulting `HistoryEntry`).
`submitAndTransition`/`claimStep`/`releaseClaim` are out of scope: they are
already gated correctly by assignment/claim (`NotACandidateError`,
`NotClaimantError`, etc., `assignment-claim-enforcement`, DONE).

## Goals / Non-Goals

**Goals:**
- Gate `publishBody` and `cancelInstance` behind a reserved role, reusing the
  `Actor.roles` array that already flows end-to-end.
- A caller lacking the role gets a distinct, typed error mapped to HTTP 403,
  following the exact pattern `mapError` already uses for
  `NotAssignedError`/`NotACandidateError`/etc.
- Zero schema change: `Actor`, `auth_users`, and the CLI already support
  arbitrary roles; granting the new reserved roles needs no new tooling.

**Non-Goals:**
- A general permission/policy engine, per-process or per-instance ACLs, or a
  role hierarchy. Two reserved role strings, checked directly — the same
  "no extension point" precedent as `Step.assignment.strategy.type`
  (single hardcoded `"static"` check, not a pluggable strategy registry).
- Self-service cancellation: an instance's own starter cancelling without the
  reserved role. Nothing else in the engine grants permission by
  `Instance.startedBy` identity — `submitAndTransition`/`claimStep` gate
  purely via assignment/claim, never via who created the instance. Adding a
  starter-exemption here would introduce a permission concept unique to this
  one operation. If a real need for it shows up, it is a small, separate
  follow-up (`actor.id === instance.startedBy` as an additional allow
  condition) — not worth speculatively building now.
- Changing `ActorResolver`, `devHeaderResolver`, or `jwtResolver`. This change
  only reads `actor.roles`, which both already populate.
- "Act as any actor id it is assigned" (mentioned in
  `docs/current-state.md`'s Authentication entry alongside the two real gaps)
  is not a gap: every resolver already binds `Actor.id` to the credential
  itself (JWT `sub`, or the dev resolver's `X-Actor-Id`), and
  `assignment-claim-enforcement` already restricts who may act on an
  assigned step to that resolved identity. Nothing to add here.

## Decisions

**Two reserved role strings, not one.** `system:publish` gates `publishBody`;
`system:cancel-any` gates `cancelInstance`. Considered a single `system:admin`
role covering both: rejected because publishing process definitions and
cancelling running instances are operationally distinct (a process author is
not necessarily someone who should be able to kill in-flight work, and vice
versa), and the cost of two constants over one is nothing. A `system:` prefix
documents that these are reserved, engine-defined roles distinct from
whatever free-form business roles (`"finance-approver"`, etc.) a deployment
assigns for `Step.assignment` — not structurally enforced (roles are still
plain strings), just a naming convention, same spirit as the `core.` prefix
reserved for internal action types.

**New module `src/auth/authorize.ts`**, not folded into `resolve.ts`.
Resolution (credential → `Actor`) and authorization (`Actor` → allowed/denied
for an operation) are separate concerns today (`resolve.ts`'s own docstring:
"Enforcement... and resolution are deliberately decoupled") — this keeps that
split. Exports:
- `PUBLISH_ROLE = "system:publish"`, `CANCEL_ANY_ROLE = "system:cancel-any"`
- `AuthorizationError extends Error` — thrown when `actor.roles` lacks the
  required role.
- `requireRole(actor: Actor, role: string): void` — throws
  `AuthorizationError` if `role` is absent from `actor.roles`; otherwise
  returns.

**Check placement: at the call site that already has the `Actor`, not
threaded deeper.**
- `handlePublish` (`src/http/routes.ts`): call `requireRole(actor,
  PUBLISH_ROLE)` right after `resolveActor`, before parsing the request body
  or calling `publishBody`. `publishBody`'s own signature
  (`processId, authoredBody, registry, dataSourceRegistry, db`) gains no
  `actor` parameter — it has no other caller, and every existing caller of
  `publishBody` already sits behind an HTTP route that resolves an actor.
  Threading `actor` through `publishBody` → the registry-check /
  cross-process-validation pipeline for a check with zero interaction with
  any of that logic would be pure ceremony.
- `cancelInstance` (`src/runtime/api.ts`): call `requireRole(actor,
  CANCEL_ANY_ROLE)` as the first statement, before `loadInstanceForRead`. It
  already takes `actor: Actor`, so this is a one-line addition. Checking
  before the DB read is both cheaper (no wasted query for a caller who was
  never going to be allowed) and consistent with a context-free check having
  no reason to wait on data unrelated to it.

**Error mapping.** `mapError` (`src/http/errors.ts`) gains one branch:
`AuthorizationError` → `403`, `{ error: { type: "authorization", message }
}` — placed alongside the existing `NotAssignedError`/`NotACandidateError`/
`AlreadyClaimedError`/`NotClaimedError`/`NotClaimantError` 403 branches,
distinct from `ActorResolutionError`'s `401` (401: no valid identity at all;
403: valid identity, insufficient permission — the standard split, and
already the split this file uses between `ActorResolutionError` and every
`Not*`/`AlreadyClaimed*` error).

## Risks / Trade-offs

[An operator publishes/cancels today via a script or CI pipeline using an
account with no role set] → After this ships, every such account needs the
reserved role granted (`cli.ts set-roles <email> system:publish,system:cancel-any`)
before its next publish/cancel call, or it starts getting 403s. This is the
proposal's stated **BREAKING** change, not a bug — call out explicitly in the
migration plan below rather than softening it with a grandfathering
mechanism nothing asked for.

[Role string typos are silent] → `"sytem:publish"` granted to a user simply
never matches `PUBLISH_ROLE` and that user gets 403 with no signal it was a
typo, not a real denial. Mitigated by exporting the two constants so any
tooling/scripts reference them instead of hand-typing the string; a
dedicated typo-detection mechanism (e.g. a known-roles enum enforced at
`setRoles`) is not built — `roles` is deliberately free-form for
`Step.assignment` too, and constraining it now would be a bigger, unrelated
change.

## Migration Plan

1. Ship `src/auth/authorize.ts`, the two call-site checks, and the
   `mapError` branch together (one PR/change) — there is no safe
   intermediate state where only one of publish/cancel is gated, so no
   incremental rollout is meaningful.
2. Before/at deploy, grant `system:publish` and `system:cancel-any` to every
   account that legitimately needs them (CI/automation accounts, process
   administrators, ops/incident-response accounts) via the existing
   `cli.ts set-roles` command — no new tooling required.
3. Rollback is a plain revert: no data migration, no schema change:
   `auth_users.roles` is untouched by this change, so reverting the code
   instantly restores today's unrestricted behavior with no cleanup.
4. Update `docs/current-state.md`'s Authentication entry and `ROADMAP.md`
   stage 7 to record the gap as closed, per the proposal's Impact section.

## Open Questions

None — the two operations, the role vocabulary, the check placement, and the
error mapping are all settled above. If a future need for finer-grained
authorization (per-process publish rights, self-service cancel, a role
hierarchy) materializes, it is a separate change built on this one, not a
gap left open here.
