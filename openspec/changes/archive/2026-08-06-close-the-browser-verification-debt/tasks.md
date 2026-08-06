# Tasks

## 1. The checklist that outlives the archive

- [x] 1.1 Write `docs/browser-checks.md`. Open it with three operating rules:
      the address is the contributor's own published port on `127.0.0.1`
      (give the two-line `.devcontainer/docker-compose.override.yml`
      snippet, gitignored and per-machine, suggested mapping `3001:3000`);
      the frontend bundle must be built first (`bun run --filter packages/web
      build`), since the engine serves `packages/web/dist` and that
      directory is a build output; and no `bun test` run may overlap a
      manual run.
- [x] 1.2 Record why the address is `127.0.0.1`, not `localhost`. Under
      Windows `localhost` resolves to `::1` and the connection hangs.
- [x] 1.3 Write the entry for the `iframe` refusal. It needs a second origin,
      so serve the framing page from a second port. Source:
      `2026-08-06-deliver-framing-and-sniffing-headers` task 5.3.
- [x] 1.4 Write the entry for the attachment download. Confirm the browser
      saves the file rather than rendering it. Source:
      `2026-08-06-harden-http-response-boundary` task 7.3.
- [x] 1.5 Write the entry for the form editor's pointer work: drag and drop,
      the two-column canvas, and a keyboard-only reorder. Name the Panzoom
      `panzoom-exclude` race as the reason this stays live. Source:
      `2026-08-06-view-layout-and-form-editor` task 8.3.
- [x] 1.6 Write the entry for the studio modal's remaining points: stacking
      above the top layer, focus return, backdrop behavior, and Close
      discarding nothing. Source: `2026-08-06-studio-edit-shared-modal`
      tasks 6.3 and 6.4.
- [x] 1.7 Point `CLAUDE.md`'s browser bullet at the file.

## 2. Disposition over a declared ledger

- [x] 2.1 Read `src/http/server.ts:155-179` (`isBinaryResult`,
      `toBinaryResponse`) and the `GET /metrics` branch at `584-588`. Name
      every route that returns `HttpBinaryResult`: the attachment download
      (with a filename) and `/metrics` (without one).
- [x] 2.2 Export a `BINARY_ROUTES` ledger from `src/http/server.ts`:
      `{method, pattern, filename: boolean}[]`, one entry per route named in
      2.1. State in a comment that the list is declared, not derived — a
      route added outside it needs a person to add the entry.
- [x] 2.3 Add `test/http-disposition.test.ts`. Drive `createServer`'s handler
      with no port, the way `test/http-static.test.ts` does. Seed a published
      process, an instance and an uploaded attachment through the upload
      route, the way `test/http.test.ts:1086` does; the case is
      `test.skipIf(!DB)` against the `_test` database.
- [x] 2.4 Assert `Content-Disposition: attachment` with a percent-encoded
      filename on every `BINARY_ROUTES` entry marked `filename: true`.
- [x] 2.5 Assert that a JSON envelope, and the `/metrics` entry, carry no
      such header.

## 3. A refused host reaches the dead-letter list

- [x] 3.1 Add a case to `test/outbox.test.ts`. Wrap it in `withEnv`
      (`test/handlers-http.test.ts:53`) to set `HTTP_ACTION_ALLOWED_HOSTS`
      for the case alone, independent of the devcontainer's own value. Drive
      one `http.request` action against a host the allowlist refuses.
- [x] 3.2 Assert the row reaches the dead-letter status, and that
      `listOutbox` returns it under a dead-letter filter.
- [x] 3.3 Assert the message names the refused host.
- [x] 3.4 Assert that a permitted host does not dead-letter on that account.

## 4. `InstanceView.columns` defaults to 1

The render side of this is already covered. `form-ui`'s own base spec
requires the one-column default and the group-stacking behavior.
`packages/form-ui/test/field-form.test.tsx` already asserts both. The
`runtime-api` base spec already requires `InstanceView.columns` to resolve an
absent `view.columns` to `1`. Neither spec gains a requirement here. The gap
is that `test/runtime-api.test.ts` has no case for it.

- [x] 4.1 Add a case to `test/runtime-api.test.ts`: publish a body whose step
      view declares no `columns`, call `getInstanceView`, and assert
      `InstanceView.columns === 1`.
- [x] 4.2 Add a case publishing a step view with `columns: 2`, asserting
      `InstanceView.columns === 2` and that a `span: 2` field's resolved span
      survives.
- [x] 4.3 Confirm both cases need no DOM and no browser: they drive the
      engine and the Runtime API Layer directly.

## 5. Authored text under the studio area routes through the localized-text helper

`studio-app`'s existing requirement already states the six warning sites.
`missingTranslationWarning` (`packages/web/src/areas/studio/draft/
localized-text.ts`) draws them. It reads `useDraft`'s `contentLocale`, which
exists only in the studio area. This rule stays scoped there.

- [x] 5.1 Add the rule to `packages/web/test/boundaries.test.ts`, scoped to
      `src/areas/studio/`: a `LocalizedTextInput` rendered there SHALL sit
      beside a call to `missingTranslationWarning`, or carry an inline
      comment saying why.
- [x] 5.2 Confirm the rule finds the six sites `studio-app`'s requirement
      already enumerates, across `StepsPanel.tsx`, `EditScreen.tsx` and
      `FieldCatalogPanel.tsx`.
- [x] 5.3 Ship the rule green. Give any exempt site an inline comment saying
      why.

## 6. Router coverage in every area

- [x] 6.1 Read `packages/web/test/admin-routing.test.ts` for the shape:
      match, round-trip, a deeper path that falls back, and two routes
      sharing a leading segment.
- [x] 6.2 Confirm `studio-routing.test.ts` already carries match, round-trip
      and half-match coverage; it needs only the shared-prefix case (6.4).
- [x] 6.3 Add the deeper-path case `matchRoute('/tasks/a/b')` to
      `routing.test.ts`; match and round-trip coverage is already present.
- [x] 6.4 In the studio and reporting tests, assert that two routes sharing a
      leading segment each reach their own route (studio has one under
      `/processes/:id/...`; the app area declares no such pair, so it needs
      no case).
- [x] 6.5 Add `packages/web/test/reporting-routing.test.ts` in the
      `admin-routing.test.ts` shape: each of the three views matches, every
      route round-trips through `routePath`, `/processes/x/nonsense` falls
      back to the picker, and `/processes/x/sla/extra` does not half-match.

## 7. Documentation

- [x] 7.1 Sync `docs/current-state.md`'s verification entry with the split
      and with the checklist's location.
- [x] 7.2 Confirm no rule in `docs/authoring-guide.md` changes. This change
      touches no contract rule.
- [x] 7.3 Add the check to `.claude/skills/openspec-archive-change/SKILL.md`:
      before archiving, an unchecked browser task moves into
      `docs/browser-checks.md` first, or the archive is refused.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`.
- [x] 8.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts. Compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [x] 8.3 Run the antislop linter over every Markdown file this change
      touches, and report the count per file.
- [x] 8.4 Run `git diff --check`. Then read `git ls-files --eol` for a `w/`
      column showing CRLF.
- [x] 8.5 Walk `docs/browser-checks.md` end to end, against the bundle it
      says to build and the address it says to publish, with no `bun test`
      run in flight. This one run closes the four manual entries the
      2026-08-06 archive left open.
- [x] 8.6 Confirm every assertion this change adds runs with no listening
      socket.
