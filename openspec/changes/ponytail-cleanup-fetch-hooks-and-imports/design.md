## Context

See `proposal.md` - Why. Four independent, single-module refactors bundled
into one change because each is too small on its own. No shared code path
connects them. Each decision below stands alone.

## Goals / Non-Goals

**Goals:**
- Delete the four literal duplications/indirections findings 6, 8, 9 and 10
  name, with no behavior change.
- Keep every existing test passing. Move a test only when its subject moves
  (finding 9).

**Non-Goals:**
- Touching findings 1 through 5, 7, or any other `PONYTAIL-AUDIT.md` finding.
- Changing `useDataLists`/`useRegistry`'s call sites, `playerLogic.ts`'s
  public surface beyond the one function body, or `connections.ts`'s
  `TenantConnections` interface.

## Decisions

**`useFetchOnce` lives beside its two callers, not in a higher shared
location.** `packages/web/src/areas/studio/panels/shared/` already holds
both `useDataLists.ts` and `useRegistry.ts`. A third file in the same
directory needs no new import path and no cross-area move. Signature:
`useFetchOnce<T>(token: string, fetcher: (token: string) => Promise<T>): T
| undefined`. `useDataLists` becomes `useFetchOnce(token, listDataLists)`.
`useRegistry` becomes `useFetchOnce(token, getRegistry)`. Both files keep
their own name, export, and doc comment. They stay the typed, documented
entry points.

`useFetchOnce` is the shared plumbing beneath them.

**`seedFormValues` swaps its loop body only.** `Object.fromEntries(fields
.map((f) => [f.field.id, f.value]))` replaces the `for` loop. The
function's name, signature, and doc comment stay.

Alternative considered: dropping the wrapper entirely and inlining at its
call site. Rejected. `playerLogic.ts`'s own module comment names why this
function exists as a named, tested unit. The studio-app spec requires
studio to extract its testable logic from its components. That reasoning
still holds after the one-line body swap.

**Delete `templateDraftInput` instead of renaming it.** Its only caller,
`ProcessesScreen.tsx:237`, gets the two statements inline. The exact
shape, read at implementation time:

```
const template = await readTemplate(templateKey);
const draft = { body: template.body, layout: template.layout, revision: 0 };
```

Its existing tests move to exercise `readTemplate` directly, wherever that
reader's own tests already live. `readTemplate` is the injected dependency.
The deleted wrapper never added logic on top of it.

**`connections.ts` moves `listTenants` into the static `store.js` import.**
`import { listTenants, tenantByKey } from "./store.js"` replaces the
single-name static import plus the inline `await import("./store.js")`
inside `createTenantConnections`'s default for `deps.listAll`. No
lazy-load or cycle-breaking reason exists for the dynamic form. Both
functions live in the same file, `store.ts`, that `connections.ts` already
imports from statically for `tenantByKey`.

## Risks / Trade-offs

[`readTemplate` tests miss a case the deleted wrapper's tests covered] →
Read the wrapper's test file first. Confirm every case has an equivalent
assertion before deleting it.

[A caller relies on a subtle difference `useFetchOnce` collapses between
`useDataLists` and `useRegistry`.] → The two were already byte-identical.
See finding 6.

## Migration Plan

No deployment or data migration. Land as one commit, or one small stack,
touching the five files in Impact. Verify per this repo's standard gate:
`bun run typecheck`, `bun run build`, then the full `bun test` with
`DATABASE_URL` set, `git diff --check`, and the antislop check on any
touched Markdown. Rollback is a plain revert. Nothing here is stateful.

## Open Questions

None.
