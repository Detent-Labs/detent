## 1. Design pass

- [x] 1.1 Invoke `/frontend-design:frontend-design` and read `.claude/rules/design-language.md` before writing the screen
- [x] 1.2 Confirm the row, the stamp and the empty state match the started screen rather than inventing a second shape

## 2. Route and catalog

- [x] 2.1 Add `{ name: "involved" }` to `Route` in `packages/web/src/areas/app/routing.ts`, with its match and its path
- [x] 2.2 Add the `involved.*` keys to `packages/web/src/i18n/catalogs/app.ts`, English and German. Those are `involved.title`, `involved.empty` and `involved.loadMore`, plus `nav.involvedCases`
- [x] 2.2a Title and nav entry read "Cases I took part in" in English
- [x] 2.2b Both read "Vorgänge, an denen ich beteiligt war" in German
- [x] 2.3 Reuse the four `started.status*` keys rather than adding a second set

## 3. The screen

- [x] 3.1 Widen `listInstances`'s `scope` union in `packages/web/src/areas/app/api/client.ts` to `"mine" | "started" | "visible"`
- [x] 3.1a Extend that function's doc comment. The credential supplies the actor for `visible` too
- [x] 3.2 Write `packages/web/src/areas/app/screens/InvolvedScreen.tsx` against `startedLogic`, mirroring `StartedScreen.tsx`
- [x] 3.3 Mount it in `packages/web/src/areas/app/root.tsx`
- [x] 3.3a Add the nav entry after Cases I started, before Start a process
- [x] 3.3b Give it a lucide icon at 18px and 1.75 stroke

## 4. Tests

- [x] 4.1 `matchRoute("/involved")` and `routePath` round-trip in `routing.test.ts`, and the route joins the hand-listed arrays there and the shell's `areaHref` round-trip
- [x] 4.2 Stub `globalThis.fetch` in `bun:test`, call `listInstances("visible", token, { limit: 200 })`, and assert the requested search params read `scope=visible&limit=200`
- [x] 4.3 The row shape, the empty state and the failure state stay with the browser check in 5.1, as `starter-instance-list` did. This area tests no components
- [x] 4.4 Every new catalog key exists in both locales, through `packages/web/test/i18n-catalog-parity.test.ts`

## 5. Documentation

- [x] 5.1 `docs/browser-checks.md`: a section "Cases I took part in" beside "Cases I started", sourced to this change's task 5.1
- [x] 5.1a That section covers the nav entry and its wrap, plus a case the inbox dropped
- [x] 5.1b It also covers a revoked case, the empty state and German
- [x] 5.2 `docs/current-state.md`: a section on the took-part screen beside "Starter access to a started instance", naming `InvolvedScreen`, the reused `startedLogic` and the `involved.*` keys. The four-screen sentence higher up stays
- [x] 5.3 `ROADMAP.md`: the stage row for this change
- [x] 5.4 `tmp/offene-items.md` (untracked, the owner's tracker): item 31 moves through the status column

## 6. Verification

- [x] 6.1 `bun run typecheck`, `bun run build`, full `bun test` with `DATABASE_URL`, piped through `scripts/gates/silent-green.sh`
- [x] 6.2 The browser check from 5.1, against the production build
- [x] 6.3 Prose and whitespace gates over the pushed range
