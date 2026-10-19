# Design

## Context

See proposal.md for the motivation. Each item below names a site at
`origin/main` `4c270032`, the fact that contradicts it, and the new text.
Line numbers move as tasks land. An implementer therefore finds each site
by a quoted anchor phrase. The full audit text for each ID sits in
`openspec/changes/archive/2026-10-10-audit-record/`.

Every task is prose: Markdown or a comment. No code path changes, and no
rule in `src/schema/definition.ts` changes. The one test added pins
behavior the code already has.

## Goals / Non-Goals

**Goals:**

- Every sentence this change touches states what the code at HEAD does.
- Where a count would go stale again, the sentence names the governing
  spec instead (the lesson from CQ-2).

**Non-Goals:**

- No code fix. B-10's lock effect, the backfill scripts and the
  `stripCompiledContent` shape stay as they are.
- No antislop backfill of untouched paragraphs. The prose gate is a
  per-file ratchet, and a touched file only must not get worse.

## Decisions

### D1. The authoring guide (H-4, H-5, H-6, B-13)

- **H-4.** Replace the paragraph whose anchor is "this list is NOT frozen
  at step entry". Fact: `setGroupMembers` writes only the `groups` row. A
  claim checks the candidates stored at entry, through
  `isEligibleCandidate`. The new text follows.

  "Like the two strategies above, this list resolves at step entry. A
  membership change reaches the next entry with no republish. An instance
  already waiting keeps the list it entered with. For a one-off change,
  use delegation or send the instance through the step again. The
  `group-based-assignment` capability states the rule."
- **H-5.** Two sites carry the anchor "remain authorized regardless". At
  both, the subject becomes "an actor holding `system:cancel-any`, or a
  `cancel` grant over the process". The `cancellation` spec names the
  same two.
- **H-6.** Two sites put the three draft commands in the studio's "area
  nav". Write "header bar" at both, the glossary's word.
- **B-13.** Find the anchor "their length depends on the calendar". Add
  after its sentence: "A day is exactly 24 hours and a week exactly 168.
  Across a daylight-saving switch, a `P1D` timer therefore fires one hour
  off the wall-clock time it started at."

### D2. ROADMAP.md and roadmap-history.md (H-7)

- **Stage 40 title.** "FILTER AND DRAFT SCOPE NOT BUILT" becomes "DRAFT
  SCOPE DONE. FILTER NOT BUILT."
- **Stage 40 body.** The sentence "Today every author reaches every
  draft." and its follow-up become one sentence. That piece closed
  through the `process-access-roles` Developer list. The later passage
  anchored "every author sees and edits every draft" gets the same fix.
- **Counts.** Three anchors carry a stale count of eight: "declares eight
  constants", "The eight `system:*` roles" and "The eight constants
  split". They sit in a dated stage record. Each gets "at the time" or
  drops the count. One sentence points to the `authorization` spec for
  today's set.
- **The seam's growth.** The anchors "to four permissions" and "Six call
  sites" get the same treatment. Name the later `visibility` permission.
- **Stage 63.** Per the owner's ruling of 2026-10-19, the whole stage
  leaves Open stages. The Done table gains row 63, in the format of the
  rows above it. The prose moves to `docs/roadmap-history.md` under "63."
  in that file's own format. The reopen triggers move with it.

### D3. README.md, CLAUDE.md (H-8, H-9, coordinator note)

- **README.md roles.** The anchor "the eight reserved roles" names the
  reserved roles the `authorization` spec lists, with no count.
- **README.md handlers.** "Three action handlers ship" becomes "Four
  action handlers ship" and adds `instance.transition`.
- **CLAUDE.md tsconfig row.** It names the `include` list: `src`, `test`,
  `e2e`, `playwright.config.ts`, `scripts/e2e.ts`.
- **CLAUDE.md schema row.** The `src/schema/definition.ts` row becomes a
  `src/schema/` row. It names `definition.ts` as the definition contract
  and lists the other five files.
- **CLAUDE.md new `src/` rows.** `src/cel/` (check, eval). `src/tenancy/`
  (SaaS control plane: cli, connections, provision, store). One row for
  the single files `src/errors.ts`, `src/log.ts`, `src/pagination.ts`,
  `src/validate.ts` and `src/instant.ts`.
- **CLAUDE.md auth row.** The `src/auth/` row adds grants, groups and
  process access lists.
- **CLAUDE.md top level.** New rows for `docker/`, `docs/`, `e2e/`,
  `scripts/` and `openspec/`, each in the style of its neighbours.
- **CLAUDE.md pointer.** In the section that lists where the rest lives,
  add one line beside the 2026-08-18 record line. It names
  `openspec/changes/archive/2026-10-10-audit-record/` as the 2026-10-10
  audit. The owner approved this on 2026-10-19.

### D4. Spec deltas (H-10, D-9, persistence)

The deltas under `specs/` hold the exact text. The `authorization`,
`admin-operations-api` and `admin-user-management` deltas name the data list exception wherever a
requirement claims every `/admin/*` route needs `ADMIN_ROLE`.

- **The Purpose, by hand.** The `authorization` Purpose says "five fixed role
  strings". A delta cannot reach a Purpose, so the sync step changes
  `openspec/specs/authorization/spec.md` by hand. The phrase becomes "a
  fixed set of reserved role strings". Its claim that every `/admin/*`
  route is role-gated holds, since the data list roles count as reserved
  roles too.
- **Kept on purpose.** `admin-user-management` and `admin-operations-api`
  say "like every other `/admin/*` route" in eight requirements. Each
  compares an account route or an outbox route with its neighbours. Each
  of those routes does need `system:admin`. The comparison is loose but not false
  for the route it describes, so those requirements stay as they are.
- **Kept on purpose.** The `instance-visibility-set` backfill requirement
  describes `scripts/backfill-instance-principals.ts`, which still exists.
  The report records that handed-over question.
- **Kept on purpose.** No doc or spec claims that `stripCompiledContent`
  returns a contract with no `outcomes` key. The handed-over item from #26
  therefore stays as it is.
- **The persistence SaaS sentence.** It points at an existing
  requirement, "Each tenant database carries the whole schema from its
  creation". It states nothing that requirement does not, so it gets no
  scenario of its own.

`test/http-process-access.test.ts` gains one test. A Developer writes the
entry `auth0|42` and reads it back unchanged. An actor with id `auth0|42`
who holds `system:developer` then gets 200 from
`GET /processes/:processId/access`. It pins the `process-access-roles`
scenario "The engine stores an entry without a prefix".

### D5. Code comments (H-12, A-7, A-9, B-10, D-9, G-13, handed over)

- **`src/http/metrics.ts`.** The anchor "like `health.ts`'s handlers"
  names `handleLivez` and `handleReadyz` in `server.ts`.
- **`src/auth/authorize.ts` header.** "Seven gated operations" and "four
  fixed permissions" drop both counts and point to the `authorization`
  spec.
- **`src/auth/authorize.ts` `ADMIN_ROLE`.** Its doc stops claiming every
  `/admin/*` route. It calls the constant the operator role, and points to
  the `authorization` spec for what it gates.
- **`src/auth/authorize.ts` `DEVELOPER_ROLE`.** Its doc drops "Admits every
  studio route" and "the ONLY role". It points to the `authorization` spec,
  which names the access lists and the `migrate` grant.
- **`src/auth/authorize.ts` `DATALISTS_ROLE`.** Its doc names both authoring
  roles for reads, `DEVELOPER_ROLE` and `AUTHOR_ROLE`.
- **`src/http/routes.ts` visibility doc.** The anchor "every `/admin/*`
  route calls `requireRole` with `ADMIN_ROLE`" names the data list
  exception, as the `authorization` delta does.
- **Principal shape (D-9).** Two comments say an access-list entry is a
  `user_xxx` or `group_xxx` id: `src/auth/process-access.ts` and the
  `process_access_roles` comment in `src/engine/store.ts`. Both become "a
  non-empty actor id or group id, never a role string".
- **`src/schema/canonical-json.ts`.** The header says a body carries
  integers and non-integers both: `fieldValidation.min`/`max`, a literal
  `default`, `Path.priority`. RFC 8785 serializes a number the way
  ECMAScript does, and `JSON.stringify` already does that. Delete the
  `ponytail:` line that defers full number handling.
- **`src/schema/definition.ts` guards.** The anchor "named data sources"
  goes. Guards read data, instance and actor. A subprocess step's path
  guards also read `child.*`.
- **`src/schema/definition.ts` registry.** The anchor "output schema"
  goes. The comment says the three registries resolve `type` and check
  `config` at publish. Comments only.
- **`src/cel/check.ts`.** The `ponytail:` that waits for "the registry"
  names file and plugin field types only, and drops data sources. Its
  upgrade entry is `celType` in `src/cel/check.ts`. A plugin field type
  needs a field-type registry the engine does not have yet. A `file` value
  needs a CEL shape for an attachment reference.
- **B-10 sites.** Three comments say the subprocess return alone resolves
  an assignment under the row lock. Two sit in `src/engine/registry.ts`:
  the `AssignmentContext` doc and the `resolveStepAssignment` doc. One
  sits in `src/engine/transition.ts`, the `commitTransition` doc.
- **B-10 fact.** `submitAndTransition` passes its locked `tx` too. Each
  comment names both paths.
- **B-10 claim.** The anchor "holds a different pool connection" goes. On
  both locked paths the query runs on the transaction's own connection.
  The deadline returns control to the caller. Nobody has measured what
  the orphaned query does to the lock's duration. The comment points to
  the new `docs/decisions.md` entry from D6.
- **D-9.** `src/auth/cli.ts`'s header drops "the only way to create a
  local BPS user or change its password". It names `POST /admin/users` and
  `POST /admin/users/:userId/password` in its route list. The CLI stays
  the recovery path when no account holds `system:admin`.
  `src/auth/users.ts` stays as it is once this lands.
- **G-13.** `scripts/dev-webhook-sink.ts` drops the sentence anchored "the
  compose healthcheck's own path".
- **`src/http/routes.ts` grant sentence (from #33).** Find the anchor
  "`can` ignores the value today". New text: `can` reads the value as an
  untrusted id. A lookup over an unknown id answers false.
- **`src/http/routes.ts` role sentence.** The anchor "maps to
  `PUBLISH_ROLE` today" names the stored grant beside the role. It drops
  the claim that publish has no other use for the actor value.
- **`scripts/e2e.ts`.** The `server.ts:903` citation points at the
  current line of the "listening" log call.

### D6. docs/decisions.md and the runbook (H-7, H-11, A-9, B-10, handed over)

- **H-7.** The anchors "every author reaches every draft today" and "over
  three permissions" get D2's fixes. The permissions sentence names the
  `Permission` values the `authorization` spec lists.
- **A-9d.** Delete the entry that asks `compile.ts` to say "the remaining
  seven". It now does.
- **B-10.** Add one entry under the file's open questions. The submit path and the subprocess return
  both resolve an assignment on the locked transaction's connection. A
  resolver past its deadline leaves its query running there. Nobody has
  measured whether the commit then waits for it with the row lock held.
- **Citations (H-11, HO-6).** Re-point every `file:line` citation in the
  file. For each one, open the cited file at HEAD and find the line that
  holds what the prose claims. Where the claim no longer holds anywhere,
  reword the sentence or drop the number. The report lists each such case.
- **The citation table.** A table of 258 citations, checked at
  `4c270032`, sits under `.superpowers/sdd/sweep-docs-drift-2026-10/`. It
  is a hint only.
- **Known special cases.** `current-state.md:482` is gone, so drop the
  number. The CSP moved to `packages/web/csp.ts`. The bare `root.tsx`
  means `packages/web/src/areas/studio/root.tsx`. The "palette" entry's
  studio-canvas lines and requirement names moved. `server.ts:893`
  becomes the line of `if (!tenancy) await initSchema(db);`.
- **Audit index.** The `sweep-docs-drift-2026-10` entry is the last one
  under "Open from the 2026-10-10 audit". Earlier changes removed their
  entries outright. The archive commit deletes this entry and the
  now-empty section, heading and intro included.
- **Runbook anchor.** `docs/runbooks/deployment.md`'s `server.ts:893`
  citation gets the same new line.
- **Runbook upgrade path.** The paragraph anchored "Re-run the
  provisioning command's schema step" changes. The tenancy CLI has only
  `add-tenant` and `list-tenants`, and `add-tenant` refuses an existing
  key. State that no command re-runs the schema step for an existing
  tenant. Give the hand-run below instead, once per tenant database.

  ```sh
  DATABASE_URL=<tenant-url> bun -e "await (await import('./src/engine/store.ts')).initSchema(); process.exit(0)"
  ```
- **Proof of the hand-run.** The implementer runs it once against the
  devcontainer's own database before writing it down. The process must
  exit by itself.
- **Runbook failure point.** The anchor "fails at startup" becomes "fails
  when the schema step runs".

## Risks / Trade-offs

- [A merge of `main` after the sweep moves citations again] → The push
  step merges `origin/main` by a pinned SHA. If that merge touches a file
  `docs/decisions.md` cites, re-check those citations before the push.
- [A copied requirement imports antislop debt into a new delta file] →
  The deltas are already lint-clean. Each task runs the linter on the
  Markdown it touched.
- [The B-10 comment admits an unknown] → The unknown is real. The open
  entry in `docs/decisions.md` keeps it visible, and no comment claims a
  safety it cannot prove.

## Migration Plan

None. Nothing deployed reads this prose, and no stored data changes.

## Open Questions

None. The owner ruled on the three open questions on 2026-10-19.
