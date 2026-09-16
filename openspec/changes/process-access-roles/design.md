## Context

See `proposal.md` for the motivation. Three existing pieces matter here.

`src/auth/authorize.ts` holds `Permission` (`"publish"`, `"cancel"`,
`"migrate"`, `"read"`, `"visibility"`), `PERMISSION_ROLE`, and `can`/
`requirePermission`. Each checks a global role first, then a stored
`permission_grants` row. A grant names a role string. It cannot name an
individual user or group.

`src/engine/instance-principals.ts` (`instance-visibility-set`) already
stores per-instance principal sets. Each entry is a `user_xxx` or
`group_xxx` id. A match resolves against the actor's own id and live group
membership, via `getGroupsForMember`. This change reuses that pattern at
the process level.

`src/engine/drafts.ts` and `src/http/studio-routes.ts` gate the four draft
routes on `DEVELOPER_ROLE`/`AUTHOR_ROLE` alone, with no per-process
narrowing. `GET /processes` (`definition-store`) is a separate, unfiltered
route. `end-user-app` and `admin-app` read it too.

## Goals / Non-Goals

**Goals:**
- A process keeps its own Developer, Owner and Reader lists. Each holds
  users and groups, resolved live against role and group membership.
- Editing an existing process needs Developer-list membership. Creating a
  new one needs `CREATE_ROLE`.
- An Owner self-serves the Reader list, without an admin action per
  process.
- Every existing process keeps working for its current authors at rollout.

**Non-Goals:**
- A non-studio surface for a pure Owner (`system:owner` alone, no studio
  access). Deferred; this change's Access surface sits inside Studio.
- Changing `publish`, `cancel`, `migrate` or `visibility`. Those stay on
  `permission_grants`, unchanged.
- Changing `GET /processes` itself. It stays unfiltered. Only the Studio
  screen's own combined view narrows.
- Write-time eligibility validation on a list entry. The role check is a
  read-time filter only, matching how a group's own membership already
  works.

## Decisions

**A new table, not `permission_grants`.** `permission_grants` maps a role
string to a permission and a scope. It has no user or group id to write.
`instance_principals` already solves "who matches this list" for
`user_xxx`/`group_xxx` entries, with live group resolution. This change
adds a sibling table, keyed by `(processId, kind, principal)`, with
`kind IN ('developer', 'owner', 'reader')`. A shared match function mirrors
`actorPrincipals`.

Alternative considered: widen `permission_grants`'s `role` column to also
accept a `user_xxx`/`group_xxx` value. Rejected. `hasGrant`'s `role = ANY(
actor.roles)` check assumes every row names a role. A row naming a user
instead would pass through it silently wrong. Every existing reader of that
table would then need a new kind discriminator.

**The Reader-list check is additive inside `can`, not a parallel gate.**
`can(actor, "read", processId, db)` gains a third test, after the global
role and the stored grant. A route calling `requirePermission(actor,
"read", ...)` stays the same. The new test rides inside the existing seam.

Alternative considered: a separate function the two `scope=all`/reporting
call sites would call beside `can`. Rejected. It would duplicate the
"try each test in order" logic `can` already owns. A future third
read-granting mechanism would then need a second call site touched instead
of one.

**Eligibility is read-time, not write-time.** A Developer or Owner entry
can name an account with no eligible role yet. This matches
`instance_principals`. A group's membership can change after a Developer
or Owner writes the list. The list stays as written either way.

Alternative considered: reject a write when the named account or group has
no eligible member today. Rejected. The write path would need to
resolve group membership and account roles synchronously. It would also
forbid provisioning a list ahead of a directory sync, the same reason
`permission-grant-administration` already gives for its own free-text
`role` column.

**`GET /processes` stays unfiltered.** The Studio screen narrows on its own
data instead. Three consumers read `GET /processes`: `end-user-app`'s Start
screen, `admin-app`'s pickers, and the Studio process list. The first two
need the unfiltered list. The Studio
`/processes` screen additionally reads the actor's own Developer- and
Owner-listed process ids, a new, small read this capability exposes. It
intersects that set with what `GET /processes` and `GET /drafts` already
return, in the browser.

Alternative considered: a query parameter on `GET /processes` that narrows
to the caller's own lists. Rejected. The route's two other callers would
need to keep passing an explicit "give me everything" flag forever. A
forgotten default would silently break the participant Start screen.

**Process creation and Developer-list membership are one write.** `PUT
/drafts/:processId` inserts the draft and the Developer-list entry
together. Neither persists without the other, per `process-drafts`'s
delta. A crash between the two cannot strand a process. Otherwise only
`ADMIN_ROLE` could still change it.

**Rollout migration seeds every existing process's Developer list from
today's global-role holders.** Every account holding `system:developer` or
`system:author` becomes a Developer of every process already carrying a
draft or a published version. This runs once. It is not an ongoing rule.
After rollout, a process's Developer list changes like any other list. A
newly created `system:developer` account does not retroactively join every
process.

## Risks / Trade-offs

- **[Risk]** The rollout migration adds every current author to every
  process. An installation may see that as broader access than it wants
  long term.
  Mitigation: it matches today's behavior at cutover exactly, since every
  author already reaches every draft. Narrowing afterward is a normal
  Developer-list change instead of a second migration.
- **[Risk]** A Developer can remove every other Developer from a process,
  including themselves. The process then becomes editable only through
  `ADMIN_ROLE`.
  Mitigation: `admin-user-management` already accepts this shape for a
  role change on another account. Only the caller's own `system:admin`
  status gets a stronger, blocking guard there. This change adds the same,
  unguarded shape for the narrower Developer-list case.
- **[Risk]** A group entry filters by role at read time. An admin cannot
  tell from the list alone which members currently have access.
  Mitigation: every `Step.assignment` group-based candidate list, and
  `instance_principals` itself, already work this way. This change keeps
  that same opacity. It does not deepen it.
- **[Trade-off]** The Studio process list narrows in the browser, over two
  already-fetched lists, instead of through a server-side filtered
  endpoint.
  `GET /processes` and `GET /drafts` stay untouched, and an actor's browser
  briefly holds process ids they cannot open. Accepted: `GET /processes`
  already reaches a participant's browser this way for `/start`. No row
  renders anything beyond id, label and hash.

## Migration Plan

1. Add the new table and its read/write functions (`process-access-roles`).
   Wire no route to it yet.
2. Run the one-time rollout migration against every existing process. It is
   safe to re-run.
3. Wire the Developer-list gate into the four draft routes. Keep it behind
   a feature check until step 2 has run everywhere it needs to. Drop the
   check once rollout succeeds everywhere.
4. Add `CREATE_ROLE` and `OWNER_ROLE`. Grant `CREATE_ROLE` to every account
   that should keep creating new processes. This is not inferred from
   existing data; "who may create" is a new distinction with no prior
   equivalent.
5. Ship the `can(actor, "read", ...)` third test, the Studio Access
   surface, and the narrowed `/processes` screen together.

Rollback: every step stays additive until step 3 flips the draft-route
gate. Reverting step 3 alone keeps the table and the migration in place.
It restores today's "any author reaches every draft" behavior, with no
data loss. The new lists sit beside the existing gate. They do not replace
its storage.

## Open Questions

None. Brainstorming resolved every fork this design raised: the ownership
model, the Owner/Developer capability split, eligibility timing, and
`GET /processes`'s scope. Each is reflected above.
