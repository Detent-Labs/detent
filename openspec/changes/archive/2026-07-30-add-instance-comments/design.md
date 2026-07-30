## Context

Roadmap #23b is the second Extended Task Collaboration sub-project.
#23a, task delegation, shipped already. See
`docs/superpowers/specs/2026-07-30-task-delegation-design.md` for the
sibling precedent this design follows. The design source is
`docs/superpowers/specs/2026-07-30-instance-comments-design.md`, approved
2026-07-30. This document works out the implementation decisions that
design left open. It also corrects one architectural choice a first
draft of this document got wrong. See "Where the code lives" and "Which
capabilities this change touches" below.

An instance today exposes two read paths. Each has its own visibility
rule.

- `getInstanceView` (`src/runtime/api.ts:546`) is the participant-facing
  rule. It admits `ADMIN_ROLE`. It also admits the instance's `startedBy`.
  It also admits the current step's `claimedBy`. It also admits an
  `isEligibleCandidate` match on the current step's assignment candidates.
- `getInstanceRecord` (`src/runtime/api.ts:804`) is the audit-trail rule.
  It admits `ADMIN_ROLE`. It also admits `DEVELOPER_ROLE` together with
  `startedBy === actor.id`. A plain participant cannot read this. Not even
  the current claimant can.

A comment thread sits next to the field form `getInstanceView` renders. It
is participant-facing. It needs `getInstanceView`'s rule, not
`getInstanceRecord`'s. The source design doc's phrasing, "reuses the
visibility rule `getInstanceView`/`getInstanceRecord` already enforce,"
reads as if the two are one predicate. They are not one predicate. This
design picks the rule that fits the audience.

## Goals / Non-Goals

**Goals:**
- Let any actor who can already read an instance under `getInstanceView`'s
  rule post and read free-text comments on it.
- Keep comment storage outside the `HistoryEntry`/`InstanceEvent` audit
  backbone. Roadmap #20's redaction design then needs no change to its
  approved guarantee. See the source design doc's "Why not
  `InstanceEvent`".

**Non-Goals** (unchanged from the source design):
- Editing or deleting a comment.
- Threaded replies or @mentions.
- Rich text or attachments inside a comment (Roadmap #23c).
- Read receipts.
- Wiring `redactInstance` to clear `instance_comments`. Roadmap #20 has an
  approved design but no implementation yet. No `redactInstance` function
  exists to extend. This follows on once #20 ships.

## Decisions

**Which capabilities this change touches.** This change adds no new
capability. It extends three existing ones instead: `persistence` (the
new table and index), `runtime-api` (`postComment`/`listComments`), and
`http-wrapper` (the two routes). It also extends `end-user-app` for the
UI. A first draft of this proposal invented a standalone
`instance-comments` capability instead.

#23a task delegation is the closest sibling change. It touched six
existing capabilities and minted no new one, even though it added a
whole new engine operation, `delegateClaim`. Comments are a smaller
addition than delegation. The same delta-only shape applies here at
least as strongly. Each capability spec delta (`specs/persistence`,
`specs/runtime-api`, `specs/http-wrapper`, `specs/end-user-app`) states
its own requirements. This document covers only the cross-cutting
decisions between them.

**Naming.** The new type is `InstanceComment`, not `Comment`. A bare
`Comment` collides in name with the DOM's own `Comment` node interface.
That collision is in name only, never a real compile error, but it
still confuses a reader. It matters wherever `packages/app`'s TypeScript
config includes the `DOM` lib. `InstanceComment` avoids the collision
entirely. It also matches the existing `InstanceSummary`/`InstanceView`/
`InstanceRecordElement` naming family in `src/runtime/api.ts`.

**Table shape.** `instance_comments`:
```
id          text PRIMARY KEY   -- 'comment_' + crypto.randomUUID(), matching
                                -- evt_/hist_/inst_ id minting in store.ts
instance_id text NOT NULL
actor_id    text NOT NULL
text        text NOT NULL
created_at  timestamptz NOT NULL DEFAULT now()
```
One index exists too: `instance_comments_instance_idx`. Its columns are
`instance_id`, `created_at`, `id`. This mirrors
`instance_events_instance_idx`'s own `(instance_id, transition_seq)`
shape. It serves the pagination query below.

`created_at` is a real column here. It is not a value embedded inside a
JSON payload. This matches `instances.created_at`'s own pattern for
`listInstances`. A comment carries no JSON payload at all. Unlike
`HistoryEntry`/`InstanceEvent`, a comment has no polymorphic shape to
hold.

**Where the code lives.** `postComment` and `listComments` land in
`src/runtime/api.ts`, beside `getInstanceView`. They do not land in a
new `src/engine/` module. `admin-queries.ts` is the wrong precedent for
this. It takes no `actor` parameter at all. The HTTP layer runs a
`system:admin` role check before every one of its reads, ahead of the
read itself.

Comments need the opposite: the same per-instance,
actor-and-assignment visibility check `getInstanceView` already runs.
That check is exactly what marks a function as Runtime API Layer work.
This repo's own definition of that layer names it directly: "validating
and writing user-submitted data." A comment is user-submitted data.

Same-file placement also settles what the source design left open:
extract or duplicate the visibility check. This design factors it into
one small local helper, e.g. `assertCanReadInstance(instance, actor)`,
pulled out of `getInstanceView`'s existing body. All three functions
call it. One helper, one file, no cross-module duplication risk.

Both `postComment(instanceId, actor, text, db)` and
`listComments(instanceId, actor, page, db)` run that same helper before
touching `instance_comments`.

`postComment` mints the id, inserts the row, and returns it as an
`InstanceComment`. `listComments` keyset-paginates oldest-first by
`(created_at, id)` ascending. It reuses the
`Page<T>`/`encodeCursor`/`decodeCursor` shape `listInstances` and
`getInstanceRecord` already use. Its `limit`/`cursor` defaults match
`getInstanceRecord`'s own defaults: `DEFAULT_RECORD_LIMIT` 100,
`MAX_RECORD_LIMIT` 500.

**Text validation lives at the HTTP boundary only.** `postComment`
itself trusts `text` as already non-empty and within bound. It performs
no independent check of its own. `delegateClaim` sets this precedent
already. It trusts `toActorId` the same way, with no length or
membership check at the Runtime API Layer.

The HTTP route's Zod schema enforces non-empty-after-trim and a length
cap. It does so via a new `MAX_COMMENT_LENGTH = 10_000` constant in
`src/http/routes.ts`. That number is a round, generous bound for a
free-text note. It has no narrower precedent to match. The existing
`MAX_*_LENGTH` constants in `src/schema/compile.ts` bound authored
process-definition strings instead, such as keys, patterns, and
expressions. That is a different concern from runtime user text.

**HTTP routes.** Two additions to `src/http/routes.ts`, beside the
existing `/instances/:id/...` routes:
- `POST /instances/:id/comments`: body `{ text: string }`, validated by
  the Zod schema above. Returns 201 with the created
  `InstanceComment`.
- `GET /instances/:id/comments`: `limit`/`cursor` query params, the same
  shape every other paginated route accepts. Returns 200 with
  `Page<InstanceComment>`.

Both routes map `AuthorizationError` to 403. Neither invents a distinct
404 for an unknown instance. Neither needs to.
`assertCanReadInstance` inherits `getInstanceView`'s existing behavior
unchanged.

A non-admin actor sees two cases collapse into the same
`AuthorizationError`. One case is an instance that does not exist. The
other is one the actor may not see.

An `ADMIN_ROLE` actor sees a third case instead. A genuinely missing
instance throws `NotFoundError`. This repo's own `errors.ts`
deliberately maps that to 500, not 404 (see its "Keep not-found at 500"
note). Both routes inherit this exact split unchanged. Neither
introduces a new 404 case.

**Frontend.** `packages/app/src/screens/TaskScreen.tsx` gains a comment
thread section. It has a list, oldest first, showing actor id and
timestamp, fetched via `GET`. It also has a text box and a submit button.
The button calls `POST` and refetches. No new screen exists. No new route
lands in `packages/app`'s router.

## Risks / Trade-offs

- [Unbounded comment growth on a long-running instance] → a later change
  will wire Roadmap #20's redaction to clear these rows. That change
  lands once #23b and #20 both ship. Roadmap #20's own entry already
  carries this as an addendum. `MAX_COMMENT_LENGTH` bounds a single
  row's size. Pagination bounds a single request's cost. Neither bounds
  total row count. That gap is acceptable until #20 ships.
- [Displaying a raw `actorId` instead of a human name] → matches the
  existing convention every other actor-id-only surface already follows.
  One example is the admin Operations screen, per
  `docs/current-state.md`. No actor-id-to-name lookup exists anywhere in
  the repo yet. Adding one is out of scope here.

## Migration Plan

This change is additive only. It adds one new table, one new index, two
new routes, and one new UI section. No existing table, route, or schema
changes. It deploys and rolls back like any other additive change. A
rollback that drops `instance_comments` loses comment history. It touches
no other state.

## Open Questions

None. Decisions above already resolved the source design's one open
implementation question. Placing the new functions beside
`getInstanceView`, in `src/runtime/api.ts`, settled extract vs.
duplicate for the visibility check.
