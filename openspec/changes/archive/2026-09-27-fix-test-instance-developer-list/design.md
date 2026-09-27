# Design

## Context

See proposal.md for the gap. Three sibling routes in `src/http/studio-routes.ts` already gate a draft correctly: `handleGetDraft`, `handleSaveDraft` and `handleDeleteDraft`.

`handleGetDraft` and `handleDeleteDraft` share one branch. If `hasNoDraftAndNoPublishedVersion` holds, `requireAuthoring` runs alone. Otherwise `requireAuthoring` runs unless the actor holds `ADMIN_ROLE`, and `requireDeveloperListOrAdmin` runs after it.

`handleCreateTestInstance` passes `requireAuthoring` alone as its gate. `createProcessInstance` with `fromDraft` checks no access either.

## Goals / Non-Goals

**Goals:**

- The test-instance route refuses every actor that `GET /drafts/:processId` refuses for the same process.

**Non-Goals:**

- Vuln 1, draft snapshots read through negative version numbers. The worktree `fix-draft-snapshot-version-read` covers it.
- A check inside `createProcessInstance`. The HTTP route is the only caller with `fromDraft: true` that an outside actor reaches.

## Decisions

### Copy the `handleGetDraft` gate

The gate callback becomes the same `async (actor) => { … }` body as in `handleGetDraft`. The owner chose this on 2026-09-27.

- Alternative: keep `requireAuthoring` for every actor and add `requireDeveloperListOrAdmin`. That refuses an admin who has no authoring role. The admin could still read and change the draft through the sibling routes, so the refusal protects nothing.
- Alternative: extract one shared helper for the four routes. `handleSaveDraft` differs on the creation branch. So a helper would cover three routes. Three copies of eight lines stay easier to read than one more indirection. Skip the helper.

### Keep the 404 for a process with no draft

For a process with no draft and no published version, the gate runs `requireAuthoring` alone. The handler then finds no draft and returns the `notFound()` 404, as today. A process with only a published version gets the list check first, then the 404.

### Enforce at the route

`createProcessInstance` takes an `Actor` but checks no access on any branch. Any actor may start a published instance, by design. The draft branch has one caller, `handleCreateTestInstance`. A `process.start` action from a test instance starts the target's latest published version, never its draft. So the check sits at the route, the same place the sibling routes use.

## Risks / Trade-offs

- [An author on no list loses test runs they used to start] → That access was the defect. Such an author could not open the draft in the studio anyway.
- [The sibling worktree edits the same file] → Expect a small merge conflict in `src/http/studio-routes.ts`. Resolve it by keeping both edits.

## Migration Plan

No data changes. Test instances that an unlisted actor already started stay in place. The fix gates only new creation requests.

## Open Questions

None.
