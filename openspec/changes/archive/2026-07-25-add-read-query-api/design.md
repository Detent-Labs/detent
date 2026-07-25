## Context

`src/http/server.ts` routes five paths, all of the form "do something to the
instance whose id you already have". Nothing enumerates. The persistence layer
already holds everything a frontend needs — `instances.body` is a jsonb
`Instance` carrying `processId`, `version`, `status`, `currentStepId`,
`assignment`, `startedBy`; `history_entries` and `instance_events` are the
append-only record; `definitions` is one row per published version — but no
read reaches any of it beyond a single-row lookup.

Constraints this design inherits:

- **The contract is untouched.** `src/schema/definition.ts` gets no change.
  Everything here reads what the engine already persists.
- **Keyset pagination, not offset.** `migrateInstances` and `findOrphanKeys`
  already page this way over the same table; a third technique on the same
  relation would be gratuitous.
- **One typed-error-to-status mapper.** `src/http/errors.ts::mapError` is the
  single place statuses are decided; new error families extend it rather than
  being mapped inline in a handler.
- **Auth stays a seam.** `ActorResolver` is the one place identity enters, and
  the shipped `devHeaderResolver` is explicitly non-production. This change
  neither improves nor works around that.

## Goals / Non-Goals

**Goals:**

- A frontend can find instances: filtered, paginated, ordered newest-first,
  with a single inbox predicate that answers "what is on my desk".
- A frontend can render an instance timeline from the audit record without
  knowing the engine's ordering rule.
- A frontend can discover which processes exist and which versions they have.
- An authored body can be published, and an instance cancelled, over HTTP —
  closing the two "already built, never exposed" gaps.

**Non-Goals:**

- Authentication and authorization. Publish and cancel land unauthenticated
  under the shipped resolver; the spec says so out loud rather than pretending
  otherwise.
- Full-text or `data`-payload search. Filters are over lifecycle state only.
- A read model, projection table, or cache. The engine's own tables are the
  source and remain so.
- Editing or deleting definitions. Published versions stay immutable.
- Any change to the five existing routes' behavior.

## Decisions

### Instance summaries exclude `data`

A listing returns lifecycle state, never the form payload. Two reasons, either
sufficient: a list of a hundred instances would otherwise carry a hundred
arbitrary-size payloads, and the payload is the part most likely to be
sensitive once a real authorization story exists. `getInstanceView` remains
the only route that resolves an instance's data, and it is per-instance.

Alternative considered: an `include=data` parameter. Rejected as speculative —
no consumer wants it, and adding it later is additive.

### A `created_at` column, not id-derived ordering

Runtime ids are UUIDv4 (see CLAUDE.md — v7 was the original intent and is not
current fact), so `instance_id` ordering is arbitrary. An inbox ordered
arbitrarily is not an inbox. `instances` gains
`created_at timestamptz NOT NULL DEFAULT now()` via
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `initSchema`, alongside the
existing `CREATE TABLE IF NOT EXISTS` statements, so an existing database
picks it up on the next start and its pre-existing rows get the default.

Alternatives considered: (a) order by `instance_id` and document the
limitation — rejected, it makes the primary consumer useless; (b) switch id
minting to UUIDv7 — a far larger, contract-adjacent decision that CLAUDE.md
deliberately parks, and one column is the cheaper answer to this need.

The keyset cursor is therefore `(created_at, instance_id)` descending, with
`instance_id` as the tie-break that makes the order total.

### `assignedTo` is one predicate, not two filters plus client-side merging

The inbox question is a disjunction — claimed by me, or unclaimed and I am a
candidate — and conjunctive filters cannot express it. Exposing raw
`candidates`/`claimedBy` filters would push the disjunction into every client,
where the "and nobody else claimed it" half is easy to get wrong. One named
filter carries the semantics once, in SQL.

`assignment.candidates` and `assignment.claimedBy` live inside the jsonb body,
so this filter needs its own index — an expression index over
`body->'assignment'->'claimedBy'` plus a GIN index over
`body->'assignment'->'candidates'` for the containment half. The existing
`instances_selection_idx` covers `processId`/`version`/`status` only.

### The record read merges history and events server-side

The ordering rule — `transitionSeq` ascending, then `at`, because an event
never advances the sequence and several may share one — is engine knowledge
stated in CLAUDE.md. Returning two unmerged arrays would export that rule to
every consumer and guarantee at least one gets it wrong. The read returns one
discriminated sequence (`{kind: "transition", entry}` / `{kind: "event",
event}`), and pages it with the same keyset technique keyed on
`(transition_seq, at, id)`.

Implementation: a single SQL `UNION ALL` over the two tables projecting a
common `(transition_seq, at, id, kind, payload)` shape, ordered and limited in
the database — not two queries merged in TypeScript, which would have to
over-fetch from both sides to page correctly.

### An unknown instance yields empty, not 404

The wrapper's existing documented choice is that an untyped "not found" maps
to 500 rather than 404. Rather than argue with that convention or add a new
typed error, the record read simply performs no existence check: the record of
an instance that never existed is empty, which is both true and the cheapest
correct answer. The listing read behaves the same way — a filter matching
nothing is an empty page, not an error.

### Publish takes the server's registry, never the client's

`publishBody` requires a `Registry`. `createServer` currently receives only a
`DataSourceRegistry`; it gains the action `Registry` as a parameter, supplied
by `startHttpServer` from the same value it already hands `startEngine`, so
the publish check and the runtime dispatch agree by construction. A body that
publishes is a body this server can execute.

### Request-shape errors are 400; publish validation is 422

A malformed query parameter (`limit=abc`, an unknown `status`) is a bad
request the client can fix by reading the API — 400. A well-formed publish
whose *content* fails the engine's validation chain is 422 with located
issues, matching the existing `SubmissionValidationError` mapping. Every
publish-time error family `publishBody` can raise is added to `mapError`,
keeping every status decision in that one function: `RegistryValidationError`
plus its two same-shaped siblings `AssignmentRegistryValidationError` and
`DataSourceRegistryValidationError` (all three carry the identical "located
issues" contract, differing only in which registry rejected the body, so they
share one 422 branch), `CelValidationError`, `CrossProcessValidationError`,
`DurationValidationError`, and a bare `ZodError` for an authored-schema
violation (`authoredProcessBody.parse` inside `compileProcessBody`). Leaving
any of these unmapped would silently regress to the generic 500 fallback for
a client error a caller can actually fix — worse than over-mapping.

Rejecting a bad query parameter rather than ignoring it is the deliberate
non-lazy choice: silently returning an unfiltered page to a client that asked
for a filter is worse than an error.

### Reads live in the Runtime API Layer, listings in the definition store

Instance listing and record reading go in `src/runtime/api.ts` — they are the
runtime boundary's business, and they resolve nothing the engine internals
own. Process/version enumeration goes in `src/engine/definitions.ts` next to
the store's other reads. `routes.ts` stays a translation layer with no query
logic of its own, which is what keeps the framework swap it was designed for
cheap.

## Risks / Trade-offs

- **Unauthenticated publish and cancel.** → Explicitly specified rather than
  hidden, kept behind the single `ActorResolver` seam, and scoped to a
  follow-up auth change. Anyone deploying this before that change is exposing
  a write API; the spec says so.
- **Unbounded listing over a growing table.** → An enforced maximum `limit`
  and keyset paging bound each request; the filters most likely to be used in
  volume (`processId`/`status`, `assignedTo`) are index-backed. No aggregate
  count is offered, deliberately — a `COUNT(*)` over the whole relation is the
  one query that would not stay bounded.
- **A new index on jsonb containment.** → GIN over
  `body->'assignment'->'candidates'` costs write amplification on every
  instance update. Accepted: instance writes are already jsonb-body rewrites,
  and the inbox is the single most-used read a participant frontend performs.
- **`created_at` defaults to `now()` for pre-existing rows.** → On an existing
  database every instance predating the column shares one timestamp and orders
  among itself by `instance_id`. Harmless for a pre-production store; noted so
  the ordering is not later mistaken for a bug.
- **A `UNION ALL` record query is harder to read than two selects.** →
  Confined to one function with the ordering rule stated in a comment; the
  alternative pages incorrectly, which is a worse trade.

## Migration Plan

`initSchema` is additive and idempotent (`IF NOT EXISTS` throughout), so a
running database picks up the column and the two indexes on next start with no
manual step and no downtime. Nothing is dropped or rewritten. Rollback is
reverting the code; the added column and indexes are inert to every existing
query and can be left in place.

## Open Questions

- Should the process listing expose *unpublished* drafts once server-side
  draft storage exists? Out of scope here — the definition store holds only
  published versions today, and the editor's drafts are files.
- Does the frontend need a filter on subprocess parentage (`parent.instanceId`)
  to render a call tree? Deferred until a consumer asks; it is additive.
