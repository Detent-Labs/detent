## 1. Record-read authorization (land and test independent of the UI work)

- [x] 1.1 In `src/runtime/api.ts`, give `getInstanceRecord` an `actor: Actor`
      parameter and the two-path check: `requireRole(actor, ADMIN_ROLE)`
      first; on `AuthorizationError`, load the instance via the same private
      `loadInstanceForRead` helper `cancelInstance` already uses, and permit
      the read only when `actor.roles.includes(DEVELOPER_ROLE) &&
      instance.startedBy === actor.id`; otherwise throw the same
      `AuthorizationError`, whether or not the instance exists.
- [x] 1.2 In `src/http/routes.ts::handleInstanceRecord`, drop the
      unconditional `requireRole(actor, ADMIN_ROLE)` and pass the resolved
      `actor` through to `getInstanceRecord` instead.
- [x] 1.3 Update every other in-repo call site of `getInstanceRecord` (e.g.
      any admin-side caller) to pass the actor it already has in scope.
- [x] 1.4 Add tests mirroring `cancelInstance`'s existing starter-bypass
      tests: an admin reads any record; a developer reads the record of an
      instance they started; a developer is refused for one they did not
      start; a plain participant (neither role) is refused even for an
      instance they started, unchanged from today.

## 2. Studio: registry route and Tools screen

- [x] 2.1 Add `GET /registry` to `src/http/studio-routes.ts`
      (`DEVELOPER_ROLE`-gated, unprefixed), returning
      `{ actionTypes: [...registry.keys()], dataSourceTypes:
      [...dataSourceRegistry.keys()] }` from the server's existing injected
      `Registry`/`DataSourceRegistry`.
- [x] 2.2 Add the route to `src/http/server.ts`'s dispatch table alongside
      the other studio routes.
- [x] 2.3 Add `packages/studio/src/screens/ToolsScreen.tsx` (or equivalent):
      renders the two type-name lists from `GET /registry`.
- [x] 2.4 Add the CEL scratchpad to the Tools screen: an expression input, a
      catalog picker (a published version via the existing
      `GET /processes/:processId/versions/:version` route, or the current
      draft), and client-side parse/type-check via `workflow-engine/cel/check`
      — no new HTTP call for the check itself.
- [x] 2.5 Wire `/tools` into `packages/studio/src/routing.ts` and the shell
      navigation.
- [x] 2.6 Add `packages/studio/test/` coverage for the scratchpad's pure
      logic (valid expression, undeclared-field reference) following the
      existing `*Logic.ts` + `bun:test` convention.

## 3. Studio: Player screen

- [x] 3.1 Deviated from the literal task: `packages/editor/src/player/`
      wasn't copied file-for-file. `packages/editor`'s Player had its own
      standalone serverUrl+login connection (a leftover from when the
      editor had no shared session at all). Studio already has one
      shared, logged-in session for everything else, so a second login
      screen inside Player would have been redundant. Instead,
      `packages/app`'s `TaskScreen`/`api/client.ts` — which already calls
      the same Runtime API Layer routes over the same shared-session
      model Studio uses — served as the template: extended
      `packages/studio/src/api/client.ts`/`types.ts` with
      `createInstance`/`getInstanceView`/`submitPath`/`claimStep`/
      `releaseClaim`/`getInstanceRecord` and the richer `ClientError`
      union, reusing studio's existing `request()`/`StudioClientError`.
- [x] 3.2 Fix the known gap the carried-over code has: import
      `form-ui/form-ui.css` at the Player's own entry point — `packages/editor`'s
      Player never did, leaving its forms unstyled; Studio's Player SHALL
      close this gap rather than reproduce it. Done at
      `packages/studio/src/main.tsx`; `form-ui` also had to be added as a
      new dependency in `packages/studio/package.json` (it had none before
      Player existed).
- [x] 3.3 Add `packages/studio/src/screens/PlayerScreen.tsx` at
      `/processes/:processId/play`: create/open an instance, render the
      current step via `form-ui`, submit, claim/release, manual refresh,
      mapped error states.
- [x] 3.4 Fetch and render the instance's merged record
      (`GET /instances/:id/record`) beside the form, refetching whenever the
      instance view refetches.
- [x] 3.5 Wire the Player route into `packages/studio/src/routing.ts` and
      the shell navigation (a "Player" link on the edit screen), reachable
      from an open process, without discarding any unsaved draft the
      developer was editing (Player holds no draft state of its own).
- [x] 3.6 Add `packages/studio/test/playerLogic.test.ts` covering
      `describeRecordElement`/`seedFormValues`, following the existing
      `*Logic.ts` + `bun:test` convention.
- [x] 3.7 (not originally listed) Verified Tools and Player end-to-end in
      a real browser via `playwright-cli`: logged in as a `system:developer`
      test user, authored and published a process through the JSON view,
      drove the CEL scratchpad against both a valid and an invalid
      expression, and drove Player through create → submit → completed,
      confirming the merged record renders and the new developer-record-read
      authorization actually works against a live server. Zero console
      errors throughout.

## 4. Delete packages/editor

- [x] 4.1 Grep the full repo for `packages/editor` (source, configs, docs,
      scripts, `.devcontainer/`, `.githooks/`) beyond the studio/manifest
      check the proposal already ran, to catch any remaining reference
      before deletion. Found and fixed two real, load-bearing gaps neither
      the proposal nor design.md anticipated: `.devcontainer/devcontainer.json`'s
      `postCreateCommand` ran
      `./packages/editor/node_modules/.bin/playwright install` (would have
      broken devcontainer setup outright — no remaining package needs
      Playwright, so the whole install step is now removed, not just the
      path), and `openspec/config.yaml`'s project-context description (the
      same "five packages" paragraph fed to every OpenSpec artifact this
      session) still described `packages/editor` as existing. Also fixed
      two stale comments in `packages/studio/src/api/client.ts` and
      `packages/studio/test/draftToolbarState.test.ts`, and `README.md`'s
      repository-layout table/summary (ahead of task 5.3, since it's the
      same kind of edit).
- [x] 4.2 `git rm -r packages/editor`.
- [x] 4.3 Delete `packages/editor`'s dev origin
      (`http://localhost:5176`) from the devcontainer's
      `CORS_ALLOWED_ORIGINS`.
- [x] 4.4 Confirm `bun install` still produces a single root `bun.lock`
      with no dangling workspace-member reference to `packages/editor`.
      Confirmed: `bun install` reports "Removed: 1", and `bun.lock` has
      zero remaining `editor` matches.

## 5. Spec and doc sync

- [x] 5.1 Apply the 22 spec deltas in `specs/` to `openspec/specs/`
      (2 new capability files, 8 modified, 12 removed). `openspec validate
      --specs` passes at 57/57 (55 remaining + 2 new); `openspec validate
      studio-tools-and-player` still passes.
- [x] 5.2 Update Purpose-paragraph prose (not covered by the delta
      mechanism) in `spa-accessibility`, `spa-error-reporting`, `form-ui`,
      and `frontend-security-headers` to drop `packages/editor` from their
      package enumerations, and in `authorization` to point to the new
      developer-record-read requirement the same way it already points to
      the cancel exception.
- [x] 5.3 Update `CLAUDE.md`'s repository-layout listing: drop the
      `packages/editor/` row and the "deleted when studio-tools-and-player
      lands" annotations in its own entry and in `packages/form-ui`'s. Also
      fixed the codebase-memory and UI-work-goes-through-design-skills
      mentions elsewhere in the file.
- [x] 5.4 Update `ROADMAP.md`: mark `studio-tools-and-player` DONE and
      stage 11 (Process Studio) fully DONE, with a new subsection
      describing what shipped.
- [x] 5.5 Add a "Process Studio, tools and Player" entry to
      `docs/current-state.md`, and delete the two whole entries describing
      `packages/editor`'s own internals ("Editor" and "Player/Preview UI")
      that this new entry supersedes. Fixed every other `packages/editor`
      mention in the file to read correctly now that it's deleted (past
      tense for historical mentions, dropped from still-current
      enumerations like the CORS origin list).

## 6. Verification

- [x] 6.1 Run `bun run typecheck` from the repo root; it SHALL run only the
      engine's and the three remaining frontend packages' checks (no
      `packages/editor` typecheck script left to run). Confirmed: only
      `form-ui`, `admin`, `app`, `studio` typecheck, all exit 0.
- [x] 6.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun — the DB-backed suites share one database and
      contend when run back-to-back in isolation), and confirm the skip
      count matches expectations (no silent skip from a missing
      `DATABASE_URL`). First run: 1261 pass, 1 fail
      (`test/subprocess.test.ts`'s "a nested initial-step chain spawns a
      grandchild and returns upward" — unrelated to anything this change
      touches: subprocess/outbox spawn-chain mechanics, not auth, routes,
      CEL, or the studio frontend). Immediate re-run: 1262 pass, 0 fail,
      confirming a pre-existing flake, not a regression.
- [x] 6.3 Confirm `openspec validate studio-tools-and-player` still passes
      after any last-minute spec edits made during implementation.
      Confirmed, and `openspec validate --specs` also passes 57/57.
