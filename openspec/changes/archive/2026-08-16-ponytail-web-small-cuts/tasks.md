## 1. Drop the `immer` dependency (finding 32)

- [x] 1.1 In `packages/web/src/areas/studio/draft/store.tsx`, replace the
  `mutate` case's `produce(state.draft, action.recipe)` with a
  `structuredClone` of `state.draft`, the recipe run against the clone, and
  the clone returned. See design.md decision 1.
- [x] 1.2 Add the `ponytail:` comment on that case. It names the ceiling,
  a whole-body copy with no subtree sharing. It also names the way back,
  a restored `produce`. See design.md decision 2.
- [x] 1.3 Drop the `immer` import line from `store.tsx`. Point `Mutate` and
  `Action` at the local `Draft` type instead of `Immer<Draft>`.
- [x] 1.4 Drop the `import type { Draft as Immer } from "immer"` line from
  `packages/web/src/areas/studio/draft/draft-array-crud.ts`. Point its two
  `Immer<Draft>` parameter types at `Draft`.
- [x] 1.5 Delete the `immer` entry from `packages/web/package.json`.
- [x] 1.6 Run `bun install` and commit the regenerated `bun.lock` alongside
  the manifest.
- [x] 1.7 Grep `packages/` for `immer` and confirm the only hit left is the
  prose mention in `panels/ActionListEditor.tsx`'s comment. Reword that
  comment so it names the recipe, not the package.

## 2. Un-export the reducer internals (finding 32)

- [x] 2.1 Drop the `export` keyword from `reducer`, `ReducerState` and
  `Action` in `store.tsx`.
- [x] 2.2 Delete the comment claiming `draft-store-reducer.test.ts` reads
  them. That file does not exist.

## 3. `describeError`'s dead status parameter (finding 39)

- [x] 3.1 Delete the `_status` parameter from `describeError` in
  `packages/web/src/areas/admin/errors.ts`. Delete the comment sentence
  keeping it "in the signature", per design.md decision 5. Repoint the
  sentence after it at `packages/web/src/areas/app/errors.ts`, since
  `packages/app` merged away on 2026-07-31.
- [x] 3.2 Delete the `_status` parameter from `describeError` in
  `packages/web/src/areas/studio/errors.ts`. Delete the same comment
  sentence, and repoint the same stale path.
- [x] 3.3 Drop the status argument at the three call sites in `src`:
  `admin/errors.ts:59`, `studio/errors.ts:79` and
  `studio/screens/PlayerScreen.tsx:81`.
- [x] 3.4 Drop the status argument at the six `describeAdminError` call sites
  in `packages/web/test/errors.test.ts`: lines 61, 80, 92, 93, 99 and 126.
  Without this `bun run typecheck` fails on an excess argument. The one
  `describeStudioError` call, line 114, already passes no status.

## 4. The `ReportingClientError` alias (finding 39)

- [x] 4.1 Delete `export { AppClientError as ReportingClientError }` from
  `packages/web/src/areas/reporting/api/client.ts` and export
  `AppClientError` under its own name.
- [x] 4.2 Point `areas/reporting/screens/reportingLogic.ts` at
  `AppClientError`, both the import and the `instanceof` test.
- [x] 4.3 Point `packages/web/test/reporting-reportingLogic.test.ts` at
  `AppClientError`, both the import and the construction.

## 5. Merge the two instance-list calls (finding 39)

- [x] 5.1 Replace `listMyTasks` and `listStartedByMe` in
  `packages/web/src/areas/app/api/client.ts` with one
  `listInstances(scope, token, opts)`. Keep the comment about `scope=started`
  sending no `startedBy` of its own, on the merged function.
- [x] 5.2 Point `areas/app/screens/TasksScreen.tsx`'s two calls at
  `listInstances("mine", ...)`.
- [x] 5.3 Point `areas/app/screens/StartedScreen.tsx`'s two calls at
  `listInstances("started", ...)`.

## 6. Correct the audit

- [x] 6.1 In `PONYTAIL-AUDIT.md`, record finding 32 as resolved by this
  change, under a "Resolved from the 2026-08-16 scan" heading.
- [x] 6.2 Record the landed entries of finding 39 as resolved, and
  leave the entries the other open changes still own.
- [x] 6.3 Move the three declined entries of finding 39 under "Checked, not
  flagged", each with its measurement from design.md decision 7.
- [x] 6.4 Correct the header's finding counts and the net line-count claim
  to match.

## 7. Verification

- [x] 7.1 `bun run typecheck` passes. Report what it printed.
- [x] 7.2 `bun run build` passes. Report what it printed.
- [x] 7.3 The full `bun test` passes with `DATABASE_URL` set. Report the pass
  and skip counts, not just the pass count.
- [x] 7.4 The antislop linter reports no rise on every Markdown file this
  change touches: `PONYTAIL-AUDIT.md` plus the three change artifacts.
- [x] 7.5 `git diff --check` is clean, and `git ls-files --eol`'s `w/` column
  carries no `crlf` for a touched file.
- [x] 7.6 A browser check. Open a draft in the studio canvas and move a
  step. Then change a field, and confirm the canvas and the checks rail
  both keep up. This is what catches a render regression from task 1.1.
