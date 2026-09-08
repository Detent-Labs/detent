## Context

Save, Discard draft and Publish render through `DraftNavControls.tsx` today.
`createPortal` mounts that component into a DOM node. `root.tsx`
(`StudioArea`) reserves that node inside `Chrome.tsx`'s global area nav. That
is one header row, shared by every area, sitting above even the studio's own
screen nav.

`EditScreen.tsx`'s own comment names the reason for the portal. It explains
why: the nav lives outside `DraftProvider`. Reaching it needs the element
`root.tsx` reserves instead of lifting the draft's own state out of the
provider. `Chrome.tsx` sits outside `EditScreen.tsx`'s own component tree.
The portal was the only way to reach it.

`ProcessHeaderBar.tsx` already sits inside `EditScreen.tsx`'s tree.
`EditScreen.tsx` already passes it the same `actions: DraftToolbarActions`
object `DraftNavControls` needs. It already renders above the tab row too,
regardless of `jsonOpen`; only a `structureActive` prop, gating one menu
group, changes there. That is the exact reachability property the current
area-nav placement exists to guarantee. It stays reachable on all 10 tabs.
It also stays reachable while the JSON surface is open. See proposal.md for
the motivation, the process owner's screenshot feedback.

## Goals / Non-Goals

**Goals:**
- Move the three buttons and their two confirmation dialogs into
  `ProcessHeaderBar.tsx`, right-aligned in the header row, ahead of the `⋮`
  menu trigger.
- Preserve every existing behavior: same actions, same dialogs, same
  reachability across tabs and the JSON surface, same catalog keys.
- Keep Checks exactly where it is.

**Non-Goals:**
- No change to save/discard/publish business logic. `useDraftToolbarActions`
  and `DraftToolbar.tsx` stay untouched.
- No change to dialog content. `studio-publish`'s and `studio-app`'s own
  requirements already cover what the Publish and Discard dialogs show. This
  change only moves which component renders the trigger and hosts the
  dialog markup.
- No rename of `DraftNavControls.tsx`. It keeps rendering Checks, so the
  name stays accurate for what remains. Renaming it over a placement change
  would only widen the diff, for no behavior change.
- No responsive/mobile redesign beyond what the existing `flexWrap: wrap`
  header row already does.
- No fix for a pre-existing focus gap in `useConfirmDialog`.
  `docs/decisions.md` already tracks it. Tab from the dialog's Cancel button
  lands on `<body>`. It should step to the button before it instead.
  `docs/decisions.md` names the hook's home as `ProcessHeaderBar.tsx`, stale
  until this change lands and accurate right after. The gap itself sits
  inside the hook's own focus race, the same in either component, so it
  travels unchanged.

## Decisions

**Direct render replaces the portal.** The portal existed only to reach
outside `EditScreen.tsx`'s tree, into `Chrome.tsx`. `ProcessHeaderBar.tsx`
already sits inside that tree. The three buttons and their dialogs move to
a plain, direct render there instead. Neither needs a portal or a reserved
DOM node. `root.tsx` keeps reserving its own slot, unchanged, for Checks
alone.

**The two confirmation dialogs move as a unit with their triggers.**
`PublishConfirmDialog`, `DiscardConfirmDialog` and the shared
`useConfirmDialog` focus-management hook move from `DraftNavControls.tsx`
into `ProcessHeaderBar.tsx`, together with the buttons that open them.

An alternative stayed on the table: leave the dialogs in
`DraftNavControls.tsx` and move only the trigger buttons. The design rejects
that alternative. The trigger ref that returns focus on close
(`triggerRef`) must live beside the button it returns focus to. Splitting
button and dialog across two files buys nothing. It only doubles the
prop-threading.

**No `/impeccable shape` exploration.** The process owner's own screenshot
(proposal.md) fully pins the target row, alignment and trigger position. No
UX ambiguity remains for `/impeccable shape <screen>` to resolve.
`/impeccable critique` and `/impeccable audit` still run at the
browser-check step (tasks.md § 5.6). Both check the *result* against the
design language. Neither explores alternatives.

**Right alignment wraps the buttons and the `⋮` menu in one shared
cluster.** `headerBar` is already `display: flex, flexWrap: wrap`. A single
auto-margin on the button group alone was the first attempt. The browser
check caught its failure. Below about 900px the row wraps. The `⋮` menu no
longer carries its own auto-margin, so it lands alone on a new line,
left-aligned.

`trailingCluster` replaces that attempt. One wrapper now holds both the
button group and the `⋮` menu, carrying the single `marginLeft: "auto"`
itself. `headerBar`'s own wrap moves the whole cluster as one flex item,
never splitting the menu away from the buttons.

The wrapper also carries its own `flexWrap: wrap` and
`justifyContent: flex-end`. That matters only if even its own two children
stop fitting one line. Both stay right-aligned then too, verified down to
500px wide.

## Risks / Trade-offs

[The button group could stop rendering, mis-aligning the row.] → It renders
unconditionally, like the menu trigger does. Neither `structureActive` nor
`jsonOpen` gates whether the row itself renders. Both only gate content
inside the menu. The wrapper carrying the auto-margin stays present always.

[The header row already wraps, carrying several badges: revision,
dirty/saved, timestamp, published, locale. Three more buttons could crowd a
narrow viewport.] → The browser check found a real failure here.
`trailingCluster`, described above, fixes it. Verified clean from 500px to
a full desktop width.

[Moving `useConfirmDialog`'s trigger-ref wiring to a different component
risks a focus-return regression.] → The same browser check verifies this.
Pressing Discard draft or Publish, then closing the dialog, returns focus
to the pressed button.

## Migration Plan

Pure client-side UI move: no data migration, no feature flag. A plain
revert is the rollback. No persisted state depends on where these controls
render.

## Open Questions

None. The process owner's screenshot decides placement, scope and the spec
delta. Nothing here waits.
