# Proposal

## Why

An author who connects a partner API that needs `Authorization: Bearer sk_live_...` has one means today: a literal in `http.request`'s `config.headers`. The token then sits in the draft, the JSON surface and the published `ProcessBody`. Nothing deletes a published version. Every transition also copies the whole action, `config` included, into `outbox.action`.

Rotating the token means publishing a new version. The old version and every old outbox row keep the old token. SMTP credentials already come from the environment, so only HTTP credentials lack that path (audit finding G-5).

## What Changes

- A header value in `http.request`'s `config.headers` accepts a string or a reference object `{ "env": "NAME" }`. The handler resolves the reference at delivery, from the process environment. The body, the draft and the outbox row keep the reference.
- A new operator variable `HTTP_SECRET_ENV_ALLOWLIST` names the variables a reference may read. Unset or empty refuses every reference, the way `HTTP_ACTION_ALLOWED_HOSTS` refuses every host. Without the list, an author could send `AUTH_JWT_SECRET` or `DATABASE_URL` to an allowlisted host and read it there.
- In SaaS mode an entry names a tenant: `acme:PARTNER_API_TOKEN` lets only tenant `acme` read that variable. SaaS mode ignores an unscoped entry. `HandlerContext` gains the tenant key for this check.
- A delivery fails permanently in four cases. The name is outside the list. The variable is unset. The value is empty. The value is no legal header value. The message names the variable and never prints a value.
- The reference shape is one member of a union in the header-value schema. A later per-tenant secret store adds a member such as `{ "secret": "id" }` and changes no stored body.
- The studio keeps its raw JSON input for `http.request`'s config, which has no generated form today. A purpose-built header editor is a separate later change.
- The runbook, the authoring guide and the README gain the new variable and rule.

Out of scope, by owner ruling of 2026-10-12:

- References in `url` and `body`. A `{ "env": ... }` object is a legal literal body.
- Other plugins, and a secret store.
- A scan or ban of literal credentials already in a body.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-action-handler`: the config schema admits a reference as a header value. A new requirement states the resolution at delivery, the operator allowlist with its tenant form, and the failure classes. The request-building requirement admits the resolved value as a second source beside `action.config`.
- `deployment-runbook`: a new requirement states how the runbook explains the allowlist, its SaaS entry form and token rotation.

## Impact

- `src/handlers/http.ts`: header-value schema, reference resolution, allowlist check.
- `src/engine/registry.ts`, `src/engine/outbox.ts`, `src/engine/host.ts`: the tenant key reaches `HandlerContext`.
- `docs/runbooks/deployment.md`, `docs/authoring-guide.md`, `README.md`: the variable and the rule.
- Tests: `test/handlers-http.test.ts`, and a DB test that drives a reference through a transition, the outbox row and `deliver`.
- `src/schema/definition.ts` stays as it is. The header value lives inside the handler's own `configSchema`. A string value stays valid, so every published `definitionHash` stays the same.
