## 1. Registry check module

- [x] 1.1 Add `src/engine/registry-check.ts`: export `RegistryIssue { loc: string; type: string; message: string }` and `checkActionRegistry(body: ProcessBody, registry: Registry): RegistryIssue[]`.
- [x] 1.2 Implement the action-position collector (onEntry, onExit, onCancel, each path's onPath, each timer's onFire.actions), mirroring `src/cel/check.ts`'s `collect()` shape.
- [x] 1.3 For each collected action: skip the check entirely when `type` starts with the reserved `core.` prefix; otherwise resolve via `registry.resolve(type)` — unresolved produces one `RegistryIssue` and skips the config check for that action.
- [x] 1.4 When resolved and the handler declares `configSchema`, `safeParse(config)`; on failure, emit one `RegistryIssue` per Zod issue path (not one collapsed issue).
- [x] 1.5 Collect and return every issue across every action (no early throw).

## 2. Wire into publishBody

- [x] 2.1 In `src/engine/definitions.ts`, add `export class RegistryValidationError extends Error` carrying `issues: RegistryIssue[]`, message joining located issues (same shape as `CelValidationError`).
- [x] 2.2 Change `publishBody`'s signature to `publishBody(processId, authoredBody, registry: Registry, db: SQL = sql)`.
- [x] 2.3 After the hash-hit no-op return, call `checkActionRegistry(body, registry)` and throw `RegistryValidationError` on any issue, before `validateProcessBody`/`validateCrossProcess`.
- [x] 2.4 Import `Registry` type from `./registry.js` in `definitions.ts`.

## 3. Update call sites

- [x] 3.1 `test/definitions.test.ts`: register both `"sayYes"` (already registered at line 67) AND `"sayNo"` (used in fixture bodies at lines 95/103 but currently unregistered) on the shared registry, then pass it into every `publishBody` call.
- [x] 3.2 `test/cross-process.test.ts`: pass an empty (or minimal) registry into every `publishBody` call — fixture bodies declare no actions.
- [x] 3.3 `test/migration.test.ts`: pass a registry covering `"noop"` (used by the `action()` helper) into every direct `publishBody` call AND into the `publishV` helper that wraps it (`publishN`/`twoVersions` call `publishV`/`publishBody` internally and needed no signature change themselves).
- [x] 3.4 `test/subprocess.test.ts`: threaded an empty module-level registry — confirmed no fixture declares a non-core action — into all ~86 direct `publishBody` calls.
- [x] 3.5 Re-run `tsc --noEmit` to confirm no other call site was missed. (`bun run typecheck` passes clean.)

## 4. Tests

- [x] 4.1 Registry-check unit tests (new `test/registry-check.test.ts`): valid body with all-registered actions and satisfying configs publishes; an unregistered `type` in each of the five action positions is rejected with a located issue; a `config` violating a declared `configSchema` is rejected; a handler with no `configSchema` accepts any config; a `core.`-prefixed action type is never checked against the registry; multiple invalid actions each produce their own issue (not just the first).
- [x] 4.2 `publishBody`-level tests (added to `test/definitions.test.ts`): identical re-publish of a body stays a hash-hit no-op even against an empty registry (unregistered type) and against a newly-tightened `configSchema`.
- [x] 4.3 A rejected registry publish (unregistered type or bad config) consumes no version number — a subsequent valid publish for the same `processId` receives the version the rejection would have received.
- [x] 4.4 Ran the full suite inside the devcontainer (`bun test`, `DATABASE_URL` set): 437 pass, 0 fail, 0 skip.

## 5. Docs

- [x] 5.1 Updated `CLAUDE.md`'s "Extensibility" section (and the `registry-check.ts` module-list pointer) to describe the new check's placement and coverage, since the registry mapping is now enforced at publish.
