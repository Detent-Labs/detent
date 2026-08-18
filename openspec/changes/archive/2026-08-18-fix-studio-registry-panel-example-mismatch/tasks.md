## 1. Remove the panel's usage from the header bar

- [x] 1.1 In `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`,
      remove the `RegistryPanel` import and its render call, plus the
      caption below it.
- [x] 1.2 Collapse the `⋮` menu's two-heading split to the one remaining
      group ("Process, saved with the draft"), removing the
      "This session only" heading and its now-empty wrapper.
- [x] 1.3 Edit every comment in `ProcessHeaderBar.tsx` and
      `EditScreen.tsx` that still describes the removed selector or the
      collapsed heading, so no comment states a fact about UI that no
      longer exists (CLAUDE.md: "comments state facts"). In
      `ProcessHeaderBar.tsx`: the component doc block's "two groups split
      by persistence... 'This session only' (the action registry
      selector)" sentence, the `structureActive` prop doc's "the registry
      selector, and the content-locale switch mutate nothing..." sentence,
      the JSX comment naming "DraftToolbar, the registry selector and the
      content-locale switcher all 'remain visible...'", and the JSX
      comment naming "DraftToolbar and the registry selector. Only key
      and..." near the surviving menu group. In `EditScreen.tsx`: the
      comment quoting studio-json-view's "DraftToolbar, the registry
      selector, and the content-locale switcher 'SHALL remain visible...'"
      above `<ProcessHeaderBar>`. Each rewrite drops the registry-selector
      reference and states what remains true today: `DraftToolbar` and the
      content-locale switcher stay exempt from the JSON-surface
      reachability ban; the menu now has one group, not two.

This runs before group 2 on purpose. It drops the last reference to
`RegistryPanel.tsx` first. The tree never sits with a dangling import
between task groups this way.

## 2. Remove the example registry and its panel

- [x] 2.1 Remove `packages/web/src/areas/studio/panels/RegistryPanel.tsx`.
- [x] 2.2 Remove `packages/web/src/areas/studio/registry/exampleRegistry.ts`.
      Remove the `registry/` directory if this was its only file.

## 3. Remove the draft store's registry state

- [x] 3.1 In `packages/web/src/areas/studio/draft/store.tsx`, remove
      `registry` and `setRegistry` from `DraftContextValue`.
- [x] 3.2 Remove the `useState<Registry | undefined>` that backed them,
      and the now-unused `Registry` type import.
- [x] 3.3 Pass `undefined` as the registry argument in the
      `runValidation(draft, registry, loadedChildren)` call, in place of
      the removed `registry` state.
- [x] 3.4 Remove `registry` and `setRegistry` from the memoized context
      value and its dependency array.

This runs after group 2. `RegistryPanel.tsx` was the only reader of
`registry`/`setRegistry` outside `store.tsx` itself (design.md's Risks /
Trade-offs). It is already gone by the time this group removes what it read.

## 4. Fix the checks rail's registry held-back condition and its aggregates

`packages/web/src/areas/studio/draft/checksRail.ts`'s `heldBackFor`
currently handles `"registry"` in the same `case` as `"cel"`:
`!validation.zodValid || !validation.structurallyValid`. It never reads
`validation.registryChecked`.

Group 3 above makes `registry` always `undefined`. So `registryChecked`
(`registry !== undefined` in `draft/validation.ts`) is always `false` now,
in every draft state.

Left unchanged, a structurally-valid draft makes `heldBackFor` return
`false` for `"registry"`. The rail then renders that group as a clear
pass. That is the false pass `studio-checks-rail`'s delta spec forbids
(`MODIFIED Requirements`, the "A fully valid draft runs every group"
scenario). Task 6.3 below checks for it in the browser.

The same file's `allChecksClear` and `totalOpenIssueCount` carry the
identical bug one level up. Both fold all six groups, not one.
`allChecksClear` returns `true` only when every group is clear. It also
requires every group to be not held back. `totalOpenIssueCount` returns
`{kind: "held-back"}` as soon as one group's `heldBack` is `true`.

Group 3 above makes the `registry` group permanently held back. From
then on, `allChecksClear` can never return `true` again.
`totalOpenIssueCount` can never return anything but `{kind: "held-back"}`.
That holds for a fully clear draft as much as for any other.

This breaks `ChecksRail.tsx`'s "all clear" banner (`checksRail.allClear`).
It breaks the one-line collapsed summary too, docked permanently in
`StepsPanel`, `EditScreen`, and `PanelsScreen`, for every draft. It
violates this proposal's own delta requirement for that collapsed
summary: "carries no count" on a fully clear draft.

Fixing `heldBackFor` alone does not touch this. These two functions read
the per-group `heldBack` flags `heldBackFor` produces, not `validation`
directly. They need their own fix, in the same shape: exclude the
`registry` group before the aggregate check runs, not after.

- [x] 4.1 Widen `heldBackFor`'s second parameter to also pick
      `"registryChecked"` from `ValidationResult`. Split the `"registry"`
      case from `"cel"`'s: `return !validation.zodValid ||
      !validation.structurallyValid || !validation.registryChecked;`. The
      `"cel"` case keeps its existing two-condition check unchanged.
      `registryChecked` governs the registry group alone.
- [x] 4.2 Edit `packages/web/test/studio-checksRail.test.ts`. Add a case
      with `structurallyValid: true`, `structuralChecked: true`, and
      `registryChecked: false` (the permanent state every draft carries
      after group 3). Assert the `registry` group's `heldBack` is `true`
      while `cel`'s stays `false`. Add a second case with
      `registryChecked: true` and no registry issues (a hand-built
      `ValidationResult`, since no studio code path produces one anymore).
      It proves the `registry` case still un-holds-back correctly when the
      flag is `true`, a regression guard for the `heldBackFor` logic
      itself, independent of what the rest of the studio can currently
      feed it.
- [x] 4.3 Edit `allChecksClear` in the same file: filter `groups` down to
      `g.source !== "registry"` before applying the existing `!g.heldBack
      && g.issues.length === 0` test to what remains. A permanently
      held-back `registry` group must never suppress the "all clear"
      state of the other five.
- [x] 4.4 Edit `totalOpenIssueCount` the same way: filter out the
      `registry` group before both the `groups.some((g) => g.heldBack)`
      check and the `reduce` that sums issue counts, so a draft with
      `registry` held back and every other group clear returns
      `{kind: "clear"}`, not `{kind: "held-back"}`.
- [x] 4.5 Add cases to `packages/web/test/studio-checksRail.test.ts` for a
      draft that is otherwise fully clear and carries
      `registryChecked: false` (so its `registry` group is held back and
      every other group is clear with zero issues): assert
      `allChecksClear(groups)` is `true` and `totalOpenIssueCount(groups)`
      is `{kind: "clear"}`. Add a further case where, in addition, some
      non-registry group holds an issue: assert `allChecksClear(groups)`
      is `false` and `totalOpenIssueCount(groups)` reflects that group's
      own count, unaffected by `registry` staying held back.
- [x] 4.6 Edit the three doc comments in `checksRail.ts` that describe the
      pre-change semantics tasks 4.1/4.3/4.4 replace (CLAUDE.md: "comments
      state facts"). `heldBackFor`'s comment currently folds `"cel"` and
      `"registry"` into one bullet reading "`cel`/`registry` hold back on
      `!structurallyValid` — they run only against a compiled body"; split
      it into two, so the `"registry"` bullet states it additionally holds
      back on `!registryChecked`, which is permanently `true` because no
      studio code path ever loads a live `Registry` after group 3.
      `allChecksClear`'s comment currently reads "every group ran, and none
      carries an open issue"; reword it to say the check first excludes the
      permanently held-back `registry` group, then applies the "ran, no
      open issue" test to the rest. Reword `totalOpenIssueCount`'s comment
      the same way if it implies `registry` participates in the held-back
      check.

## 5. Remove the unused catalog keys and orphaned CSS

- [x] 5.1 Remove `registry.legend`, `registry.notLoadedOption`,
      `registry.exampleOption`, `headerBar.registryCaption`, and
      `headerBar.menuGroupSession` from the studio catalog. The fifth key
      is the "This session only" heading text task 1.2 removes; nothing
      else reads it once that heading is gone.
- [x] 5.2 Remove the `.studio-header-bar-menu-caption` rule from
      `packages/web/src/areas/studio/app.css`. Task 1.1 removes its sole
      JSX user, the caption paragraph the removed panel rendered below
      itself; nothing else renders that class.
- [x] 5.3 Grep the studio area for any remaining reference to those five
      catalog keys, to `.studio-header-bar-menu-caption`, or to
      `RegistryPanel`/`exampleRegistry`, and confirm none remain. Widen
      the same pass with a case-insensitive search for "registry
      selector" and "session only" to catch a stale comment task 1.3 might
      have missed (both phrases appear only in comments task 1.3 covers, so
      this is a regression check on that task, not new cleanup).
- [x] 5.4 `docs/current-state.md`'s `studio-json-view` entry (around line
      1886) says "`DraftToolbar`, the registry selector and the
      content-locale switcher stay mounted on both surfaces". Once this
      change lands, drop "the registry selector" from that sentence so it
      names only the two controls still there.

## 6. Real-browser check

<!-- antislop: allow synonym-rotation -->
<!-- "edit screen" below is the studio's own name for the canvas edit
     screen, not a synonym choice against "this change" (the OpenSpec
     artifact) used elsewhere in this file. -->
- [x] 6.1 Start the dev server, open a draft's canvas edit screen, and
      open the `⋮` overflow menu. Confirm no "This session only" heading
      and no action-registry dropdown remain, and that the remaining
      group (key, base-locale) still works.
- [x] 6.2 With the JSON surface toggled on, confirm `DraftToolbar`
      (save/publish/discard) and the content-locale switcher stay usable,
      per the `studio-json-view` delta.
- [x] 6.3 Open a structurally valid draft and confirm the checks rail's
      `registry` group renders as held-back, not as an error and not as a
      false pass, and that it does not block Save. With that same draft
      otherwise fully clear, confirm the full rail still shows its "all
      clear" banner and the collapsed summary (docked at a selected
      step's inspector) shows no count and no held-back indicator. The
      registry group's own held-back state must not suppress either one
      (task 4.3/4.4).
- [x] 6.4 Confirm publish still succeeds for a draft whose actions use the
      server's real registered types (`http.request`, `notification.email`,
      `process.start`), with the checks rail's registry group held back
      throughout.
- [x] 6.5 Select a step and open its `onEntry` action list in the inspector
      (`ActionListEditor`). Confirm each action row shows a `NotCheckedBadge`
      labeled "registry" (design.md's Decisions: `ActionListEditor.tsx`'s
      per-action badge). Repeat for a path's `onPath` action list and a
      timer's `onFire` action list, and confirm the same badge appears
      there too.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` and confirm it passes.
- [x] 7.2 Run `bun run build` and confirm it passes.
- [x] 7.3 Run the FULL `bun test` suite with `DATABASE_URL` set. Confirm
      the printed skip count is the expected baseline, not a silent
      full skip, and report the named result, not just a pass count.
- [x] 7.4 Run the antislop linter (`scripts/gates/prose.sh` locally, or
      `antislop.py check`) over every Markdown file this change touched:
      `proposal.md`, `design.md`, `tasks.md`, and the three delta spec
      files under `specs/`.
- [x] 7.5 Run `git diff --check` for trailing whitespace and
      blank-line-at-EOF, and `git ls-files --eol` to confirm no CRLF
      landed in a touched file.
