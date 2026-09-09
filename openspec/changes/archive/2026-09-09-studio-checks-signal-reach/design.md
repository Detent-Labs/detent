## Context

See `proposal.md` - Why. `checks-status-consolidation` (archived
2026-09-08) removed the area nav's duplicate Checks control. It moved that
control's severity signal onto the tab row's own count. Its own
verification step ran `/impeccable critique` and `/impeccable audit`
against the result. Five findings survived that review:

1. The blocked count's only signal is color. A sighted user skimming the
   row catches it slowly. A screen reader user away from the row hears
   nothing, until they tab back to it.
2. Publish stays fully clickable when a blocker stands in the draft.
   Nothing on the screen says so before the click. The warning lives only
   inside the confirmation dialog the click opens.
3. `EditScreen.tsx`'s structurally-invalid-draft banner renders as plain,
   uncolored text. The Checks count and the Publish dialog's own blocked
   warning both already use `colors.refusal`.
4. `IssueList.tsx` prints an issue's source as `[zod]`, a bracket-wrapped
   machine value inline in the message text.
5. `ProcessTabRow`'s ten tabs are each their own stop in the tab order, the
   plain-button model. A keyboard user reaches the last tab only after ten
   Tab presses.

A research pass against the live code and the live specs ran ahead of
this design. It corrected two assumptions the original findings carried.

Finding 4's premise was wrong. `ChecksRail.tsx`'s own grouped-list heading
prints the identical raw, untranslated source value; CSS only uppercases
it. Neither place gets this right at the other's expense.

Finding 5 conflicts with a cross-cutting rule, `spa-accessibility`'s "A tab
set matches the area's tab pattern." That rule currently mandates the
plain-button model for every tab set in the browser packages, this one
included.

The `/impeccable shape` pass did not run for these five fixes. Each is a
color, a weight, a live region, a label element or a keyboard binding.
None moves an element or changes a screen's structure. Task 8.6 re-runs
`/impeccable critique` and `/impeccable audit` against the result.

## Goals / Non-Goals

**Goals:**

- Fix all five findings. Each lands in the capability that already
  governs the file it touches, or the nearest one that does.
- Keep every fix as small as the finding demands. None of the five asks
  for a redesign of the control it touches.
- A finding's stated fix may rest on a false premise, or conflict with a
  rule broader than the one screen. Resolve that conflict explicitly in
  this document. Finding 4 carries the first case; finding 5 carries the
  second.

**Non-Goals:**

- A repo-wide migration of every tab set to roving-tabindex semantics.
  `spa-accessibility`'s exception names `ProcessTabRow` as the one tab set
  this shape governs today. Every other tab set keeps the plain-button
  model this change does not touch.
- Translating an issue's source into plain language. `design-language.md`
  already reserves the mono face for a machine-defined category name. The
  catalog never translates one. Finding 4's real flaw is the raw bracket
  presentation. The untranslated value underneath it was never the
  concern.
- An announcement on the Checks count's reverse transition, blocker back
  to clear or absent. The finding this change answers is a new issue
  appearing silently. A fix resolving silently is a different concern, one
  this change leaves alone.
- The heavier `errorBannerStamp` treatment for the structurally-invalid
  banner. `design-language.md` reserves that rotated, bordered stamp for a
  fixed five-tone case vocabulary. Adding a sixth case is a design
  decision this finding does not ask for. A plain color change matches
  what the other two signals in this same change already do.

## Decisions

### 1. The Checks count: bold weight plus a self-contained live region

`ProcessTabRow.tsx` already carries a `tabCountBlocker` style
(`{ color: colors.refusal }`). It also carries a visually-hidden span,
mounted only while blocked, stating the blocked fact in words. Both come
from `checks-status-consolidation`. Adding `fontWeight: 800` to
`tabCountBlocker` covers the weight half. The design rules cap the written
face at two weights and state no weight rule for mono. `EditScreen.tsx`'s
own mono stamp already reads 600. Weight 800 here matches the row's
`tabSelected`, so the row carries one weight vocabulary.

The announcement needs a second mechanism. It needs a region mounted at
all times, whose text a screen reader announces the moment it changes. A
region mounted only while blocked stays silent on its own first mount. An
assistive-technology engine announces a live region's change. It does not
announce the region's arrival with content already inside it.

`EntityTabs.tsx`'s own move-announcer (`role="status"`,
`aria-live="polite"`, mounted unconditionally, text driven by state) is the
established local pattern here. This change follows it rather than
inventing a second.

`ProcessTabRow` already receives `checksBlocked` as a prop. It does not
need a new one. The component tracks the prop's previous value in a ref.
It sets a local `announcement` state to the new catalog string only on
the false-to-true edge. This keeps the whole mechanism inside one file,
the file that already owns the color and the static hidden span. It does
not push transition-tracking logic up into `EditScreen.tsx`.

**Alternative considered:** compute the transition in `EditScreen.tsx`,
where that screen already computes `checksBlocked`, and pass an
`announcement` string down as a new prop.

Rejected. `EditScreen.tsx` would need its own previous-value ref for a
fact `ProcessTabRow` already receives fresh every render. The tracking
logic would only move, at the cost of a second file reasoning about it.

### 2. Publish's pre-click reason: a wider `reasonKey`

`draftToolbarState.ts`'s `PublishAvailability` carries one optional
`reasonKey`. `publishAvailability(canPublish)` sets it only when
`available` is `false`. The blocked-but-permitted case needs a reason
alongside `available: true`, a combination the type does not allow today.

Widening `reasonKey` to a second literal keeps the existing rendering path
in `ProcessHeaderBar.tsx` working unchanged. The existing guard there,
`{gate.reasonKey && ...}`, already renders whenever a reason exists,
regardless of `available`. Only the button's own `aria-describedby` needs a
change. It keys off `gate.reasonKey` now, instead of `gate.available`.
That way, the new case's text reaches the button the same way the
existing one does.

The two reasons never compete for the one span. This holds by
construction, not by a priority rule. `publishAvailability` returns the
permission-denied reason as soon as `canPublish` is not `true`. It
inspects `blocked` only once it confirms `canPublish` is `true`. A caller
lacking permission never reaches the blocked branch.

```ts
export function publishAvailability(
  canPublish: boolean | undefined,
  blocked: boolean,
): PublishAvailability {
  if (canPublish !== true) {
    return { available: false, reasonKey: "draftToolbar.publishUnavailable" };
  }
  if (blocked) {
    return { available: true, reasonKey: "draftToolbar.publishBlockedReason" };
  }
  return { available: true };
}
```

The new reason text takes `colors.refusal`. The existing muted
`publishReason` style stays reserved for the permission-denied case. This
new reason names an issue the draft carries. That is the same fact the
Checks count and the banner now color. The permission-denied reason names
an unrelated administrative fact instead, and keeps its own muted tone.
The new style composes over the existing one, the same way
`tabCountBlocker` composes over `tabCount`.

`ProcessHeaderBar.tsx` already computes `blocked` for the confirmation
dialog. This change only threads that existing value into
`PublishNavControl` too. It adds no new computation, and no new prop into
the header bar itself.

### 3. The banner's color, without its own new case

`EditScreen.tsx`'s `draftIncomplete` style carries only margin resets
today. Adding `color: colors.refusal` is the entire code change. The
banner's condition, `!validation.zodValid`, and its text stay exactly as
they are.

This joins the same plain-color family the Checks count and the Publish
reason above both use. It does not join the bordered, rotated
`errorBannerStamp` family. This same file already reserves that family for
a load or a request that comes back wrong. That family marks a fixed
vocabulary. A structural-validation state is one more member of the
plain-color family instead.

`spa-error-reporting` binds this screen's failure states to one banner
shape, and rules out color as the only separator. That capability's own
Purpose scopes it to a request that fails. This banner reports a
validation state of the draft body rather than a failed request. So that
one-shape rule does not reach it, and this change leaves
`spa-error-reporting` untouched.

This requirement lands in `studio-process-tabs`. That capability already
carries this screen's non-tab chrome rules: the empty area nav, and the
header bar's three controls.

### 4. An issue's source: one shared label style, two call sites

`ChecksRail.tsx`'s `checksGroupHeading` style already renders the exact
treatment this finding wants: mono face, uppercase, tracked, muted color.
`IssueList.tsx`'s `IssueItems` renders the same source value as a
bracket-wrapped inline prefix instead. The fix does not invent a new
treatment. It gives `IssueItems` the one `ChecksRail.tsx` already has.

`checksGroupHeading` mixes two concerns. One is the label's own visual
identity: font, size, transform, tracking, color. The other is its layout
as a section heading: block margins. `IssueItems` needs the identity
without the heading's own margins. It renders inline, beside a message
rather than above a list.

This change splits the style in two. A shared identity style,
`issueSourceLabel`, moves to `IssueList.tsx`, the shared module
`IssueItems` already lives in. The rail gains its first import from that
module. It then composes its own margin layout on top of the shared
identity, as it does today.

The rendered value stays the untranslated machine value it already is.
Neither call site gains a plain-language translation. `design-language.md`
already settles that a machine-matched value uses the mono face and stays
untranslated. This finding is about presentation. The vocabulary was
never in question.

### 5. Roving-tabindex, scoped to the one tab set this shape governs

`ProcessTabRow` conflicts with `spa-accessibility`'s "A tab set matches
the area's tab pattern." That rule currently states the plain-button
model as the one pattern every tab set in the browser packages follows.
It also conflicts with `studio-process-tabs`' own restatement of that same
model for this specific row.

Two ways to resolve that conflict exist. One migrates every tab set in the
app, admin, reporting and studio areas to roving-tabindex together. The
other carves out a named exception in the cross-cutting rule, for a tab
set wide enough to need it. `spa-accessibility`'s own two-dimensional-grid
requirement already works this second way. It names `studio-app`'s field
matrix as the one grid of its shape. A future grid of the same shape
follows that same pattern rather than inventing a second.

This change takes the second path. The finding this change answers names
one row, ten tabs wide, that already scrolls sideways.
`ProcessTabRow.tsx`'s own `row` style sets `overflowX: "auto"` for
exactly this reason. No other tab set in the browser packages carries
that shape today.

A repo-wide migration is a larger, unrequested change. It carries its own
review burden across every area. Scoping the exception to the row that
motivated it keeps this change to what the owner asked for. It also leaves
the door open for a later tab set of the same shape. That set can opt in
with no second cross-cutting rewrite.

**Keyboard model, adapted from this codebase's own precedent.**
`FieldMatrixGrid.tsx` already implements roving-tabindex for a
two-dimensional grid: `tabIndex={isFocusCell ? 0 : -1}` per cell, an
`onKeyDown` handler that moves a focus coordinate, a ref map for
imperative `.focus()` calls, and Enter/Space as the activation keys,
separate from arrow-key movement. `ProcessTabRow`'s row is
one-dimensional. This change reduces that pattern to left and right
arrow keys alone, with no up or down.

Arrow-key movement does not activate the newly focused tab. Only Enter or
Space does. This is the WAI-ARIA APG tabs pattern's "manual activation"
variant. It matches the existing `FieldMatrixGrid.tsx` precedent's own
Enter/Space-only activation.

It also fits how a studio tab works. Opening one mounts substantial
content: a canvas, a grid, a form editor. A stray arrow-key press should
not trigger a swap by accident.

Focus wraps at the row's ends: right arrow from the last tab moves to the
first, and the reverse. WAI-ARIA APG recommends wrapping for a
one-dimensional tablist. Nothing in `FieldMatrixGrid.tsx`'s own
two-dimensional precedent argues against it for this different shape.
This change does not add Home or End key support. The file
`FieldMatrixGrid.tsx` binds Home and End for its two-dimensional grid. The
APG lists both as optional for a tablist. This finding did not ask for
them, so this change leaves them out. A later change may add them.

## Risks / Trade-offs

[The `spa-accessibility` exception's own wording, "many tabs in one line
that scrolls sideways," is a qualitative test rather than a number. A
future contributor building a second wide tab set could read it either
way.]

→ Accepted. The existing two-dimensional-grid requirement this change
mirrors states its own boundary the same qualitative way. A future tab
set of a genuinely different shape is exactly the case Decision 5 leaves
for a later, deliberate call. It is not this change's to settle in
advance.

[The new live region can announce on an indirect cause. A step delete, a
data-source removal, or any other change can shift the worst open issue's
severity. The developer does not need to touch the Checks tab itself for
that to happen.]

→ Accepted as the intended behavior. This is exactly the finding this
change answers. A newly-appearing blocker should reach a developer away
from the Checks tab, whatever change caused it.

[Roving-tabindex breaks the row's existing keyboard behavior. A test, a
browser extension, or a saved keyboard macro may assume today's model.
Each stops matching reality.]

→ Accepted as the agreed trade-off. The proposal states it as
**BREAKING**. No deployed instance of this product exists to preserve
(`CLAUDE.md`'s pre-1.0 stage note). No test suite outside this
repository's own can depend on `ProcessTabRow`'s internal keyboard wiring.

## Migration Plan

No data migration; this is a pure `packages/web` UI change with no
persisted state. It deploys as a normal build, in one commit, the same way
`checks-status-consolidation` did. No feature flag: per this repo's
conventions, a change this deliberately reviewed and this narrow in scope
gets neither a flag nor a staged rollout.

## Open Questions

None. This design resolves both premise corrections the research pass
surfaced. Decision 4 answers finding 4's false "ChecksRail already does
this right" assumption. Decision 5 answers finding 5's conflict with
`spa-accessibility`. Neither stays open.

One observation stands outside this change's scope. The live
`studio-publish` spec sends the publish dialog's closing focus to the area
nav's Publish control. That sits at lines 232-234, and in the scenario at
277-281. The rebase moved Publish into the header bar, and
`studio-process-tabs` now requires an empty area nav. This change leaves
both passages alone. Retargeting them needs its own change against
`studio-publish`.
