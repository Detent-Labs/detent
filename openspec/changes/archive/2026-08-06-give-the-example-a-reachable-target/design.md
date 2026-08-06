## Context

See proposal.md for the three broken actions. Five facts shape the approach.

`egressRefusal` in `src/handlers/http.ts` compares `URL.host` against
`HTTP_ACTION_ALLOWED_HOSTS`. A host carries its port unless the port is the
scheme default. So `http://webhook-sink:8080/x` needs the list entry
`webhook-sink:8080`, not `webhook-sink`.

`http.request` answers `{ status, headers, body }`. Its `status` is the HTTP
status number. Today `book`'s `Action.output` expression reads `result.status`,
because `accounting.postInvoice` was meant to answer a booking status.

Against `http.request` that expression writes the number `200`. The target
field is a `select` over `pending`, `booked` and `failed`. The outbox
type-checks an `Action.output` value against the target field before it writes.
So the value drops into `droppedTargets` instead. The expression has to move to
`result.body.status`.

`scripts/seed.ts:115` registers a dummy for each unresolvable type, in its own
registry. That is why publish passes at all. `checkActionRegistry` rejects an
unknown type at publish time. The seed process knows both types. The server
process registers neither. Publish goes green, and delivery dies.

The second of those dummies answers `{ status: "booked" }`. That is the shape
`book`'s `Action.output` expects.

`mailpit` is the precedent. The devcontainer already runs a service whose one
job is to catch a side effect the engine dispatches. A contributor then looks
at it. `notification.email` reaches that service. `http.request` has no
counterpart.

`test/view-layout-hash.test.ts` pins the body hash of three example files as
literals. `expense-approval.json` is one of them. I confirmed both halves of
that inside the devcontainer. The pinned literal
`b90f7044c52a60a54093c7c92951ea0576ba611403b19420a0042cfeb2f20dd2` is the
current computed hash of the body. The wrapper's own `definitionHash` field,
`2eec7e1e62950988fc3fd972f50899de04df0cfc4b9ed20e894790396c1ee788`, is stale.
The test's comment already says so, and already says the wrapper field is not
the pin.

## Goals / Non-Goals

**Goals:**

- A contributor seeds the devcontainer database and starts the server. They
  walk the example to a terminal step. The dead-letter view stays empty.
- Every action type the example names resolves in `createDefaultRegistry()`.
  The demo runs the handlers a deployment runs, not a stub.
- The target answers offline. No public host, no third-party uptime.

**Non-Goals:**

- No route and no handler inside `src/`. The engine stays free of demo
  concerns.
- No change to `src/handlers/http.ts` and none to the egress rule. The policy
  is right. The target was wrong.
- No new example file. The repository keeps the three it has.
- No production image change.

## Decisions

**The target is a sink in the devcontainer compose file.** A local target
needs no network. Its address is stable. This repository writes its body. That
last part decides it. `book`'s `Action.output` needs a `body.status` the field
accepts. A public echo host guarantees no such thing over time.

**The sink runs the image the `app` service already builds.** It adds one
script in `scripts/`. A third-party echo image would be one line of compose. It would
also be a new supply-chain entry to pin and to renew. That buys roughly thirty
lines of behavior. The devcontainer image already holds Bun and already mounts
the workspace. `scripts/dev-webhook-sink.ts` is one `Bun.serve` call. The
compose file repeats the three-line `build` block, because compose has no build
inheritance.

**The sink echoes the JSON body it received.** The example's own `config.body`
then holds the booking outcome. The sink invents nothing. A reader follows one
value: `{"status":"booked"}` goes out, comes back, and `result.body.status`
writes it into `booking_status`. A sink that invented a status would hide where
the value came from. The cost is real, and Risks names it.

The seed script's own dummy is independent evidence for the echo. It answers
`{ status: "booked" }`, a body, not a bare `200`. Whoever wrote it needed a
structured answer, because `book`'s `Action.output` reads a field out of one. A
sink that answered `200` and nothing else leaves `book` parked, exactly as
today. This is also the sharpest argument against the rejected public echo
host: this repository has to own that body's shape.

**The example switches to the two action types that ship.** The alternative
keeps `accounting.postInvoice` and registers a demo handler for it. The one
place to register that handler is `createDefaultRegistry()` in
`src/engine/host.ts`. That file's own header calls itself production wiring. A
fake accounting handler there ships in the engine image.

The vendor-type idea keeps its teaching in two better places. One is
`docs/authoring-guide.md`. The other is the studio's `createExampleRegistry()`,
which exists to show a registry a deployment injects.

**`notify.email` becomes `notification.email`.** The two names sit in one file,
four hundred lines apart. Only the second one ever had a handler. This is a
stale name, not a design choice worth keeping.

**`example.com` leaves `HTTP_ACTION_ALLOWED_HOSTS`.** The list denies by
default. An entry no target uses is an open door with nothing behind it. The
`development-toolchain` requirement already says the list holds the host of
every target this repository names. After this change that host is the sink.

**The change recomputes the hash literal and rewrites the comment above it.**
Somebody measured that literal against an older schema. It predates
`view.columns` and `viewField.span`. For this one file that provenance dies the
moment the body changes. It survives for the other two files, which this change
does not touch.

So the recomputation carries a stated reason. It happens while the two
untouched literals still pass. That is evidence for one claim. The current
schema emits what the pre-change schema emitted, for a body declaring neither
key.

Two structural assertions in the same file keep their full force. One checks
that a parsed body carries neither key. The other checks that a body setting
either key hashes differently.

**The same change repairs the wrapper's stale `definitionHash` field.** A
reader copies this example. A wrong hash in it teaches a wrong habit. Nothing
hashes the wrapper, so writing the field cannot move the body hash. The repair
is therefore order-independent. The test comment that calls the field stale
gets rewritten with it.

### Alternatives rejected

**Delete the escalation `http.request` action.** `escalated_review` already
carries `notification.email`. That satisfies the notifying-action requirement
in `openspec/specs/escalation-pattern/spec.md`. Deleting the webhook is the
smallest fix available. It also leaves the repository with no example of the
`http.request` handler in a real definition. It empties the devcontainer's
egress allowlist too. The point is a reachable target, not one action fewer.

**A route on the engine, such as a dev-only sink under `/dev/`.** It puts a
demo concern in `src/http/`. It needs a guard flag of its own. It has the
outbox worker calling back into its own server.
`scripts/demo-expense-approval.ts` also runs with no HTTP server at all. That
path could never reach such a route.

**A public echo host, such as `postman-echo.com`.** No new service, and it
speaks `https:`. It also needs outbound internet from the devcontainer. A
contributor who is offline or behind a proxy meets the same dead-letter this
change exists to clear. The canonical example would also depend on a third
party's uptime and rate limits.

**Keep the URL and make `example.com` resolve locally**, through a compose
network alias. The URL is `https:`. So the local target needs a certificate for
`example.com`, and the app container needs a trust store entry. That is more
machinery than the sink. It also hides the target's real identity from anyone
reading the example.

## Risks / Trade-offs

**The recomputed hash literal loses its pre-change provenance.** The Decisions
section states the mitigation. It is an argument, not a mechanical check.

**The demo's booking always succeeds, so `booking_error` stays unreachable.**
It was unreachable before too. Both dummy handlers answered `booked`. A
contributor who wants the failure branch edits the sink's answer, or the
action's `config.body`. The tasks add that sentence to the authoring guide.

**The example stops showing a vendor-named action type.** The two types it
keeps are plugins behind `{ type, config }` in the same way. Only the fictional
vendor name goes.

**Three test cases stub `http.request` with a handler answering `{}`.** After
this change, `book`'s `Action.output` reads `result.body.status` from that
answer. An `Action.output` entry that cannot read `result` raises. The contract
says a raise there fails loudly. So those stubs need a body. Without it the
suite goes red, and the red looks like an engine failure. The tasks name each
case.

**A second compose service on the same image costs a cold build.** Docker
reuses the layer. So the real cost is one container, not one image build.

## Migration Plan

No data migration and no instance migration. Nothing in a deployment reads this
example.

A contributor with a seeded database meets the moved hash as a new version.
`scripts/seed.ts` resolves the process by key. It finds no version carrying the
new hash. It publishes version 2. Instances already running on version 1 stay
pinned there and keep dead-lettering. The instruction is to drop the `pgdata`
volume and seed again. The tasks carry that as a step.

The new service and the changed variable need a `docker compose up -d`.
`egressRefusal` reads its variables per call. So the change lands on the app
container's next start, with no code deploy.

## Open Questions

- Should the sink record what it received? A contributor could then look at a
  delivered webhook the way mailpit shows a delivered message. A log line on
  stdout covers `docker compose logs webhook-sink`, and the tasks pick that. A
  stored list with a web interface would sit closer to the mailpit experience.
  It would also be a second small service to maintain.
- Should `HTTP_ACTION_ALLOW_INSECURE` stay at `1` once the sink is the only
  target? It has to. The sink speaks plain HTTP. The alternative is a
  certificate in the devcontainer, which the rejected alternatives argue
  against.
