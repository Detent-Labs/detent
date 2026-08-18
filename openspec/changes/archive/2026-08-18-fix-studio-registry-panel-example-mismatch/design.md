## Context

See `proposal.md` - Why. `RegistryPanel` feeds a client-constructed
`Registry` into `runValidation`. `runValidation` passes it to
`checkActionRegistry` (`workflow-engine/engine/registry-check`). That
function needs a real `Registry`: a `Map<string, HandlerDef>` whose
`configSchema` is a live Zod object, not a JSON description.

`exampleRegistry.ts`'s own comment states why the panel exists. A
pasted-JSON draft editor has no safe way to build a live Zod schema from
author input. Building one from `GET /registry`'s JSON-schema
descriptions hits the same wall. The panel shipped a built-in example
instead of solving that. The example then drifted out of sync with the
server's real handler types.

Two other studio components already fetch `GET /registry`:
`ToolsScreen.tsx` and `PluginEnvelopeEditor.tsx`. Both consume its
`RegistryInfo` shape: type name strings plus schema descriptions. Neither
needs a live `Registry`. One lists type names. The other builds a
config-entry picker and generated form fields from the schema
descriptions. That shape cannot substitute for what `checkActionRegistry`
requires.

## Goals / Non-Goals

**Goals:**
- Stop the checks rail's `registry` group from validating a draft against
  handler types this deployment's server does not register.
- Leave the server-side, publish-time registry-resolution gate
  (`checkActionRegistry` inside `publishBody`) exactly as it is today.
- Keep the studio's other two `GET /registry` consumers (`ToolsScreen.tsx`,
  `PluginEnvelopeEditor.tsx`) untouched. They already read the correct
  data for their own purposes.

**Non-Goals:**
- Building a real client-side registry-resolution check. One path needs a
  JSON-schema-to-Zod converter for every registered `configSchema`. The
  other needs a new server endpoint that runs the check itself and
  returns its verdict. Both are real features. Both stay out of scope for
  a deletion that fixes an active false positive.
- Changing anything about how `publishBody` or `checkActionRegistry` work.
- Touching the admin, app, or reporting areas. This is studio-only.

## Decisions

**Remove the seed data, don't repair it**. An alternative fix would
rewrite `exampleRegistry.ts`'s two entries to `http.request` and
`notification.email`, matching the real server. Rejected. The panel would
still validate against a hand-picked guess of what the server registers.

A handler added to, renamed in, or removed from `src/engine/registry.ts`
drifts that guess again. So does one in a deployment's own handler set.
Nothing keeps the two in sync. Removing the panel removes that drift
source entirely, for every future deployment, not only this one.

**Let the registry group go permanently held-back in the studio, rather
than hide it**. Once `RegistryPanel` is gone, no studio code path ever
sets a live `Registry`. `registryChecked` (`registry !== undefined` in
`draft/validation.ts`) is therefore always `false`.

The checks rail already has a held-back state built for exactly this. It
reads "not checked", never a false pass or a false failure. Reusing it
needs no new UI state and no new catalog string.

It does need a code change, though. `checksRail.ts`'s `heldBackFor`
handles `"registry"` in the same `case` as `"cel"` today:
`!validation.zodValid || !validation.structurallyValid`. Neither branch
reads `registryChecked`.

That was harmless while `RegistryPanel` could set a live `Registry`. A
structurally valid draft with the panel toggled off already read
`registryChecked: false`. So did `structurallyValid` on plenty of real
drafts. The two conditions never needed to diverge to build a
correct-looking rail.

Once `RegistryPanel` is gone, `structurallyValid` and `registryChecked`
diverge on every structurally valid draft. The `heldBackFor` function then
returns `false` for `"registry"`, and the rail renders a false clear
pass. It needs its own `|| !validation.registryChecked` on the
`"registry"` case, split out from `"cel"`'s. Tasks.md group 4 makes that
change and extends `studio-checksRail.test.ts` to cover it.

`heldBackFor` is not the only reader that needs this exclusion. The same
file, `checksRail.ts`, exports two more functions that fold every
`CheckGroup` into one verdict.

The first function, `allChecksClear`, drives `ChecksRail.tsx`'s "all
clear" banner. It requires every group to pass `!g.heldBack &&
g.issues.length === 0`. The second, `totalOpenIssueCount`, drives the
one-line collapsed summary docked in `StepsPanel`, `EditScreen`, and
`PanelsScreen`. It returns `{kind: "held-back"}` the moment any group's
`heldBack` reads `true`.

Both fold over all six groups, `registry` included. Group 3 above holds
the `registry` group back permanently. From that point on, the first
function can never return `true` again for any draft. The second
function can never return anything but `{kind: "held-back"}`. That holds
even for a draft where the other five groups carry zero issues.

That is a second, coarser-grained version of the same false state
`heldBackFor` produces uncorrected. It directly contradicts this
proposal's own delta requirement that the collapsed summary "carries no
count" on a fully clear draft. Both functions need the same fix, in the
same shape. Exclude the `registry` group from the aggregate check before
running it, rather than reading its `heldBack` flag as if it counted.
Tasks.md group 4 makes this change too and extends the test file with
cases covering an otherwise-clear draft.

An alternative would remove the `registry` group from the rail entirely.
Rejected. That would remove the reminder that the server still runs this
check at publish. Keeping the group, permanently held back, keeps that
reminder visible.

**The per-action `NotCheckedBadge` in `ActionListEditor.tsx` stays lit, for
the same reason**. The checks rail is not `registryChecked`'s only reader.
`ActionListEditor.tsx` renders `NotCheckedBadge` on every action row when
`registry` stays unchecked. `StepsPanel`'s onEntry, onExit, and onCancel
action lists reach it. So do `PathsPanel`'s onPath list and `TimersPanel`'s
onFire list. Once group 3 makes `registry` always `undefined`, the badge
lights on every action row, in every draft, permanently. That mirrors the
checks rail's `registry` group, which stays permanently held back the same
way.

Two options exist here too. Leave the badge on, or suppress it now that it
can never resolve in-session. Chosen: leave it on. The reasoning matches the
checks-rail decision above.

`NotCheckedBadge` already reads "not checked," never a false pass or a
false failure. That is what the badge component is for. Suppressing it
would need a second signal, one that explains the badge's absence without
implying the action passed. That second signal would still say less than
the existing badge already says.

Leaving it on keeps one honest per-entity reminder that the server still
runs this check at publish. It mirrors the checks-rail group's reminder, at
a coarser grain. Task 6.5 verifies this in the browser.

**Collapse the overflow menu's two-heading split instead of leaving an
empty heading**. `ProcessHeaderBar.tsx`'s `⋮` menu groups controls under
"Process, saved with the draft" and "This session only". Only
`RegistryPanel` ever lived under the second heading.

Two options exist: drop the heading and its wrapper, or leave it empty
for some future session-only control. Chosen: drop it. An empty heading
with no content under it reads worse than no heading at all. Nothing in
this deployment's roadmap names a second session-only control. Re-adding
the heading costs nothing if one shows up later.

## Risks / Trade-offs

[The rail can't show every group clear anymore] → The spec's "all
groups clear" guarantee narrows to five groups, not six. It adds a
scenario stating a held-back registry group does not block publish. The
server stays the actual gate, unchanged. This only affects what the rail
itself can show about that dimension.

[A developer might expect the registry group to sometimes pass] → It
never could pass correctly before this change. The only prior "checked"
state validated against fictional handler types. The new, permanent
held-back state reads more honestly than the state it replaces.

[Removing `registry`/`setRegistry` from `DraftContextValue` touches a
context every panel can import] → Grep confirms the only reader outside
`store.tsx` itself is `RegistryPanel.tsx`. No other panel reads `registry`
or calls `setRegistry`.

## Migration Plan

No data migration applies. The removed state was in-memory and
session-only. It never persisted to a draft, a published version, or the
database.

Deploy runs as a normal frontend build and release, in tasks.md's group
order. Remove the panel's usage from `ProcessHeaderBar.tsx` first. Then
remove the two files it was the last reference to. Then rewrite
`store.tsx` and `checksRail.ts`, drop the five catalog keys, and ship.
That order keeps the tree from ever sitting with a dangling import
between groups.

Rollback is a normal revert of the same commit. Nothing downstream
depends on the removed fields existing.

## Open Questions

None. A future change may build a real client-side or server-verdict
registry check. That is a new capability. It is not a follow-up this
change needs to schedule.
