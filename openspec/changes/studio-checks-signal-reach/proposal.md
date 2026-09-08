## Why

<!-- antislop: allow synonym-rotation -->
<!-- "surface" here names the glossary term `process surface` (ui-glossary.md); "render" elsewhere in this file is an unrelated DOM verb, never a competing synonym. -->
`checks-status-consolidation`'s own verification step ran `/impeccable
critique` and `/impeccable audit` against the studio process surface, this
repo's mandatory design-workflow step. Both ran on 2026-09-08. The critique
scored 30/40. The audit scored 18/20. Five findings survived review, and the
project owner chose to fix all five.

Those five reach past the one screen the prior change touched. They cover
the Checks tab's own color and text, and the Publish control's pre-click
state. They also cover an unrelated banner on the same screen. They cover
an issue list's own source label too, and the tab row's keyboard model.
This change carries all five, kept apart from the finished, narrower
change that produced them.

## What Changes

- **The Checks count gains weight and a live announcement.** The blocked
  count now carries bold weight beside its color. Weight reads faster than
  color alone at a glance.

  A screen reader user away from the tab row now hears the transition too.
  The studio announces once, through a live region, when the count moves
  from clear to blocker. It stays silent otherwise, including the reverse
  transition, since a fix does not need an announcement.

- **Publish states a blocked draft's reason before the click.** The draft
  may carry a blocking issue and stay publishable. Visible text beside
  Publish now says so. The control stays available. A
  click still opens the confirmation dialog, which already states the same
  warning inside itself. Today, nothing on the screen says so before that
  click.

- **The structurally-invalid banner carries the refusal color.**
  `EditScreen`'s banner for a draft that fails structural validation now
  reads in `colors.refusal`, the color the Checks count and the new Publish
  reason share.

  It read as plain, uncolored text before this change. Every other signal
  on this screen, for the same kind of fact, already carries that color.

- **An issue's source renders as a label.** It now renders as a small
  mono label, apart from the message. The source carries one of six
  values: `zod`, `cel`, `registry`, `duration`, `structural`, `view`.

  The presentation changes. The vocabulary stays the same: the source name
  itself stays the untranslated machine value it already was.

  **BREAKING** for anyone parsing the rendered `[source] message` text
  directly; the source now sits in its own element.

- **The tab row adopts roving-tabindex keyboard semantics.** The row
  becomes one stop in the page's tab order. Only the open tab carries
  `tabindex="0"`; the other nine carry `tabindex="-1"`.

  The left and right arrow keys move focus one tab at a time, wrapping at
  the row's ends. They do not open the newly focused tab. Enter or Space
  still opens the focused tab.

  **BREAKING** for anyone relying on today's plain-button model, where
  every tab takes its own stop in the page's tab order.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `studio-process-tabs`: the Checks count gains bold weight and a live
  announcement on its blocker transition. The structurally-invalid banner
  gains the refusal color. The tab row adopts roving-tabindex keyboard
  semantics in place of the plain-button model.
- `spa-accessibility`: the cross-cutting tab-set requirement gains a named
  exception for a tab set wide enough to need roving-tabindex semantics.
  The ordinary plain-button pattern stays every other tab set's own.
- `studio-publish`: the Publish control states a blocked draft's reason
  before the click, beside the permission-denied reason it already states.
- `studio-checks-rail`: an issue's source renders as a label, in the full
  grouped list and in a per-entity issue list alike.

## Impact

- `packages/web/src/areas/studio/panels/ProcessTabRow.tsx`: a bold
  `tabCountBlocker` style. A new, always-mounted live region tracks the
  Checks count's blocker transition. A roving-tabindex keyboard model
  replaces the plain-button one. The doc comment gets updated to match.
- `packages/web/src/areas/studio/screens/draftToolbarState.ts`:
  `PublishAvailability.reasonKey` gains a second literal.
  `publishAvailability` takes a new `blocked` parameter.
- `packages/web/src/areas/studio/panels/ProcessHeaderBar.tsx`:
  `PublishNavControl` gains a `blocked` prop, a new compiled style for the
  blocked-reason text, and a fixed `aria-describedby` condition. That
  condition keys off the reason instead of availability.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`: `draftIncomplete`
  gains `color: colors.refusal`.
- `packages/web/src/areas/studio/panels/shared/IssueList.tsx`: the source
  prefix moves from inline bracket text to a styled label element. That
  label shares its visual identity with `ChecksRail.tsx`'s existing group
  heading.
- `packages/web/src/areas/studio/panels/ChecksRail.tsx`: its group heading
  style splits into a shared label identity plus its own heading layout.
  Both call sites then read from one definition.
- `packages/web/src/i18n/catalogs/studio.ts`: two new keys,
  `tabs.checksBlockingAnnounced` and `draftToolbar.publishBlockedReason`.
- Tests covering `ProcessTabRow`'s keyboard model, `PublishNavControl`'s
  availability logic, `EditScreen`'s banner, and `IssueList`'s rendering all
  need matching changes.
- `packages/web/test/studio-fieldMatrixTabStops.test.tsx`: its `tabStops`
  helper gains an `export`. The tab row's own test then reads that one
  definition.
- `docs/current-state.md`: the passage stating "Each tab is its own tab
  stop," which the roving-tabindex model replaces.
- `docs/browser-checks.md`: new manual entries for the live announcement,
  the pre-click Publish reason, and the banner color. Two more cover the
  issue label and the roving-tabindex arrow-key model. Each follows
  `development-toolchain`'s split rule.
- This change leaves the engine, schema, and definition-contract code alone.
  It leaves `packages/form-ui` and every non-studio area alone too.
