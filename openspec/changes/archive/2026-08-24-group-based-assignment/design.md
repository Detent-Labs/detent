## Context

See `proposal.md` (Why) for the motivation. This section covers only the
existing code the approach must fit.

<!-- antislop: allow sentence-length -->
<!-- Why: one sentence keeps this precedent's four shared conventions together; splitting would repeat the subject three times. -->
`src/auth/users.ts` is the closest sibling: `db: SQL = sql` default
parameters, `Page<T>`/keyset pagination (`listUsers`), a
`UserSummary`-shaped (`src/auth/users.ts`) row or `undefined` on a missing id
(`setDisabled`/`setRolesById`/`setManagerById`), and a `text[]` column
(`roles`) with no foreign key, holding any string. `src/auth/grants.ts` is
the closest sibling for the scope shape: a `z.discriminatedUnion("type",
[...])` scope, strict on write, lenient on read (`listGrants` returns the
stored `scope` unparsed).

<!-- antislop: allow run-ons sentence-length -->
<!-- Why: the sentence states the placement precedent and its one cause together; splitting would break the causal link. -->
`src/engine/assignment-strategies.ts` already homes `org.manager-of-starter`
outside leaf `registry.ts`, for exactly the reason `org.group-members`
needs the same home: it reads the database
(`getManagerOf`/`getGroupMembers`), and `registry.ts` must stay the leaf
`store.ts`, `transition.ts` and `definitions.ts` default a parameter to.

<!-- antislop: allow sentence-length passive-voice -->
<!-- Why: "the thing being deleted" names the scan's generic target, not one actor's action; the sentence states the precedent's whole shape at once. -->
`src/http/admin-routes.ts::referencingProcesses` (behind `DELETE
/admin/data-lists/:listKey`) is the deletion-guard precedent: a full scan
of `definitions` for `status = 'published'` rows whose `body` references
the thing being deleted, returned as the list a 409 names. The groups
deletion guard reuses that shape over `body->'allowedGroups'` instead of
`body->'dataSources'`.

<!-- antislop: allow sentence-length -->
<!-- Why: the sentence names the ordered sequence of existing checks; splitting would obscure that ordering. -->
`src/validate.ts::validateReferences` and `src/engine/definitions.ts::
publishBody` are the placement precedent for the database-backed scope
check: `publishBody` runs the hash-hit no-op return first, then
`validateReferences`'s in-process registry/CEL checks, then the two
DB-resolving checks (`validateCrossProcess`, `validateProcessChaining`),
each against `createDefinitionStore(db)` built from the per-request `db`
parameter. The group-scope check joins that DB-resolving group, at the
same placement, using the same `db`.

## Goals / Non-Goals

<!-- antislop: allow sentence-length -->
<!-- Why: the third goal's bullet states one check's purpose and its placement constraint together; splitting would separate the two. -->
**Goals:**
- A groups store an `org.group-members` assignment strategy resolves live,
  so a membership change needs no republish.
- A scope model (`global` / `processes`) that lets an operator restrict a
  group to specific processes, editable after creation.
- Two publish-time checks that make an author's `allowedGroups` declaration
  and a step's `groupId` reference both trustworthy at publish, with the
  DB-backed one placed so a byte-identical re-publish of an
  already-published body stays a no-op.
- `/admin/groups*` routes with the same shape, pagination and role gate as
  `/admin/users*`.

<!-- antislop: allow sentence-length -->
<!-- Why: the second bullet names the deferred check and points to where its rationale lives; splitting would strand the pointer from its subject. -->
**Non-Goals:**
- No UI. `admin-groups-screen` builds it, against this change's API,
  afterward.
- No Studio draft-edit-time authorization check deciding which groups an
  author may add to a draft's `allowedGroups` (see Decisions, below, for
  why that is future work rather than this change's concern).
- No change to `auth_users.roles` or `src/auth/grants.ts`. Those cover an
  unrelated concern (system/studio permission grants), and no code this
  change adds reads or writes either.
- No hybrid assignment config mixing literal candidates and a group
  reference. `static` and `org.group-members` stay two separate, single-
  purpose strategies.

## Decisions

<!-- antislop: allow sentence-length passive-voice -->
<!-- Why: the sentence contrasts both existing id-shaped-column precedents in one place, which the decision below depends on; "was rejected" names the design alternative this paragraph itself argues against, with no other actor to name. -->
**Members carry no foreign key, mirroring `auth_users.roles`, not
`manager_user_id`.** `auth_users` has two existing precedents for an
id-shaped column: `manager_user_id`, which is a real foreign key (`ON
DELETE SET NULL`), and `roles`, a `text[]` of free-form strings with no
referential check at all. A group's `members` column follows `roles`: an
operator may list a member id before that account exists or after it stops
existing, and the runtime resolution query (`SELECT ... FROM auth_users
WHERE user_id = ANY(members) AND NOT disabled`) naturally drops both a
disabled account and a nonexistent one, satisfying the "filters out
disabled accounts" requirement with one predicate and no separate
existence check. A foreign-key column was rejected: it would force a
specific write order (create the account before the group can list it) the
`roles` precedent does not impose, for no resolution-time benefit the join
does not already give for free.

<!-- antislop: allow run-ons sentence-length passive-voice -->
<!-- Why: the paragraph traces one schema-shape decision through canonicalize()'s own filter rule and the hashing consequence that rule produces; "is dropped"/"is read" name canonicalize()'s and definitionHash's own behavior, not an actor's action. -->
**`allowedGroups` is `.optional()`, not `.default([])`.** `canonicalize()`
(`src/schema/canonical-json.ts`) sorts an object's keys and, at the same
step, drops any key whose value is `undefined`. That is the one place a
schema choice here reaches `definitionHash` (the JCS hash of `ProcessBody`,
per `.claude/rules/process-contract.md`). `.optional()` parses a body
predating this field with `allowedGroups` absent, i.e. `undefined`, so
`canonicalize()` drops the key and that body's hash is untouched. A
`.default([])` field would instead parse to a present key holding `[]` on
every body `processBody.parse` touches, published or not, the moment this
change lands. `canonicalize()` keeps a present `[]`, so every
already-published body's canonical form, and therefore its
`definitionHash`, would change on next parse. `store.ts::rehydrate` and
`definitions.ts` recompute and compare `definitionHash` on every instance
read and write, so that drift would appear as a `PinMismatch` against an
instance that pinned the pre-change hash. `allowedGroups` follows
`dataSources`, the one other array-typed top-level `ProcessBody` field that
predates this change and is itself `.optional()` for the same reason. Every
read site treats the resulting `string[] | undefined` as empty via `?? []`
over the compiled body. The structural check (task 2.1's cross-reference in
tasks.md) and the database-backed scope check both do.

<!-- antislop: allow run-ons sentence-length passive-voice -->
<!-- Why: the paragraph ties this bound decision to both existing precedents it mirrors; "is added" names a schema property, not an actor's action. -->
**No length bound is added on `name`, `members`, or `processIds` beyond
what already exists elsewhere.** `auth_users.display_name` and
`grants.ts`'s `role` string both carry an explicit 200-character bound
(`DISPLAY_NAME_MAX_LENGTH`, `MAX_ROLE_LENGTH`); a group `name` gets the
same bound for the same reason (an authored string reaching storage stays
bounded). `members` and `processIds` hold ids (`user_...`, `proc_...`)
whose own schemas impose no length cap today, so this change adds none
either, consistent with `auth_users.roles` and `grants.ts`'s `scope.
config.processId`, whose own id schema imposes no string-length cap
either.

<!-- antislop: allow sentence-length passive-voice -->
<!-- Why: the paragraph contrasts where each of the two checks runs; "is scoped to" names a file-location fact, not an actor's action. -->
**The deletion-guard query and the publish-time scope-existence check share
one shape, not one function.** `referencingPublishedProcesses` (task 1.7,
`src/auth/groups.ts`) reads only `allowedGroups`; the publish-time check
runs inside `publishBody`, over a compiled body already in memory, against
the live `groups` table. Sharing
the SQL shape (an `EXISTS` scan of `definitions` filtered to
`status = 'published'`) costs nothing extra to write twice, and a single
shared function would force the publish path to import from
`src/http/admin-routes.ts` (an inversion `definitions.ts` does not already
have with any other admin route) for a four-line query.

<!-- antislop: allow sentence-length passive-voice -->
<!-- Why: the paragraph states the deferred check's rule and the reason it is deferred together; "is deferred" names the decision this whole passage explains. -->
**The Studio draft-edit-time authorization check (item 4a from the
original design) is deferred, not built.** The rule it would enforce: a
`"global"`-scoped group is addable to a draft's `allowedGroups` by anyone
with write access to the process; a `"processes"`-scoped group is addable
only if that process's id is already in the group's `processIds`. That
check protects a *drafting-time* convenience (stop an author from
declaring a group they should not be able to reach before they ever try to
publish); the two checks this change ships are the *publish-time*
backstop that holds regardless. Building the drafting-time check needs a
Studio API route this change does not open (no UI lands here at all, see
Non-Goals), so implementing only its rationale, with no route to attach it
to, would be dead code. A later change adds it once
`admin-groups-screen` (or a successor) gives an author a reason to hit it
before publish. The strategy type is already selectable via Studio's
existing registry-driven plugin-config form (`handleGetRegistry`) the
moment it registers, the same as `org.manager-of-starter`. This defers only
the authorization *gate*, not reachability.

## Risks / Trade-offs

<!-- antislop: allow sentence-length -->
<!-- Why: the risk statement names the query, its cost and its existing precedent as one fact; splitting would separate the risk from what already accepts it. -->
**[Risk] The deletion-guard and scope-check queries are full scans of
`definitions` with no supporting index**, the same trade-off
`referencingProcesses` already accepts for data lists. → **Mitigation**:
both callers are admin/publish paths, never on an instance's hot path;
`referencingProcesses`' own design note (`report-column-usage`) already
accepted this for a table this change does not grow faster than.

<!-- antislop: allow sentence-length -->
<!-- Why: the risk statement names the cause and its consequence together. -->
**[Risk] `members` carrying no foreign key means a group can list a
nonexistent or since-deleted account indefinitely**, which never surfaces
as an error anywhere. → **Mitigation**: this is intentional (see
Decisions), and the resolution query already treats a nonexistent member
identically to a disabled one: zero runtime effect, silently.

<!-- antislop: allow run-ons sentence-length passive-voice -->
<!-- Why: the risk names two ways a group's scope can drift out from under a step in one sentence; "is explicitly allowed"/"is unaffected" describe the design's own stance, stated by this document, not an unnamed actor's action. -->
**[Risk] Narrowing a group's scope, or deleting the group after publish
via a path the deletion guard did not anticipate, could leave a published
process's `org.group-members` step resolving against a group whose scope
no longer covers that process.** → **Mitigation**: this is explicitly
allowed by design (group-administration's own "Narrowing scope after
publish succeeds" scenario) since the scope check is authoring-time, not
runtime; the deletion guard is the one hard backstop, and it is unaffected
by a scope narrowing since it checks `allowedGroups` membership, not
scope.

<!-- antislop: allow sentence-length passive-voice synonym-rotation -->
<!-- Why: "is wanted" names a hypothetical future preference, not an actor's action; the synonym-rotation flag pairs this paragraph's "client" with "operator" from an unrelated paragraph roughly 150 lines above, a known false-positive of the linter's sentence-merge-on-code-span bug, not an actual synonym pair in this paragraph. -->
**[Risk] The group-delete 409's wire `error.type` stays the generic
`"conflict"`, not a dedicated discriminant.** A client detects the case
only by shape-sniffing: `type === "conflict"` plus a `processIds` array
present. → **Mitigation**: this matches the convention
every other structured `"conflict"` 409 in this codebase already follows.
`admin-groups-screen` (the sibling change consuming this route) already
implements that shape-sniff in its own `parseErrorBody`, mapping the match
to its own client-side `"group-referenced"` `ClientError` variant. A
dedicated wire discriminant, if wanted later, is a coordinated decision
belonging to both changes. This change cannot make that decision
unilaterally while `admin-groups-screen` is mid-flight with detection code
already written against the current shape-sniffing convention. Making it
would need `design.md` and `tasks.md` under
`openspec/changes/admin-groups-screen/` updated alongside this route.

## Migration Plan

No stored instance or published definition references `allowedGroups` or
`org.group-members` today (pre-1.0, nothing deployed to preserve). The
migration is additive only:

<!-- antislop: allow sentence-length -->
<!-- Why: item 4 states each check's own trigger condition and the reason existing bodies are unaffected; splitting would separate a check's rule from its reason. -->
1. `initSchema` gains the `groups` table (`CREATE TABLE IF NOT EXISTS`,
   the same idempotent pattern every existing table uses); no existing
   table's DDL changes.
2. `ProcessBody` gains `allowedGroups` as `.optional()`, not
   `.default([])`, so every `examples/` body and every already-published
   body keeps parsing unchanged AND keeps its existing `definitionHash`
   (see Decisions). `.optional()` fits here for exactly this reason: a
   regression test (tasks.md task 2.5) publishes/parses a
   pre-change-shaped body and confirms its `definitionHash` still agrees
   after the field lands.
3. `createDefaultAssignmentRegistry` gains `org.group-members` alongside
   `org.manager-of-starter`; no existing registered strategy changes.
4. The two new publish-time checks do not share one trigger condition. The
   structural check (task 3.1) applies only to a step declaring
   `org.group-members`. The database-backed scope check (task 5.1) applies
   to every entry the body's `allowedGroups` declares, whether or not any
   step references `org.group-members` at all: a body could declare
   `allowedGroups` with zero `org.group-members` steps, and the scope check
   still runs over it. A body triggering neither is one declaring neither
   an `org.group-members` step nor an `allowedGroups` entry, true of every
   body that predates this change.

<!-- antislop: allow sentence-length passive-voice -->
<!-- Why: "is needed"/"is read" state what the migration plan requires and what nothing outside it depends on; there is no other actor to name. -->
No rollback step beyond reverting the change is needed: nothing this
change adds is read by code outside it, so an unpublish or a revert leaves
no orphaned reference.

## Open Questions

<!-- antislop: allow sentence-length passive-voice -->
<!-- Why: the sentence lists every resolved ambiguity together, so a reader sees the full set at once; "is resolved" names the state of the design, not an actor's action. -->
None. Every ambiguity the original design left (member referential
integrity, `allowedGroups`'s optionality, the deletion-guard query shape)
is resolved above, since each would have changed the specs or the task
breakdown if left open.
