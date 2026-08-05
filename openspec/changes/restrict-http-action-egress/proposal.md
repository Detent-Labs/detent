## Why

The `http.request` handler reaches any address a process author types. Its
config validates `url` as `z.string().url()` and nothing more. The handler
then calls `fetch` with the default redirect behavior. It writes the response
body back into `instance.data` through `Action.output`, where any participant
who may view the instance reads it.

That combination is a server-side request forgery primitive with a read-back
channel. An author can reach the cloud metadata address
`http://169.254.169.254/`, the Postgres port, an internal admin panel, or the
engine's own `/admin/*` routes. All of it runs from inside the network
perimeter. The result arrives in an ordinary instance view.

A host allowlist alone would not hold. The default redirect behavior follows
an allowlisted host that answers `302` to `169.254.169.254`, and the
allowlist never sees the second hop.

Reaching this needs `system:publish`, which lowers the severity. It does not
close the finding. A BPM engine exists so that business developers author
processes. Their blast radius ends at their own processes, or the role means
little. The definition is also the artifact environment promotion carries
between environments as a file.

The 2026-08-01 code review (`docs/CODE_REVIEW.md`) records this as SEC-2.

## What Changes

- **BREAKING** for any deployment that already uses `http.request`: the
  handler reads `HTTP_ACTION_ALLOWED_HOSTS`, a comma-separated list of hosts.
  A target outside that list is a permanent delivery failure. An unset or
  empty variable denies every outbound request, which follows
  `CORS_ALLOWED_ORIGINS`, where unset permits nothing.
- The handler refuses a URL whose scheme is not `https:`. A deployment that
  needs plain HTTP sets `HTTP_ACTION_ALLOW_INSECURE=1`, which the devcontainer
  and the test suite both set.
- The `fetch` call moves to `redirect: "manual"`. A 3xx answer then reaches
  the existing status branch, which already classifies it as a permanent
  failure. Without this, the allowlist checks the first hop alone.
- Both refusals throw `PermanentError`, so the outbox dead-letters the row
  instead of retrying an address it will never reach.

The check runs at delivery, not at publish. See design.md for why.

Out of scope, and named so the reason survives. The handler does not resolve
the target hostname, and it rejects no private or link-local address. That
step would close DNS rebinding, where an allowlisted name resolves to
`169.254.169.254` for one request. The allowlist and `redirect: "manual"`
carry most of the value. The resolution step needs its own decision about
caching, and about which ranges count as private.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-action-handler`: a new requirement covers the egress policy. The
  failure-classification requirement gains the two new permanent cases.

## Impact

- `src/handlers/http.ts`: the `fetch` call and a new policy check ahead of it.
- `docs/authoring-guide.md`: the `http.request` section states what an author
  may target.
- `docs/current-state.md`: the handler entry.
- Two new environment variables, `HTTP_ACTION_ALLOWED_HOSTS` and
  `HTTP_ACTION_ALLOW_INSECURE`.
- `.devcontainer/docker-compose.yml`: both variables, so the dev server and
  the test suite reach a local target.
- `test/handlers-http.test.ts`: every case targets `http://localhost:<port>`
  and needs both variables set.
- `examples/expense-approval.json` carries an `http.request` action. It stays
  valid, because the check is not a publish check.
