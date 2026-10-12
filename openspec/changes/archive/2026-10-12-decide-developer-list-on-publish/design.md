## Context

See `proposal.md` for the finding and the owner's ruling (option A).

Four routes check the Developer list today, through a private helper
`requireDeveloperListOrAdmin` in `src/http/studio-routes.ts`. Each one first
asks `hasNoDraftAndNoPublishedVersion` (`src/engine/drafts.ts`). When that is
true the list does not exist yet and the route skips it. Otherwise the route
requires `ADMIN_ROLE` or a match from `matchesAccessList`
(`src/auth/process-access.ts`). A Developer match needs the actor's id or one
of their groups on the list, and one of `system:developer` and
`system:author` on the actor.

`handlePublishDraft` runs `requireAuthoring` and `requirePermission(…,
"publish", …)`. `handlePublish` (`src/http/routes.ts`) runs
`requirePermission` after the body shape check. Neither reads the list.

The Studio's import of a promotion file (`ProcessesScreen.tsx`,
`confirmImport`) is the one UI caller of `POST /processes`. It shows the
server's refusal text as returned, so it stays as it is.

Only draft creation writes the creator onto the list (`saveDraft` calls
`appendCreatorAsDeveloper` in the insert transaction). A process first
published through `POST /processes` has no list at all.

## Goals / Non-Goals

**Goals:**

- One check, one definition of "first publish", used by all six routes.
- A first publisher through `POST /processes` can publish version 2 next.

**Non-Goals:**

- The pure-owner surface and list validation in `docs/decisions.md`. They stay
  decided and not built.
- Any change to `can`, `requirePermission` or the grant model.
- Any Studio change. A listed-off actor already gets 403 on `GET
  /drafts/:processId`, so the Studio never reaches Publish for it.

## Decisions

**The helper moves to `src/auth/process-access.ts` and becomes an export.**
`routes.ts` cannot import `studio-routes.ts`, which already imports `routes.ts`
for `route` and `readJson`. `process-access.ts` already imports
`ADMIN_ROLE` and `AuthorizationError`, so the admin bypass and the refusal
need nothing new. It gains one import, `hasNoDraftAndNoPublishedVersion`
from `src/engine/drafts.ts`; `drafts.ts` does not import `process-access.ts`,
so no cycle forms.
The four draft routes keep their own call sites and change only the import.
Alternative: a copy in `routes.ts`. Rejected, since two copies drift.

**`requirePublishListAccess(actor, processId, db)` carries the publish-side
rule.** It returns true for a first publish: no draft and no published
version. Otherwise it returns false for
`ADMIN_ROLE` or a list match, and throws the refusal the draft routes throw.
Both publish handlers call it directly after `requirePermission`.
`POST /processes` reuses the boolean to decide the seeding. Alternative: inline the three lines in each handler.
Rejected for the same drift reason. A copy could also get the first-publish
carve-out wrong.

**Order: authoring role, `publish` permission, then the list.** The cheap role
check stays first. The list check costs up to three queries, so it runs only
for an actor who already holds the permission. This leaves the existing 403
for "no `publish` permission" untouched.

**`POST /processes` seeds the first publisher onto the list.** Without that,
option A locks out a non-admin API publisher after version 1. The
process has no list, so version 2 reads 403 for every non-admin. When the
`hasNoDraftAndNoPublishedVersion` answer is true, `handlePublish` runs
`publishBody` and the list insert in one `withTransaction`, as
`handlePublishDraft` already wraps `publishBody` and `markDraftPublished`. A
failed publish rolls the insert back. The insert reuses the idempotent append
`drafts.ts` holds as `appendCreatorAsDeveloper`; that function is exported for
the purpose. Alternative: leave the process unlisted and document the lockout.
The owner's ruling says the first publish "stays possible". A first publish
that strands its publisher does not meet that.

**The seeded entry stays subject to the list's own role rule.** A publisher
holding `system:publish` alone lands on the list. The Developer match still
fails for lack of `system:developer` or `system:author`. That is the
list rule applied unchanged. Changing it would be a change to
`process-access-roles` matching, not to publishing.

**A scoped `publish` grant does not bypass the list.** `authorization` keeps
grants and the list as separate mechanisms. An admin who wants a grant holder
to publish adds them to the list.

## Risks / Trade-offs

- [An integration publishing through `POST /processes` as a non-admin
  service account without `system:developer` or `system:author` stops working
  for existing processes] → The spec states it. An admin publishes for it, or
  the account takes `system:author` and a list entry.
- [Two concurrent first publishes of one new `processId` pass the carve-out]
  → Both publish, as versions 1 and 2. Both actors land on the list. Draft creation has the same race, closed there by the primary key. The
  window is one request wide, and the outcome is two listed developers.
- [Existing tests publish as an actor who never created the draft] → Each
  gains a list entry or an admin actor.

## Migration Plan

No schema change and no data migration. The change ships as one deploy. Rollback is
a revert of the commit, since the seeded list rows only grant access that a
reverted build ignores. A process published through `POST /processes` before
this change has no list. An admin adds the publishers, or publishes for them.

## Open Questions

None.
