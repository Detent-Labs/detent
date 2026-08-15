# Deployment

What a deployment configures before it runs either image. This runbook is the
one home for that list. `README.md` carries the commands that build and run
the two images. It points here for the rest.

Two images exist. `docker/engine.Dockerfile` builds the engine. The engine
reads its configuration from the container environment.
`docker/frontend.Dockerfile` builds the browser bundle behind nginx. That
image reads one build argument and no runtime variable.

## Runtime variables the engine reads

The engine reads twenty-one variables. A blank cell in the last column means the
default is safe for a deployment.

| Variable | What it controls | Mandatory | Default | Unsafe default, and what to set |
|---|---|---|---|---|
| `DATABASE_URL` | The Postgres connection string. | Yes | None. | |
| `PORT` | The TCP port the HTTP server binds. | No | `3000` | |
| `WEB_ROOT` | The directory of the built browser bundle the engine serves. | No | `packages/web/dist`, beside the engine source. | |
| `AUTH_JWT_SECRET` | The local HS256 signing key. Its presence registers `POST /auth/login`. | One of three, see below. | None. | |
| `AUTH_ISSUERS` | A JSON array of `{iss, jwksUrl, audience, rolesClaim}`. It accepts tokens an external issuer signs. | One of three, see below. | None. | |
| `ALLOW_INSECURE_DEV_AUTH` | `1` disables authentication. The engine then trusts the actor headers as sent. | One of three. | Unset. | Never `1` here. Configure `AUTH_JWT_SECRET` or `AUTH_ISSUERS` instead. |
| `CORS_ALLOWED_ORIGINS` | A comma-separated origin list for the CORS headers. | No | Unset, which emits no CORS header. | The value `*` allows every origin. Name the origins the browser bundle answers from. |
| `DATA_RETENTION_DAYS` | The age at which the sweep deletes a terminal instance. A positive integer. | No | Unset, which runs no sweep. | |
| `LOG_LEVEL` | The emission threshold: `debug`, `info`, `warn` or `error`. | No | `info` | |
| `MAX_ATTACHMENT_BYTES` | The size bound on one decoded upload. A positive integer. | No | `5242880`, which is 5 MiB. | |
| `ASSIGNMENT_RESOLUTION_TIMEOUT_MS` | The deadline an assignment resolver gets. A positive number. | No | `5000` | |
| `METRICS_TOKEN` | The bearer token `GET /metrics` needs. An empty value counts as unset. | No | Unset, which leaves `GET /metrics` unregistered. | |
| `TRUST_PROXY` | `1` reads the caller's address from `X-Forwarded-For`. | No | Unset, which reads the peer address. | `1` without a proxy that overwrites the header. Read "The proxy rule" below first. |
| `HTTP_ACTION_ALLOWED_HOSTS` | A comma-separated list. It names the hosts the `http.request` action may reach. | Yes, for a definition using `http.request`. | Unset, which refuses every host. | |
| `TENANT_CONTROL_PLANE_URL` | The control-plane connection string. Its presence turns SaaS mode on. | No | Unset, which runs one tenant on `DATABASE_URL`. | Read "Serving many tenants" below first. |
| `HTTP_ACTION_ALLOW_INSECURE` | `1` permits a plain-HTTP target. | No | Unset. Then `https` alone. | `1` sends the request in the clear. Give the target a TLS certificate instead. |
| `SMTP_HOST` | The relay the `notification.email` action connects to. | Yes, for a definition using `notification.email`. | None. | |
| `SMTP_PORT` | The relay's port. | No | `587` | |
| `SMTP_USER` | The `AUTH PLAIN` username. Its presence needs a relay that offers STARTTLS. | No | Unset, which sends no credential. | |
| `SMTP_PASSWORD` | The `AUTH PLAIN` password. | No | Unset, which sends an empty password beside `SMTP_USER`. | |
| `SMTP_FROM` | The envelope sender address. | Yes, for a definition using `notification.email`. | None. | |

### Authentication is mandatory as a group

The engine reads three authentication variables, and needs one of the three.
It stops at start when a deployment configures none. It names what is missing.
`AUTH_JWT_SECRET` and `AUTH_ISSUERS` may both hold a value. The engine then
accepts a locally signed token and an externally signed one together.

`AUTH_JWT_SECRET` must encode to at least 32 bytes. HS256 needs a key at least
as long as its hash output. The engine stops at start on a shorter one. The
command `openssl rand -base64 32` prints a key of the right length.

### Two variables stop the engine on a bad value

`DATA_RETENTION_DAYS` and `MAX_ATTACHMENT_BYTES` each need a positive integer.
A value that is not one stops the engine at start, and names the variable.
Neither one keeps its default in silence. A mistyped retention value governs
an irreversible delete. An operator must learn about that at once.

`ASSIGNMENT_RESOLUTION_TIMEOUT_MS` and `LOG_LEVEL` differ. Each one keeps its
default on a value it cannot read, and stops nothing.

### The egress list denies by default

`HTTP_ACTION_ALLOWED_HOSTS` starts empty, and an empty list refuses every
host. A deployment that already runs `http.request` actions loses every target
the moment it takes this version. Those actions then exhaust their retries and
dead-letter. An operator repairs that in two steps. Name each target host in
the list. Then retry the dead-lettered rows from the admin area's outbox
screen.

Add the host alone, as `api.example.com`. The engine compares the target's
host against the list. An entry carrying a port or a scheme matches nothing.

## The build argument each image takes

A build argument differs from a runtime variable. Vite writes the argument's
value into the JavaScript at build time. A container environment variable of
the same name changes nothing afterwards.

| Argument | Image | What it controls | Mandatory | Default | Unsafe default, and what to set |
|---|---|---|---|---|---|
| `VITE_API_URL` | `docker/frontend.Dockerfile` | The address the browser bundle sends its API requests to. It also names the one origin the bundle's `connect-src` policy permits. | No. | Unset. Then every request goes to the origin that served the bundle. | |

The engine image takes no build argument.

Unset is the right value where the engine serves the bundle itself from
`WEB_ROOT`. There the bundle and the API share one origin. Set the argument
where nginx serves the bundle from a second origin. Give it the engine's
public address.

## The maintenance-script variable

| Variable | What it controls | Mandatory | Default | Unsafe default, and what to set |
|---|---|---|---|---|
| `SEED_ALLOW` | Any value permits `bun run seed`. | No | Unset, which refuses the seed. | |

The seed script creates demo accounts with a fixed, published password. One of
them holds `system:admin`. `.dockerignore` excludes no part of `scripts/`, so
the script reaches the engine image. Leave `SEED_ALLOW` unset in a deployment.

## The proxy rule

A proxy in front of the engine must overwrite `X-Forwarded-For`. It must not
append to it. A deployment sets `TRUST_PROXY=1` only after its proxy does so.

<!-- antislop: allow synonym-rotation -->
<!-- "caller" and "operator" name two different people here: the caller sends
     the login request, and the operator configures the deployment. The rule
     reads them as one concept. Merging them would make the passage wrong. -->
`POST /auth/login` limits its rate per caller address as well as per email
address. `TRUST_PROXY` decides where that address comes from. Unset, the
engine reads the peer address. Behind a proxy that peer is the proxy. Every
login then counts against one bucket, and ordinary traffic stays under the
threshold. Set to `1`, the engine reads the last comma-separated entry of
`X-Forwarded-For`.

The last entry is the one the nearest proxy wrote. A proxy that appends keeps
whatever the caller sent in front of its own entry. An engine reading the
first entry would then take a value the caller chose. That caller could change
the value on each request, and take a new bucket each time. A proxy that
overwrites the header leaves one entry. There the first and the last are the
same value.

`TRUST_PROXY=1` without such a proxy is worse than leaving it unset. Any
caller may send the header. Any caller may then choose its own bucket.

## Dependency review

A maintainer runs `bun audit` in the devcontainer:

```sh
bun audit
```

The cadence is monthly, and again at every dependency bump. The result goes in
the commit message of the change that answers it. An advisory with no answer
goes in `docs/decisions.md`, under the open questions. Record the date and the
package there.

No gate runs this check, on purpose. Each gate in `.githooks` covers a defect
class this repository produced more than once. A stale dependency is not one
of them yet. A gate that reaches the network also rejects a push made offline,
which no other gate does.

## Related

- `docs/runbooks/backup-restore.md` covers the database dump and the restore.
- `README.md` carries the commands that build and run the two images.

## Serving many tenants

Leave `TENANT_CONTROL_PLANE_URL` unset for a single-tenant install. The engine
then opens no control-plane connection. It builds one schema from
`DATABASE_URL`, and runs every request and every worker tick against it. That
is the deployment shape this runbook describes everywhere above.

Set it to serve many tenants from one process. Each tenant gets a database of
its own. The control plane holds nothing but the list of them: `id`, `key`,
`name` and `database_url`. No table anywhere gains a tenant column, and no
query gains a tenant filter. Isolation comes from the connection, so a
forgotten filter cannot leak one tenant's data into another's response.

Provision a tenant before it can sign in:

```
TENANT_CONTROL_PLANE_URL=... bun run src/tenancy/cli.ts add-tenant <key> <name> <database-url>
```

That creates the database and builds its schema. It lists the tenant last. A
break part-way therefore leaves nothing a request can reach. `list-tenants`
prints what the control plane holds. No HTTP route creates a tenant:
provisioning is yours, never a signup form.

A request finds its own database two ways. A token this engine issued carries
its tenant, minted at login. A token from an external issuer resolves by that
issuer, which `AUTH_ISSUERS` already maps.

The login request itself carries no token yet. It takes its tenant from the
host it arrived on, reading `acme` from `acme.example.com`. Point each tenant's
host at the same process.

Two answers are worth telling apart in a log. An unknown tenant reads 401, the
answer a bad token gets, so nobody learns your tenant list by probing. A known
tenant whose database is down reads 503. The first is the caller's to fix. The
second is yours.

Re-run the provisioning command's schema step after an upgrade that adds a
column, once per tenant database. Every schema statement is idempotent, so a
run against a current database changes nothing.
