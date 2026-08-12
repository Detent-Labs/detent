## Why

`notification.email` carries a literal address list and nothing else. A message
therefore reaches a team or manager mailbox. It never reaches the actor holding
the step. Stage 16 shipped the handler and recorded that half of its own
rationale stayed open. Resolving an assignee to an address widens the handler
seam, so it needs a stage of its own.

Two things that landed after stage 16 make the work small. Stage 25's
assignment strategy registry resolves candidates at step entry, and
`auth_users` already holds each account's address. The resolution path exists.
Two things are missing. One is a recipient form that names the step's actor
rather than an address. The other is a seam that carries the actor ids to the
handler.

## What Changes

- `notification.email` config gains `toActors`, a list over three role tokens:
  `candidate`, `claimant` and `starter`. They map onto `assignment.candidates`,
  `assignment.claimedBy` and `Instance.startedBy`.
- `to` drops its `.min(1)` and defaults to the empty list. An object-level rule
  demands at least one entry across the two lists. Every published body keeps
  parsing, since each one carries a non-empty `to`.
- The handler resolves the tokens to addresses through a new
  `emailsForUserIds` in `src/auth/users.ts`, which skips disabled accounts. The
  handler def becomes a `db`-injectable factory, the shape
  `org.manager-of-starter` already uses.
- Every resolved candidate receives the message. Addresses deduplicate, `to`
  first, then the resolved actors in candidate order.
- A delivery that resolves no address opens no SMTP session, returns an empty
  `recipients` list, and counts as succeeded. It writes one warning line.
- `HandlerContext` gains an optional `actors` field. It carries the actor ids in
  force at the moment the engine enqueued the row. `http.request` ignores it.
- The `outbox` table gains an `actors` column. The three enqueue sites fill it
  from the instance they already hold. Delivery then reads frozen ids, rather
  than re-reading an instance that has moved on.
- `describeConfigSchema` learns to describe an array over an enum. The studio's
  plugin config form then offers one checkbox per value. Without this the whole
  `notification.email` entry falls back to the raw JSON textarea.

## Capabilities

### New Capabilities

None. Every rule here belongs to a capability that already exists.

### Modified Capabilities

- `notification-email-action-handler`: the two recipient lists, the resolution
  order, the deduplication rule, the several-candidates rule and the
  no-recipient rule.
- `action-handlers`: the optional `actors` field on the handler context, and
  what a handler may assume about it.
- `transactional-outbox`: the frozen actor ids on an enqueued row, and delivery
  passing them to the handler.
- `studio-plugin-config-form`: an array over a fixed value set, described to the
  browser and rendered as pickers.
- `local-user-accounts`: address lookup over a set of user ids, with disabled
  accounts left out.

## Impact

- `src/handlers/notification-email.ts`: config schema, recipient resolution,
  the empty-recipient path, the def becomes a factory.
- `src/auth/users.ts`: `emailsForUserIds`.
- `src/engine/registry.ts`: `HandlerContext.actors`.
- `src/engine/outbox.ts`: `ClaimedRow.actors`, the claim query, `deliver`.
- `src/engine/store.ts`: the `actors` column, and the subprocess spawn enqueue.
- `src/engine/transition.ts`: the step-entry and timer-fire enqueue sites.
- `src/engine/config-descriptor.ts`: an enum element inside an array.
- `src/engine/host.ts` and `src/http/server.ts`: wiring the handler factory.
- `packages/web/src/areas/studio/panels/shared/PluginEnvelopeEditor.tsx`: the
  checkbox group.
- `test/config-descriptor.test.ts`: the `notification.email` expectation, which
  asserts today's exact descriptor.
- `docs/authoring-guide.md`: the new recipient form.
- `docs/current-state.md`, `docs/browser-checks.md` and `ROADMAP.md`.
- No contract change. This change does not touch `src/schema/definition.ts`: an
  action's `config` stays an opaque object the registry validates at publish.
