## Why

The studio's `RegistryPanel` action-registry selector lets a developer toggle
on a built-in example `Registry`. That example registers only `http.call` and
`notify.email` as action-handler types. The server this deployment runs
registers `http.request`, `notification.email`, and `process.start` instead
(`src/engine/registry.ts`). Toggling the example on makes the checks rail's
`registry` group flag every real action in the draft as unregistered.

The validation feature meant to catch a genuine config mistake produces one
instead. Two other components already read the real registered type names
from `GET /registry` for their own purposes: `ToolsScreen.tsx` and
`PluginEnvelopeEditor.tsx`. Neither purpose needs `RegistryPanel`'s example.
There is no correct replacement value to feed the panel: it has no correct
use left.

## What Changes

- Remove `packages/web/src/areas/studio/panels/RegistryPanel.tsx` and
  `packages/web/src/areas/studio/registry/exampleRegistry.ts`.
- **BREAKING** (studio session behavior): remove the `registry` /
  `setRegistry` fields from the draft store's `DraftContextValue`
  (`packages/web/src/areas/studio/draft/store.tsx`). Remove the state
  backing them too. `runValidation` now always receives `undefined` for its
  registry argument.
- The checks rail's `registry` validation group was already held-back on a
  structurally invalid draft. It now stays held-back for the entire studio
  session, in every draft state, including a structurally valid one. This is
  a correction, not a new gap. The group could previously reach a "checked"
  state only by validating against data the running server does not use.
  That check was never meaningful.
- `checksRail.ts`'s `heldBackFor` function mirrors `cel`'s condition for
  `registry` today. It never reads `registryChecked`. It needs its own
  change to hold the group back once `registry` is always `undefined` (see
  design.md and tasks.md group 4).
- The same file's `allChecksClear` and `totalOpenIssueCount` aggregate
  every group's `heldBack` flag, `registry` included. Both need the
  `registry` group excluded from that aggregate too. Left unfixed, the
  rail's "all clear" banner can never read clear again, on any draft.
  Neither can its one-line collapsed summary (tasks.md group 4).
- Remove `RegistryPanel` from `ProcessHeaderBar.tsx`'s `⋮` overflow menu.
  Collapse the menu's two-heading split ("Process, saved with the draft" /
  "This session only") to the one remaining group. The key and base-locale
  controls were the only other members of that group.
- Remove the now-unused catalog keys: `registry.legend`,
  `registry.notLoadedOption`, `registry.exampleOption`,
  `headerBar.registryCaption`, and `headerBar.menuGroupSession` (the "This
  session only" heading text, orphaned once the collapsed menu drops that
  heading). Remove `app.css`'s now-orphaned `.studio-header-bar-menu-caption`
  rule with them; the removed caption paragraph was its only user.
- The server-side registry-resolution check keeps its current behavior. This
  change removes a client-side approximation of it, not the real check.
  `checkActionRegistry` still runs inside `publishBody` at publish time. It
  stays the authoritative gate.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-canvas`: the process-identity header bar's `⋮` overflow menu no
  longer offers an action-registry selector. Its "This session only"
  heading and the two-heading split go with it.
- `studio-json-view`: the list of controls that stay visible and usable
  regardless of which surface (JSON vs. Structure) is active no longer
  includes "the registry selector".
- `studio-checks-rail`: the `registry` validation group now stays held-back
  in every draft state, including a structurally-valid, otherwise-fully-clear
  draft. No live `Registry` is ever loaded in the studio session anymore.
  The "every publish blocker is visible... with all groups clear" guarantee
  now holds over the other five groups. The server enforces the registry
  dimension only at publish time.

## Impact

- Affected code: `packages/web/src/areas/studio/panels/RegistryPanel.tsx`
  (removed), `packages/web/src/areas/studio/registry/exampleRegistry.ts`
  (removed), `packages/web/src/areas/studio/draft/store.tsx`,
  `packages/web/src/areas/studio/draft/checksRail.ts` (and its test,
  `packages/web/test/studio-checksRail.test.ts`),
  `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`,
  `packages/web/src/areas/studio/screens/EditScreen.tsx`, the studio catalog,
  `packages/web/src/areas/studio/app.css`, and `docs/current-state.md`.
- No API, schema, or server-side change. `checkActionRegistry` and
  `publishBody`'s publish-time gate keep their current behavior.
- No migration. Nothing persists the example registry or its toggle state.
  The draft store field held it in memory only, for the session. Its own
  existing caption already says so: "never written to the draft".
