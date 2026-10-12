## Why

Author U holds `system:author` and a global `system:publish`, but is not on the
Developer list of `proc_P`, which team B owns. `GET /drafts/proc_P` answers
403. `POST /drafts/proc_P/publish` still publishes team B's unfinished draft,
and `POST /processes` publishes any body under `proc_P`. The Developer list
gates the four draft routes and neither publish route. The purpose line of
`process-access-roles`, "A Developer edits and publishes the process", says
the list covers publishing. The owner ruled on 2026-10-10 that the purpose line
stands and the code follows.

## What Changes

- `POST /drafts/:processId/publish` and `POST /processes` refuse a non-admin
  actor who is not on the process's Developer list, with 403. The check runs
  beside the existing `publish` permission check, never in place of it.
- `system:admin` bypasses the list on both routes, as it does on the four draft
  routes.
- The first publish of a process that has no draft and no published version
  stays open. No Developer list exists for it yet. This is the same carve-out
  `GET`/`PUT`/`DELETE /drafts/:processId` already draw.
- `POST /processes` writes the publishing actor onto the Developer list when
  it creates a process. Without that entry the publisher would lose access to
  their own process after version 1.
- A process-scoped `publish` grant does not stand in for a list entry. A grant
  names a role and a list names an actor or a group, so the two stay separate.
- The specs that name only "the four draft routes" for the list now name the
  two publish routes as well.
- `docs/openapi.yaml` describes the new 403 on `POST /processes`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `process-access-roles`: a new requirement states that the Developer list
  gates both publish routes, with the admin bypass and the first-publish
  carve-out. The creator-seeding requirement also covers the first publish
  through `POST /processes`.
- `studio-publish`: the publish-route requirement adds the list check beside
  the authoring role and the `publish` permission.
- `authorization`: the permission-seam requirement now names the two publish
  routes beside the four draft routes.
- `http-wrapper`: the `POST /processes` requirement adds the list check after
  the permission check.

## Impact

- `src/http/studio-routes.ts` (`handlePublishDraft`), `src/http/routes.ts`
  (`handlePublish`) and `src/auth/process-access.ts` (the shared list check
  moves here from `studio-routes.ts`, because `routes.ts` cannot import
  `studio-routes.ts` without a cycle).
- Tests for both routes, and the existing tests that republish as an unlisted
  non-admin. The Studio import of a promotion file (`ProcessesScreen.tsx`)
  calls `POST /processes` and shows the new 403 text as the server returns it.
- No schema, `definitionHash` or definition contract
  change. No UI change: a listed-off actor already cannot open the draft, so
  the Studio never offers Publish for it.
- A caller that publishes through `POST /processes` for an existing process now
  needs a list entry as well. The entry needs the actor to hold
  `system:developer` or `system:author`, as the list rule already requires for
  every Developer match. A service account holding only `system:publish`
  stays refused on an existing process until an admin publishes for it.
