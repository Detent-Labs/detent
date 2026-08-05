## Context

See `proposal.md` for the motivation. The approved design walkthrough lives at
`docs/superpowers/specs/2026-08-05-process-templates-design.md`, committed as
`b9ba8db`. This document carries the decisions that shape the code.

Three facts about the current code shape every decision below.

`processListLogic.ts:74`, `seededDraftInput`, already copies a published body
into a draft body. It strips the compile pass's cancel-sink injection. Every
call site hands it the source process's own id, so it produces the next
version of one process. The gap is the target id, not the copying.

`drafts.ts` establishes the storage pattern this change follows. It holds an
unparsed authored body, checks the envelope alone, and bounds the envelope
with `MAX_DRAFT_ENVELOPE_BYTES`.

The studio area declares no per-screen role map. Only the admin area has one,
in `packages/web/src/areas/admin/routing.ts`. Stage 26 added it when the data
list screens joined the admin area under a second role.

## Goals / Non-Goals

**Goals:**

- One place holds a reusable body, and no reader of `definitions` learns about
  it.
- The creation path gains no route. The browser reads a template and writes an
  ordinary draft.
- A curator role that reaches templates and nothing else.

**Non-Goals:**

- Built-in templates. `bun run seed` stays unchanged.
- Template versioning, hashing or migration. A template is a snapshot.
- A record of which process came from which template.
- Permissions per template.
- Any change to `src/schema/definition.ts`.

## Decisions

### A dedicated table, not a flag on `definitions`

The `process-drafts` capability records the argument this change reuses. A
body of a foreign kind in `definitions` makes every reader responsible for
excluding it.

The alternative was a boolean column on `definitions`. It would reach three
readers at least. Those three are the `GET /processes` route, the app area's
start list, and the reporting area's process picker. A participant could then
start an instance of a template. A dedicated table answers the question once
instead of three times.

A third alternative was a flag on `drafts`. Templates would then sit in the
studio process list looking like unfinished work. Nobody may change or
delete it.

### A flat template key

Stage 26 made the same choice for data lists. A template belongs to no
process, so no owning column exists to key it by. The key reads well in a URL.

The alternative was a `tpl_`-prefixed opaque id, matching the contract's
identity rule. That rule governs entities inside a process body, where an id
is a reference anchor. Nothing references a template, so the rule does not
reach it.

### `layout` travels with the body

Without it, a seeded process opens as a stack of boxes at the origin. `drafts`
already holds `layout` beside `body` for that reason.

### No label column

`ProcessBody` already declares `label` and `description` as `LocalizedText`.
The picker and the list read both from the body.

The alternative was a label column on the table. Two places holding the same
text would need a rule for which one wins. A curator would also keep them in
step by hand.

### Envelope-only validation, and no revision check

A template seeds a draft, and the draft store accepts a body that violates the
authoring-time invariants. A stricter check on the template than on its own
target would create a third class of body. An author could save it as a draft
but not as a template.

`saveTemplate` therefore reuses `drafts.ts`'s envelope check and its size
bound. It carries no optimistic concurrency. The draft store's revision check
answers two editors holding one canvas. A template faces no such contention.
A revision column would cost a conflict path nobody reaches.

### The seeding path adds no route

The browser reads `GET /templates/:key` and sends the body to the existing
`PUT /drafts/:processId` with `revision: 0`. That call already creates a
draft. The engine's new surface is the template CRUD alone.

The alternative was a `POST /drafts/from-template/:key` route doing the copy
server-side. It would duplicate what the draft write route already does. It
would also put the studio's minting rule for a process id on the server. That
rule lives in the browser today, and `studio-app` records it as a requirement.

### A new role rather than a reuse

`system:templates` mirrors `DATALISTS_ROLE`, including the read asymmetry.
Stage 26 introduced that role so staff who maintain cost centres need not hold
`system:admin`. The parallel is literal here.

Two reuses of an existing role lost. `system:publish` is defensible, because
publishing already puts a process in front of every participant. It loses
because a curator would then also publish. `system:developer` loses because
every author would then curate. That leaves no curation at all.

### The studio area gains a per-screen gate

Admitting `system:templates` into the studio area widens the area entry. The
area entry then stops being enough, so each screen needs its own check.

The map goes in `packages/web/src/areas/studio/routing.ts`, not in
`root.tsx`. The admin area homes its map in `routing.ts`. The map stays
readable without React that way. `root.tsx` pulls in every screen and the
area stylesheet.

The alternative was a separate top-level area for templates. That alternative
loses because a template is an authoring artifact. The author who consumes one
works in the studio area.

## Risks / Trade-offs

**A template drifts from its source.** An author who fixes a template bug
fixes nothing already seeded from it. Mitigation: the specs state the
snapshot rule. The templates screen says it in one line of help text.

**A seventh role costs an operator a decision per account.** Mitigation: no
account holds the role by default. An installation that grants it to nobody
behaves as it does today.

**The widened area entry could open every studio screen to a curator.** That
is the one access leak here. Mitigation: the per-screen map
lands in the same change as the widening. A test asserts that an actor
holding only `system:templates` reaches no other studio screen.

**The read path accepts two roles.** No other route does. Mitigation: the
check stays inline in both handlers. A `requireAnyRole` helper would hide the
overlap, and two call sites do not earn a helper.

## Migration Plan

`initSchema` creates the table on the next start. No existing row changes and
no backfill runs. An installation that never opens the new screen behaves as
it does today.

Granting `system:templates` is an operator action, through the admin area's
roles editor or `src/auth/cli.ts set-roles`. No account gains the role by
default, so no template exists until somebody creates one.

Rollback drops the table and reverts the code. Nothing references a template,
so a drop strands no process, draft or instance.

## Open Questions

None.
