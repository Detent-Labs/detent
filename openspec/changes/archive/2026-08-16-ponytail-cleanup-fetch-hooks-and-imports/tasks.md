## 1. Shared fetch-once hook (finding 6)

- [x] 1.1 Create `packages/web/src/areas/studio/panels/shared/useFetchOnce.ts`
      exporting `useFetchOnce<T>(token: string, fetcher: (token: string) =>
      Promise<T>): T | undefined`, with the `useState`/`useEffect`/`live`-flag
      body both existing hooks already share.
- [x] 1.2 Rewrite `useDataLists.ts` to call `useFetchOnce(token,
      listDataLists)`, keeping its name, export, and doc comment.
- [x] 1.3 Rewrite `useRegistry.ts` to call `useFetchOnce(token,
      getRegistry)`, keeping its name, export, and doc comment.
- [x] 1.4 Confirm every caller of `useDataLists`/`useRegistry` keeps its
      import path and signature.

## 2. `seedFormValues` stdlib swap (finding 8)

- [x] 2.1 In `playerLogic.ts`, replace `seedFormValues`'s `for` loop with
      `Object.fromEntries(fields.map((f) => [f.field.id, f.value]))`.
- [x] 2.2 Confirm `playerLogic.ts`'s existing test for `seedFormValues`
      still passes unmodified.

## 3. Keep `templateDraftInput` unchanged (finding 9)

- [x] 3.1 Confirm `templateDraftInput` and its existing tests in
      `packages/web/test/studio-processListLogic.test.ts` are unaffected by
      this change.

## 4. Tenancy static import (finding 10)

- [x] 4.1 Add `listTenants` to the existing `import { tenantByKey } from
      "./store.js"` in `src/tenancy/connections.ts`.
- [x] 4.2 Replace `deps.listAll`'s `async (db: SQL) => (await
      import("./store.js")).listTenants(db)` default with the statically
      imported `listTenants` directly.
- [x] 4.3 Confirm `connections.ts`'s existing tests for `listAll`/`live`
      still pass unmodified.

## 5. Verification

- [x] 5.1 Run `bun run typecheck`.
- [x] 5.2 Run `bun run build`.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set; confirm the
      skip count, not just the pass count.
- [x] 5.4 Run `git diff --check` over the changed files.
- [x] 5.5 Run the antislop check on any Markdown this change touches.
