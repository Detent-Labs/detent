## Why

`examples/expense-approval.json` does not run. Seed the devcontainer
database, start the server, and walk the example in a browser. It stops at the
`book` step and stays there. The README calls this file the complete Capture →
Review → Book example. It is the file `docs/authoring-guide.md` teaches every
rule from.

Three of the four action types it names fail against the registry the engine
ships.

**`accounting.postInvoice`**, on `book`'s `onEntry`, resolves to no handler.
`createDefaultRegistry()` in `src/engine/host.ts` registers two types,
`http.request` and `notification.email`. The outbox raises `no handler
registered for type: accounting.postInvoice` as a `PermanentError`
(`src/engine/outbox.ts:91`). The row dead-letters on the first try.
`booking_status` keeps its `pending` default. Both automatic paths out of
`book` guard on `booked` or `failed`, so neither one matches. The instance
waits a day for the SLA timer and then lands in `booking_error`.

`scripts/seed.ts` and `scripts/demo-expense-approval.ts` each register a dummy
handler for this type. Those registries satisfy publish-time validation in
their own process. Neither one reaches the server's outbox worker.

**`notify.email`**, on `review`'s reminder timer, resolves to no handler
either. It is also a stale name. The handler that ships is
`notification.email`, and the same example already names it at the escalation
step.

**`http.request`**, on `escalated_review`'s `onEntry`, targets
`https://example.com/hooks/expense-escalated`. I measured that host from the
devcontainer on 2026-08-06: a POST answers `405 Method Not Allowed`, and a GET
answers `404 Not Found`. A 405 is neither 2xx nor 429 nor 5xx, so
`src/handlers/http.ts:189` raises `PermanentError` and the row dead-letters.

`restrict-http-action-egress` set `HTTP_ACTION_ALLOWED_HOSTS: example.com` in
`.devcontainer/docker-compose.yml` on the same day. That entry lets the request
leave. It makes nothing answer it. The change recorded exactly that: it bought
a usable dev loop, not a green demo.

This is the only `http.request` target in the repository. Every other mention
is a test stub or a publish-validation case that never runs the real handler.

## What Changes

- A new devcontainer compose service, `webhook-sink`, answers every request
  with `200` and echoes the JSON body it received. It runs the devcontainer
  image the `app` service already builds, plus a new
  `scripts/dev-webhook-sink.ts`. No third-party image joins the stack.
- `book`'s `onEntry` action becomes `http.request` against that sink. Its
  `Action.output` expression becomes `result.body.status`, because
  `http.request` answers `{ status, headers, body }` and `status` there is the
  HTTP status number, not the booking outcome.
- `review`'s reminder timer sends `notification.email`. Its config becomes the
  literal `to` / `subject` / `body` that handler's schema takes, in place of
  the `template` / `toRole` pair no handler ever read.
- `escalated_review`'s `http.request` targets the sink instead of
  `example.com`.
- `HTTP_ACTION_ALLOWED_HOSTS` becomes `webhook-sink:8080`. `example.com`
  leaves the list, because nothing targets it any more.
  `HTTP_ACTION_ALLOW_INSECURE` stays at `1`: the sink speaks plain HTTP.
- `scripts/seed.ts` and `scripts/demo-expense-approval.ts` drop their dummy
  registrations. Every type the example names then resolves in
  `createDefaultRegistry()`, so the demo runs against the handlers a
  deployment runs.
- `test/view-layout-hash.test.ts` recomputes its `expense-approval.json`
  literal. Every item above changes the body, and the body is what that
  literal hashes.

Out of scope, and named so the reason survives:

- The engine gains no route and no handler. The sink lives in `scripts/` and
  in the devcontainer compose file, beside `mailpit`. `src/` carries no demo
  concern.
- This change touches neither production image.
  `openspec/specs/production-docker-images/spec.md` requires that the engine
  image set no application environment variable itself. It still sets none:
  `HTTP_ACTION_ALLOWED_HOSTS` lives in the devcontainer compose file, which
  that requirement does not reach.
- The example keeps every step, path, timer, field and id it has. Only the
  three action bodies change. So the escalation shape
  `openspec/specs/escalation-pattern/spec.md` pins survives. The `review` step
  keeps its reminder timer and its forcing escalation timer. The
  `escalated_review` step keeps its distinct assignment, its notifying
  `onEntry` action, and its approve and reject paths.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: the requirement that pins the devcontainer's
  `HTTP_ACTION_ALLOWED_HOSTS` names a new host and a reachable one. A new
  requirement covers the sink service itself, the way an existing requirement
  covers `mailpit`.

## Impact

- `.devcontainer/docker-compose.yml`: one new service, one changed
  `HTTP_ACTION_ALLOWED_HOSTS` value, two rewritten comments.
- `scripts/dev-webhook-sink.ts`: new, roughly thirty lines.
- `examples/expense-approval.json`: three action bodies. The body hash moves
  from `b90f7044c52a60a54093c7c92951ea0576ba611403b19420a0042cfeb2f20dd2` to
  a value the change measures.
- `test/view-layout-hash.test.ts`: one literal and the comment above it. See
  design.md, which explains what the recomputed literal still proves.
- `test/http.test.ts` and `test/runtime-api.test.ts`: three cases stub
  `http.request` with a handler answering `{}`. `book`'s new `Action.output`
  reads `result.body.status` from that answer, and an `Action.output` entry
  that cannot read `result` raises. Each stub gains a body.
- `scripts/seed.ts`, `scripts/demo-expense-approval.ts`: the dummy
  registrations and the roadmap comments above them go.
- `docs/authoring-guide.md`: the actions section names the example's three
  actions.
- `docs/current-state.md`: the devcontainer entry that records
  `HTTP_ACTION_ALLOWED_HOSTS=example.com`.
- `README.md`: the example table row.

The body hash moves, so an already seeded database gains a second published
version on the next seed. Instances pinned to version 1 keep the old body and
keep dead-lettering. Drop the `pgdata` volume and seed again. The tasks say so.
