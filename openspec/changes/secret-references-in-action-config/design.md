# Design

## Context

Take one case. An author publishes version 3 of `partner-order` with a header `Authorization: Bearer sk_live_1`. The token now sits in the version's `ProcessBody`, which nothing deletes. Every transition into the step writes the whole action into `outbox.action`. Rotation means version 4, while version 3 and the old rows keep `sk_live_1`.

With this change the author writes `"Authorization": { "env": "PARTNER_API_TOKEN" }`. Version 3 holds that object, and so does each outbox row. The handler reads `PARTNER_API_TOKEN` from the process environment when it delivers. Rotation is a new variable value and an engine restart. See `proposal.md` for the owner rulings.

Today `http.request`'s `configSchema` is `src/handlers/http.ts::httpConfigSchema`. Its `headers` key is `z.record(z.string(), z.string())`. The registry checks it at publish. The outbox hands the handler `row.action.config` unchanged.

`HandlerContext` carries `db` and `assignmentRegistry` and no tenant. The host builds one context per tenant (`host.ts::tenantContexts`) and keys it by `TenantHandle.key`. That key is `""` for a single-tenant deployment.

## Goals / Non-Goals

**Goals:**

- No credential value reaches the definition, a draft, the JSON surface, an outbox row or a handler message.
- The operator, not the author, decides which variables an author can name.
- A later secret store adds one union member and changes no stored body.

**Non-Goals:**

- References in `url`, `body` or another plugin. The owner ruled them out.
- A publish-time check of the allowlist. See decision 4.
- Scoping a name to one process. An allowlisted name works for every author of the tenant.

## Decisions

**1. The header value is `string | { env: NAME }`, a strict object.**

The record's value type becomes a union of the string and `z.strictObject({ env })`. `NAME` matches `^[A-Z][A-Z0-9_]*$`. An unknown key, a lower-case name or a second reference shape fails at publish.

A string value stays valid, so no published body changes. No `definitionHash` moves. `src/schema/definition.ts` stays as it is, since `config` is opaque there. A later `{ secret: id }` is one more union member.

*Alternative:* an interpolation syntax such as `Bearer ${env:X}` inside the string. It lets one header hold a prefix and a secret. It also needs an escape rule for a literal `${` and a parser in every future position. The object form wins on that cost.

The object form has one price: the variable holds the whole header value. For `Authorization: Bearer sk_live_1` the operator stores `Bearer sk_live_1`. The runbook and the guide state this.

**2. Resolution happens inside the handler, at delivery.**

`buildHeaders` replaces each reference after the egress check and before `fetch`. The outbox, the registry and the engine core stay generic. The row keeps the authored `action`, so the claim, retry and dead-letter paths need no change.

*Alternative:* resolve in the outbox before the handler. That puts one plugin's rule into the core. It also hands the resolved action to every handler through `ctx.action`.

**3. Scope per tenant with `tenant:NAME` entries, not a name prefix.**

The owner asked for a per-tenant scope and offered a tenant prefix as an example. A prefix fails on overlap. Tenant `acme` would own `ACME_*`, so its author could name `ACME_CORP_TOKEN`, which belongs to tenant `acme_corp`. Keys `acme-eu` and `acme_eu` would also map to one prefix.

An explicit pair has neither fault. It also lets the operator name the variable freely.

In a deployment with many tenants, `ctx.tenant` is non-empty. The handler then reads only entries of the form `tenant:NAME` whose tenant equals `ctx.tenant`. In a deployment with one tenant the handler reads only entries without a colon. Each side ignores the other's form. An entry that never matches refuses, so a mixed-up list fails closed.

**4. The allowlist applies at delivery, not at publish.**

`HTTP_ACTION_ALLOWED_HOSTS` also applies at delivery. A definition then stays portable between a staging and a production environment that list different names. The cost: an author learns of a refused name from a dead-lettered row and not from the Checks tab. The message names the variable, and the runbook says where to look.

*Alternative:* refuse at publish. It gives early feedback. It also ties a published, immutable version to one environment's list.

**5. Every refusal is permanent and carries the name only.**

A retry meets the same environment, so each refusal throws `PermanentError`. Four cases refuse. They are a name outside the list, an unset variable and an empty value. The fourth is a value outside the legal header set (`[\t\x20-\x7e\x80-\xff]`). The legal-value check runs before `fetch`.

Without that check the transport could raise a message that quotes the offending header. The outbox stores message text in `last_error`, which the admin area shows. No message and no log line includes a value. A test asserts this with a value that holds a line break.

**6. `HandlerContext` gains an optional `tenant`.**

`deliver` takes the key as an optional fifth parameter. `tenantContexts` adds the key to its per-tenant context, and the host passes it on. An optional field leaves every other call site of `drainOutbox` and `deliver` alone. An absent value reads as the single-tenant form. The host is the one production caller, and a test pins that it passes the key.

**7. The studio changes nothing.**

`describeConfigSchema` returns no descriptor for `http.request` today, because `headers` is a record and `body` is `unknown`. The studio shows the raw JSON input and keeps showing it. A union value does not alter that. A purpose-built header editor is a later change.

**8. No change to `process-contract.md` or `definition.ts`.**

The rule belongs to one handler's `configSchema`. `docs/authoring-guide.md` teaches it, as the project rule requires for an authoring rule.

## Risks / Trade-offs

- **Wide reach.** A listed name serves every author and every host. The runbook says to list a name only if all authors may use it. It also says to keep hosts few. Per-process scoping waits for the secret store.
- **A host that echoes request headers returns the token to the author through `Action.output`.** → Out of reach for this change. The runbook names the risk beside the host list.
- **The variable holds the whole header value**, including a `Bearer ` prefix (decision 1). → The runbook and the guide state it. A prefix-aware union member can come later without changing a stored body.
- **A future `deliver` caller that forgets the tenant argument reads as single-tenant.** → An unscoped entry then works for that caller. Only `host.ts` calls `deliver` in production, and its test pins the key.
- **Literal credentials already in a body stay readable.** → Out of scope by ruling. A reference is the new path and no ban follows.

## Migration Plan

No data migration. A string header keeps its meaning. The new variable defaults to refuse-all, so a deployment gains nothing until the operator lists a name.

A revert after an author published a reference leaves that version failing the old `z.string()` schema at delivery. Its rows then dead-letter. The author republishes with literal headers, or the operator keeps this version.

## Open Questions

None. The owner settled both questions on 2026-10-12.
