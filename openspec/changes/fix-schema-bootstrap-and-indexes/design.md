## Context

`persistence` established `initSchema` as the single owner of all DDL, using
`CREATE ... IF NOT EXISTS` throughout so it is idempotent and additive — new
tables and indexes are appended to it as capabilities land, and running it
again is a no-op. That design is why calling it more often is cheap and why
nobody noticed that the *server* never calls it: every test suite does, in
`beforeAll`, and so does the demo script, so in practice the schema always
existed by the time anyone looked.

The two missing indexes are the same kind of omission. The function creates
eleven indexes, including three purpose-built expression indexes over
jsonb-nested predicates, each with a comment explaining what reads it. The two
missing ones are for predicates that were added later, in other files, without
a corresponding line here.

## Goals / Non-Goals

**Goals:**

- Pointing `bun run serve` at an empty Postgres works.
- A missing `DATABASE_URL` fails at startup, naming the variable.
- The two predicates that today scan `history_entries` and `instances` use an
  index, as every sibling predicate does.

**Non-Goals:**

- A migration framework, versioned migrations, or a `migrate` script.
  `IF NOT EXISTS` DDL is sufficient while the schema is only ever extended;
  the moment a column needs to change type or be dropped, that is a different
  capability and should be introduced then, not speculatively.
- Pruning or archiving `history_entries`/`instances`. Both grow without bound
  by design (they are the audit backbone), and an index is the correct answer
  to the scan cost; retention policy is a separate product decision.
- Query rewriting or additional indexes beyond the two named. Other predicates
  may deserve indexes, but each should be added with a named reader, which is
  the convention this change follows rather than extends.
- Seed data. ROADMAP stage 19 owns it and this change deliberately creates
  structure only.

## Decisions

**Call `initSchema` from `startHttpServer`, not from a separate `migrate`
script.** A script would work and is what a larger system would do, but it
adds a step a contributor must know about, and the failure mode of forgetting
it is exactly the one being fixed. The DDL is idempotent, so calling it on
every start costs one round trip per statement against an existing schema and
removes a whole class of "works on my machine". When versioned migrations
eventually arrive, this call site is where they hook in.

**Also call it from `src/auth/cli.ts`.** `add-user` against a fresh database
is the very first thing a new deployment does — before any server has
necessarily started — and it currently fails with a relation error. One
`await` there makes the bootstrap sequence work in either order.

**Throw at boot for a missing `DATABASE_URL`, rather than lazily.** The
current `process.env.DATABASE_URL ?? ""` produces a connection error on the
first query, in whatever request happened to arrive first, with no mention of
the variable. A boot-time check names it. The check belongs where the client
is constructed, so every entry point — server, CLI, scripts — inherits it.

**Mirror the sibling index exactly for `history_entries`.**
`(instance_id, transition_seq)` covers both readers: `appendOutcome`'s
two-column predicate uses both, and `getInstanceRecord`'s single-column
predicate uses the leading column. That is the same index the structurally
identical `instance_events` table already has, so the two sides of the
record's `UNION ALL` finally behave alike.

**A plain expression index for the parent predicate, not GIN.**
`body->'parent'->>'instanceId'` is an equality predicate on a single extracted
text value, which a B-tree expression index serves exactly — the same shape as
`instances_claimed_by_idx`. GIN is right for the candidates array, where the
predicate is containment, and would be the wrong tool here. The `status`
half of the predicate is deliberately left out of the index: it is low
cardinality, and the parent id alone is selective enough to reduce the scan to
a handful of rows.

**Both statements are `IF NOT EXISTS` and go in `initSchema`, in the sibling
positions** — the history index right after its `CREATE TABLE`, the parent
index beside the other `instances` expression indexes — each with a comment
naming its readers, matching the three that already carry one. Placement is
not cosmetic here: the file is read as the schema's documentation.

## Risks / Trade-offs

- **Index creation on a large existing `instances` / `history_entries` table
  blocks the first startup** that runs it → Real, and the only operational
  risk in this change. For a deployment with meaningful volume, create both
  indexes ahead of time with `CREATE INDEX CONCURRENTLY` (which cannot run
  inside a transaction and so is not appropriate for `initSchema` itself), then
  deploy; `IF NOT EXISTS` makes the startup call a no-op afterwards. Called out
  in the migration plan.
- **Running DDL on every server start** in a deployment where the application
  user should not hold DDL privileges → A legitimate posture this change does
  not accommodate; such a deployment pre-creates the schema and the call is a
  no-op, but the *privilege* to run it is still required. Worth revisiting
  when packaging (stage 14) defines a deployment model.
- **`startHttpServer` may need to become async** → A signature change with a
  small ripple through its callers and tests. The alternative — a
  fire-and-forget promise — would let requests arrive before the schema
  exists, which is the bug.
- **A boot-time `DATABASE_URL` throw changes how a misconfigured process
  fails** — from a 500 on first request to an immediate exit → Intended, and
  consistent with the direction `harden-auth-configuration` takes for auth
  configuration.
- **Two more indexes to maintain on write** → Both are narrow, and both replace
  a sequential scan on a table that grows without bound. The write cost is
  bounded and constant; the scan cost is not.

## Migration Plan

1. On a deployment with meaningful data volume, create both indexes ahead of
   the deploy with `CREATE INDEX CONCURRENTLY` (matching the definitions
   exactly, including the expression), so the startup call finds them present
   and skips them. On an empty or small database, no preparation is needed.
2. Deploy. The first start runs `initSchema`, which creates anything missing
   and no-ops on everything present.
3. Confirm both indexes exist and are used: `EXPLAIN` the two predicates
   (`appendOutcome`'s update and the child-instance lookup) and check for an
   index scan.
4. Rollback is reverting the commit. The indexes stay behind, which is
   harmless — they are additive and unused code paths do not depend on them.

## Open Questions

- Should `initSchema` eventually be replaced by versioned migrations? Yes,
  once the schema needs to change something rather than only add. Not now, and
  this change deliberately keeps the additive-DDL convention rather than
  half-introducing a framework.
- Should `startEngine` also call it, for an embedding host that runs the
  engine without the HTTP server? Left alone: such a host wires its own
  composition root and can call `initSchema` itself, and adding it in two
  places invites the question of which one owns it.
