## 1. Shared fetch-once hook (finding 6)

- [ ] 1.1 Create `packages/web/src/areas/studio/panels/shared/useFetchOnce.ts`
      exporting `useFetchOnce<T>(token: string, fetcher: (token: string) =>
      Promise<T>): T | undefined`, with the `useState`/`useEffect`/`live`-flag
      body both existing hooks already share.
- [ ] 1.2 Rewrite `useDataLists.ts` to call `useFetchOnce(token,
      listDataLists)`, keeping its name, export, and doc comment.
- [ ] 1.3 Rewrite `useRegistry.ts` to call `useFetchOnce(token,
      getRegistry)`, keeping its name, export, and doc comment.
- [ ] 1.4 Confirm every caller of `useDataLists`/`useRegistry` keeps its
      import path and signature.

## 2. `seedFormValues` stdlib swap (finding 8)

- [ ] 2.1 In `playerLogic.ts`, replace `seedFormValues`'s `for` loop with
      `Object.fromEntries(fields.map((f) => [f.field.id, f.value]))`.
- [ ] 2.2 Confirm `playerLogic.ts`'s existing test for `seedFormValues`
      still passes unmodified.

## 3. Inline `templateDraftInput` (finding 9)

- [ ] 3.1 Read `templateDraftInput`'s current test file and list every case
      it covers.
- [ ] 3.2 Inline the two statements at `ProcessesScreen.tsx:237`, matching
      `templateDraftInput`'s current body.
- [ ] 3.3 Delete `templateDraftInput` and its `CreateDraftInput`-shaped
      return from `processListLogic.ts`.
- [ ] 3.4 Confirm `readTemplate`'s own tests cover every case listed in 3.1;
      add any missing assertion there before deleting the wrapper's test
      file.

## 4. Tenancy static import (finding 10)

- [ ] 4.1 Add `listTenants` to the existing `import { tenantByKey } from
      "./store.js"` in `src/tenancy/connections.ts`.
- [ ] 4.2 Replace `deps.listAll`'s `async (db: SQL) => (await
      import("./store.js")).listTenants(db)` default with the statically
      imported `listTenants` directly.
- [ ] 4.3 Confirm `connections.ts`'s existing tests for `listAll`/`live`
      still pass unmodified.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`.
- [ ] 5.2 Run `bun run build`.
- [ ] 5.3 Run the full `bun test` suite with `DATABASE_URL` set; confirm the
      skip count, not just the pass count.
- [ ] 5.4 Run `git diff --check` over the changed files.
- [ ] 5.5 Run the antislop check on any Markdown this change touches.
