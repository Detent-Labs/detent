## Context

See `proposal.md` - Why. Two components carry the current, duplicate design:

<!-- antislop: allow synonym-rotation -->
<!-- "Discard" below names only the fixed "Discard draft" button label, never a word choice competing with "remove"; every occurrence in this file pairs it with "draft". -->
- `DraftNavControls.tsx` mounts `<ChecksRail validation={validation} canPublish={canPublish} collapsed onOpen={onOpenChecks} />` beside Save, Discard draft and Publish. `EditScreen.tsx` wires `onOpenChecks` as `() => goToTab("checks")`. It does nothing else.
- `ChecksRail.tsx` is one component with two rendering branches, selected by its `collapsed` prop. The first is the collapsed one-line summary, only ever mounted by `DraftNavControls.tsx`. The second is the full grouped-by-source list, mounted once in the Checks tab body.
- `ProcessTabRow.tsx` already prints every tab's count from a single `counts: Record<ProcessTab, number | undefined>` prop, computed once in `EditScreen.tsx` via `processTabCounts(draft, validation.issues, changesCount)`. Every count renders through one shared `tabCount` compiled style: plain text, no color, for all ten tabs alike.
- The severity color itself already exists as a value. `checksDotState(groupChecksBySource(validation))` returns `"blocker" | "advisory" | "clear"`. It computes today inside both `ChecksRail.tsx`, for the dot, and `DraftNavControls.tsx`, for `blocked`. That value gates the publish-confirm dialog's warning text. `colors.refusal` is the existing semantic token both already use for the blocker state.

## Goals / Non-Goals

**Goals:**
- Remove the second control (`DraftNavControls`' `ChecksRail` mount) and its `collapsed` rendering branch entirely. Do not hide it, and do not gate it behind a flag.
- Preserve the one piece of information the removed control carried that the tab row didn't. That is whether the draft currently has a blocking issue, visible without navigating to the Checks tab.
- Keep exactly one place that computes "is the draft blocked" (`checksDotState(groupChecksBySource(validation)) === "blocker"`). Both the tab row's color and the publish-confirm dialog reuse that one place. The two can then never disagree. `DraftNavControls.tsx`'s own doc comments already insist on this elsewhere: "the nav and the Checks tab can never disagree."

**Non-Goals:**
- Reproducing the removed dot's three-state model (blocker / advisory / clear) on the tab count. The agreed scope is binary. A blocker colors the count; everything else, clear or advisory-only, leaves it in the tab row's ordinary color. Advisory-only issues already surface as a plain number today and keep doing so. This change does not ask for a separate advisory color on the tab count.
- Any held-back-indicator equivalent on the tab count. The full rail's held-back reporting stays as it is (`studio-checks-rail`'s "reports the held-back state of a structurally invalid draft" requirement). It keeps living on the Checks tab body. The plain "Checks N" digit already ignores held-back state today; it is `issues.length`, nothing more. This change does not add such a concept to it.
- Any change to the Forms tab's own per-step issue badge (`FormsTab.tsx`'s `FormCard`). That badge is a separate component with its own blocker/advisory coloring. It does not use `ChecksRail`'s `collapsed` prop, so it stays out of scope.
- Any change to the full grouped list, the per-entity `IssueList` placements, or the narrowing (`narrowedTo`/`onShowEvery`) machinery.

## Decisions

**Visual treatment** (`/impeccable shape`, run against `ProcessTabRow.tsx` and this change's own proposal/design against `PRODUCT.md`/`DESIGN.md`). This task skipped a fresh discovery round. It is a single, already-agreed color change inside an established, fully-documented design language. It is not a new surface. DESIGN.md's own rules resolve it directly:

- *Job/audience:* a developer or author working the studio process surface. They need to notice a newly-introduced blocking issue without leaving whatever tab they're currently on.
- *Selected direction:* reuse the existing `tabCount` compiled style unchanged. That keeps its mono face, size, weight, position, and right-aligned-in-row placement. Swap only its color role, from `colors.textMuted` to `colors.refusal`, when blocked.

  `colors.refusal` is DESIGN.md's own established "error tone."
  <!-- antislop: allow synonym-rotation -->
  <!-- "field error" quotes DESIGN.md line 175 verbatim; this file's own prose says "issue" elsewhere, but the quotation must not be reworded. -->
  It already "marks a `faulted` instance, a dead letter, an overdue timer and a field error." A blocking Checks count becomes one more member of that same family. It does not need a new visual language.

  This also satisfies DESIGN.md's Role Rule for free: "a component reads a semantic role, never a hex." Both the blocked and ordinary states already read named tokens.
- *Explicitly rejected:* a stamp, a background chip or badge, and an icon.

  <!-- antislop: allow trailing-negation -->
  <!-- The quoted clause is DESIGN.md's own wording on the stamp's five-tone vocabulary, not this file's prose. -->
  DESIGN.md reserves the stamp for a fixed five-tone state vocabulary. In its own words: "adding one is a design change, not a screen decision." This is a count, not a case state, so a stamp does not fit.

  A background chip or badge has no precedent in the register-row/tab-row vocabulary DESIGN.md documents. The Register Row pattern is a plain right-aligned mono quantity, which is exactly what the tab count already is.

  An icon does not fit either. DESIGN.md states an icon never appears alone in place of a label. This isn't a label to begin with.
- *States:* clear or advisory-only keeps the ordinary `colors.textMuted` (unchanged from today). A worst open issue that is a blocker switches to `colors.refusal`. That token already carries both light and dark values, so both schemes work automatically.
- *Scope:* exactly one tab's count gains this treatment, under exactly one condition. The other nine tabs' counts, and every other part of `ProcessTabRow`, stay as they are.

**Where the color lives: a new boolean prop on `ProcessTabRow`, not a generalized per-tab color map.** `ProcessTabRow`'s `counts` prop stays `Record<ProcessTab, number | undefined>`. Nine of ten tabs will never carry color. Threading a color slot through all of them, for one tab's sake, is speculative generality this component doesn't need. Add one prop, `checksBlocked: boolean`, computed in `EditScreen.tsx`. It sits next to the existing `processTabCounts(...)` call, the same place `validation` is already in scope.

`ProcessTabRow` applies a second compiled style, `tabCountBlocker`, reusing the `colors.refusal` token. It applies only to the Checks tab's count span, when `tab === "checks" && checksBlocked`.

The token is not new. `ChecksRail`'s own blocker dot already reads it, and so does `checksGroupHeldBack`.

**The blocker color carries a visually-hidden text equivalent.** This came up during implementation. It was not part of the original plan. Color alone reaches no screen reader (WCAG 1.4.1). The removed area-nav control's dot was never color-only either: it sat inside a button whose `aria-label` stated the full sentence. That whole sentence system is count-aware, singular/plural, and three-state. Reproducing it on the tab count would undo the simplification this change makes.

Instead, a short, count-independent, visually-hidden `<span>{t("tabs.checksBlocking")}</span>` ("blocking a publish") joins the Checks tab's button only when blocked. This follows `EntityTabs.tsx`'s own existing `visuallyHidden` pattern: clip-based, not `display: none`, so assistive tech still reaches it. Clear and advisory-only states do not need such text. The tab count already reads as a plain, expected number in those states, the same as every other tab's.

**Alternative considered:** pass `validation` itself down into `ProcessTabRow` and let it compute `checksDotState`/`groupChecksBySource` internally.

Rejected. `ProcessTabRow` today knows nothing about the checks domain (groups, sources, dot states); it only renders numbers a caller already derived. Keeping it that way matches how `counts` itself is already pre-derived. It also keeps the checks-domain import (`draft/checksRail.ts`) confined to the one screen that already imports it for `DraftNavControls`.

**Delete `ChecksRail`'s `collapsed` prop; skip deprecation.**

No caller will pass it after this change. `DraftNavControls.tsx` stops mounting `ChecksRail` at all. Per this repo's conventions, an unused prop and its dead rendering branch get deleted outright. Nothing keeps them behind a flag nobody sets. This includes the `checksRailBare`/`checksRailSummary`/`checksRailDot*`/`checksRailSummaryCount` compiled styles and the `checksRail.summary*` catalog keys (`summaryHeldBack`, `summaryClear`, `summaryBlockerOne`, `summaryAdvisoryOne`, `summaryBlocker`, `summaryAdvisory`). All of these exist only to serve the collapsed branch.

**`DraftNavControls.tsx` drops its `onOpenChecks` prop.**

Nothing inside it calls it once the `ChecksRail` mount is gone. `EditScreen.tsx` stops passing it. `goToTab("checks")` itself stays as it is.

The tab row's own Checks tab button still reaches it. Every per-entity "opens the tab that owns its subject" call site reaches it too. Three examples: `tabForIssue`, the Forms tab badge, and per-row issue buttons in the full rail.

## Risks / Trade-offs

[A developer glancing at another tab loses the one-glance "something just broke" red flash the area nav control gave. The tab row's plain-black-to-red change is smaller, and further from Publish.]

→ Accepted as the agreed trade-off. See the conversation history. See also the live test that established the removed control added no click behavior, only this passive signal. The tab row's Checks label stays visible in the row, regardless of which tab is open. So the color is not hidden. It is only less prominent than a dedicated toolbar control.

[Deleting catalog keys and compiled styles that some other, unnoticed call site still references]

→ Mitigated by `tsc --noEmit`. An unused-but-still-imported style surfaces as a compile error. So does a catalog key referenced by `t(...)` with a since-deleted key. Neither breaks silently. This repo's strict TypeScript and the catalog's typed `CatalogKey` guarantee that.

[A test asserting the removed area-nav Checks control keeps passing against stale expectations, or fails opaquely]

→ `tasks.md` includes an explicit sweep for every test referencing the collapsed control, `onOpenChecks`, or the deleted catalog keys. That sweep is a grep. It is not a fixed file list decided up front. A list written now would go stale by apply time.

## Migration Plan

No data migration; this is a pure `packages/web` UI change with no persisted state. Deploys as a normal build. No feature flag. Per this repo's conventions, a behavior this small and this deliberately decided gets neither a flag nor a staged rollout. It ships in one commit, and reverting that commit reverses it.

## Open Questions

None. The color scope (blocker-only, no advisory/held-back equivalent) and the removal-not-deprecation of `collapsed` were both settled during proposal. Nothing here waits past this change.
