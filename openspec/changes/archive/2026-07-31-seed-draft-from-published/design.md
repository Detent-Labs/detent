<!-- antislop: allow-file passive-voice -->
<!-- The draft store and the publish path are described by what happens to a
     record, not by who acts on it. -->

## Context

See proposal.md, section Why. Four facts shape the approach.

`ProcessesScreen.createDraft` writes `{ body: {}, layout: {}, revision: 0 }`
for every process, published or not. `+ New process` calls the same function
with a freshly minted id.

`getVersionBody(processId, version, token)` already exists in the studio's
API client. It reads `GET /processes/:id/versions/:v`, which answers with
`resolveBody`: the **compiled** body, carrying the compile pass's cancel-sink
injection.

The studio parses every draft through `authoredProcessBody`
(`draft/validation.ts`), and that schema rejects the reserved cancel-sink id
and key. The `process-drafts` spec already requires a draft body to hold the
authored, uncompiled shape.

`base_version` has one writer today, `markDraftPublished`. `VersionsScreen`
offers one draft-versus-version comparison, and it disables that button when
`baseVersion` is null.

## Goals / Non-Goals

**Goals:**

- One code path decides between a seeded draft and an empty draft, in the
  process list.
- A seeded draft is indistinguishable from one an author built by hand, both
  to the studio's validation and to the publish path.
- A seeded draft knows which version it came from.

**Non-Goals:**

<!-- antislop: allow synonym-rotation -->
- No server-side seeding route. The draft routes keep storing what the
  client sends. "Edit screen" below names the `/processes/:id/edit` route,
  not a change.
- No layout generation. The canvas auto-places steps with no recorded
  position.
- No change to the versions screen, the edit screen, or the publish path.
- No authored-body column in `definitions`. Publish keeps hashing and
  storing the compiled body alone.

## Decisions

**Seed the authored shape, by inverting the compile pass**. The stored
version is compiled. No authored copy exists. `definitions` has one `body`
column, and `publishBody` writes the compiled body into it. Seeding
that body as-is would put a reserved cancel-sink step into a draft.

The studio would flag it on every render. The author could rename or delete
it. The resulting body would then fail `authoredProcessBody` at publish,
with an error naming an id the author never wrote.

The inverse is small and total. `compileProcessBody` adds exactly two things
past the parse. One is the cancel-sink step. The other is the reserved
outcome appended to `contract.outcomes`, for a contracted process. It adds
no path to the sink. Removing those two restores the parsed authored body.

Alternatives rejected. Storing the authored body beside the compiled one
changes the persistence contract and the publish path, for one editor
convenience. Relaxing the studio's validation to tolerate a cancel sink
would also accept a hand-authored one. Rejecting that is the check's whole
purpose.

**Guard the inverse with a round trip, not with review.** The strip lives in
the studio. The injection lives in `src/schema/compile.ts`. A later addition
to the compile pass would silently break the strip. A test over the repo's
`examples/` definitions asserts that stripping a compiled body yields the
authored body it came from. That test fails on the next injection, which is
the point.

**Declare the base version on the seeding save.** `base_version` means "the
published version this draft was last identical to". A publish makes that
true, and so does a seed. Only the publish path writes it today. The field
therefore looks narrower than its use. `saveDraft` and
`PUT /drafts/:processId` accept an optional `baseVersion`, and the seed
sends it.

An omitted `baseVersion` leaves the column alone. An editing save carries no
base version, and must not delete the one the seed stamped.

**Check the base version resolves, in `drafts.ts`.** The draft body stays
opaque, as the `process-drafts` spec requires. A base version is different:
it is a reference into `definitions`, and the Versions screen dereferences
it. An unchecked value would offer a comparison that fails at the point of
use. The check is one query, on the write path, which is where this project
puts validation that can tighten.

**Seed from the latest published version, not from a chosen one.** The
process list shows one published version per row. Choosing an older version
to branch from belongs to the versions screen, which already has the
per-version context.

## Risks / Trade-offs

[The compile pass gains an injection and the strip goes stale] → The
round-trip test over `examples/` fails on the next injection. It is task 1.3
and lands before the UI change.

[A seeded draft's `baseVersion` is a client claim] → `saveDraft` rejects a
version that does not resolve. A caller can still name a resolvable but
wrong version. The consequence is a misleading diff, not a wrong definition:
publish revalidates the body server-side and never reads `base_version`.

[A large published body makes draft creation slow] → The versions screen
already reads the same body for its diff. Draft creation now costs one read
plus one write, in place of one write.

## Migration Plan

None. No stored data changes shape, and `base_version` already exists and is
already nullable. Drafts created before this change stay readable. An author
who wants the published body in one of them discards it and creates it
again.
