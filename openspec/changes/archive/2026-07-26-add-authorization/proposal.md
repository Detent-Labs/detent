## Why

Every authenticated actor currently keeps full permissions: any account that
can resolve to an `Actor` at all can publish a process definition or cancel
any instance, regardless of its `roles`. This is a known, deliberately
recorded gap (`docs/current-state.md`, "Authentication" entry;
`ROADMAP.md` stage 7) — JWT/local-account authentication narrowed reachability
from "anyone" to "anyone with an account", but never closed it. Claim/release
on assignment-bearing steps is a separate concern and already correctly
gated (`assignment-claim-enforcement`, DONE) — an actor may only act on a step
it is an assignment candidate for and has claimed. This change closes the
remaining gap: process-admin-level operations that today have no role check
at all.

## What Changes

- Introduce a reserved-role check gating two operations that currently have
  none: **publish** a process definition, and **cancel any instance**
  (cancelling an instance the caller did not start or is not assigned to).
- Reuse the `Actor.roles` array every `ActorResolver` already resolves
  (`devHeaderResolver`, `jwtResolver`) and that local accounts already carry
  (`auth_users.roles`, set via `createUser`/`setRoles`) — no new identity
  model, no new resolver, no schema change to `Actor` or `auth_users`.
- A caller whose resolved `Actor.roles` lacks the required role gets a
  distinct, typed authorization error, mapped to an HTTP 403 (as opposed to
  401 for an unresolvable/absent credential) — never a silent no-op or a
  downgraded response.
- **BREAKING** for any deployment already relying on today's open behavior:
  an existing local account or JWT-issued identity that does not carry the
  new reserved role loses publish / cancel-any-instance access until
  explicitly granted it. The dev header resolver remains unaffected in kind
  (still non-production, still trusts whatever `X-Actor-Roles` the caller
  sends) — the gate applies equally to it, so local/dev use only needs the
  header updated.
- Explicitly out of scope: a general permission/policy engine, per-process or
  per-instance ACLs, and any change to claim/assignment enforcement (already
  correct). This is two specific reserved-role checks, following the same
  "no extension point, checked directly" precedent as
  `Step.assignment.strategy.type`.

## Capabilities

### New Capabilities
- `authorization`: the reserved-role vocabulary, the role-check helper, and
  the distinct authorization error/HTTP mapping that `runtime-api` and
  `http-wrapper` build on.

### Modified Capabilities
- `http-wrapper`: both HTTP-facing operations this change gates —
  `POST /processes` (`handlePublish`) and
  `POST /instances/:id/cancel` (`cancelInstance`, called from the cancel
  route) — already have their full request/response contract, including
  error-mapping scenarios, specified in this capability (`http-wrapper`
  spec's "Publish a process body over HTTP" and "Cancel an instance over
  HTTP" requirements); this change adds the 403 scenario each requirement
  is currently missing. `cancelInstance` itself lives in the Runtime API
  Layer (`src/runtime/api.ts`), but has no separate `runtime-api` spec entry
  of its own today — its behavior is specified entirely at the HTTP
  boundary, so the delta stays there too.

## Impact

- `src/auth/` — new role-check helper alongside `resolve.ts`; no change to
  `ActorResolver`, `devHeaderResolver`, or `jwtResolver` themselves.
- `src/runtime/api.ts` — `cancelInstance`.
- `src/http/routes.ts` — `handlePublish`; `src/http/errors.ts` — new
  error-to-403 mapping.
- `src/auth/users.ts` / `cli.ts` — no schema change (`roles` is already
  `string[]`); CLI usage guidance for granting the reserved role(s).
- `packages/editor/src/player/` — no functional change expected; a
  non-privileged account will start seeing 403s on publish/cancel actions it
  previously could perform, which the existing error-surfacing path should
  already render.
- Tests: publish and cancel-instance authorization scenarios (granted role
  succeeds, missing role rejected with 403, existing claimant-only /
  publish-validation behavior unchanged for a caller that does hold the
  role).
- Docs: `docs/current-state.md` "Authentication" entry and `ROADMAP.md`
  stage 7 update once this lands, closing the recorded gap.
