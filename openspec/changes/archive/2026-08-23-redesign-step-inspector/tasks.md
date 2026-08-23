## 1. State groundwork

- [x] 1.1 Add the `BehaviorTab` type (`"assignment" | "paths" | "timers" |
      "actions" | "subprocess"`) and add `activeTab: BehaviorTab` state to
      `StepsPanel`, alongside the existing `openSection` state for now.
- [x] 1.2 Add `defaultTabFor(selection)`: returns `"paths"` when
      `selectedPathId` is set, `"assignment"` otherwise. Call it from the
      existing `useEffect` keyed on `[selectedStepId, selectedPathId]` that
      resets `openSection` today, so the same effect also sets `activeTab`.
- [x] 1.3 Add a second `useEffect`, keyed on `step?.type`, that moves
      `activeTab` to `"assignment"` when it reads `"subprocess"` and the
      step's type is no longer `"subprocess"`. Use a functional state
      update — `setActiveTab((prev) => prev === "subprocess" &&
      step?.type !== "subprocess" ? "assignment" : prev)` — not a plain
      `setActiveTab("assignment")`, so this effect cannot overwrite a
      `"paths"` value task 1.2's effect set in the same commit (both
      effects can fire together when a path-edge click also changes
      `step?.type`).
- [x] 1.4 Add a `chooseTab(tab: BehaviorTab)` setter.

## 2. Identity zone

- [x] 2.1 Show key, label, description, the performed-by segmented
      control, the conditional outcome field, and the initial-step
      control unconditionally, outside any tab or disclosure. Reuse the
      existing field markup and mutation calls (`updateStep`,
      `LocalizedTextInput`, `missingTranslationWarning`) unchanged.
- [x] 2.2 Move the view button (today's "view" section-index entry) into
      the identity zone as a plain `<button>` that calls `navigate(step.id)`
      directly. Reuse `stepSections.viewFieldsConfigured` and
      `stepSections.viewBuildForm` catalog keys for its label.
- [x] 2.3 Wrap the identity zone in `.step-identity-zone`.

## 3. Behavior tab row

- [x] 3.1 Show the tab row as `role="tablist"` with one
      `<button role="tab" aria-selected={...}>` per entry: Assignment,
      Paths, Actions, Timers, and Subprocess when `step.type ===
      "subprocess"`. Wire `onClick` to `chooseTab`. Set
      `aria-label={t(...)}` on the tablist using the new "Behavior" zone
      catalog key task 3.6 adds.
- [x] 3.2 Mount `PathsPanel`, `TimersPanel`, the three `ActionListEditor`
      instances, `PluginEnvelopeEditor` (assignment), and
      `SubprocessSpecEditor` conditionally on `activeTab`, one at a time,
      with their existing props unchanged.
- [x] 3.3 On the Paths tab, show an empty state ("Terminal steps have no
      outgoing paths") instead of `PathsPanel` when `step.terminal` is
      true.
- [x] 3.4 On the Assignment tab, suppress `assignmentWarningText` when
      `step.terminal` is true (extend the existing
      `step.terminal === true || step.assignment !== undefined` check,
      which already covers this case for the warning's presence, not its
      tab).
- [x] 3.5 Keep the cross-process check fieldset inside the Subprocess tab,
      beside `SubprocessSpecEditor`.
- [x] 3.6 Add new catalog keys to `i18n/catalogs/studio.ts` for the
      "Behavior" zone label and the terminal-empty-paths copy; retire
      `stepSections.identity` and `stepSections.view`, the two keys that
      named only the old accordion shape. Update
      `stepSections.developerView`'s catalog value from "Developer
      view" to "View raw JSON" (same key, reused for the drawer's
      toggle label).

## 4. Diagnostics drawer

- [x] 4.1 Wrap the per-step issue count, a "View raw JSON" toggle
      (replacing the old `developerView` disclosure entry, same
      `JSON.stringify(step, null, 2)` content), `IssueList`, and the
      docked `<ChecksRail collapsed />` in a `.step-diagnostics` element
      at the bottom of the inspector.
    - Wire the toggle as a `<button type="button">` with `aria-expanded`
      for its own state and `aria-controls` naming the JSON region it
      discloses.
- [x] 4.2 Keep the "Remove step" button inside the diagnostics drawer.

The MODIFIED "A step node on the canvas offers an inline rename"
requirement needs no task of its own here. Its only change is spec
prose, the "identity section" -> "identity zone" rename. No behavior
changes, so no task in this change implements it directly.

## 5. Styling and cleanup

- [x] 5.1 Add `.step-identity-zone`, `.step-behavior-tabs`,
      `.step-behavior-tab`, and `.step-diagnostics` rules to `app.css`,
      following `.studio-dock-tabs`'s existing tab button styling.
- [x] 5.2 Remove `.step-section-index` and `.step-section-entry` rules
      once `StepsPanel` no longer mounts them.
- [x] 5.3 Grep the repo for `.step-section-entry` and `step-section-`
      outside `app.css` and `StepsPanel.tsx` (tests, browser-check
      scripts, docs). Update or remove every match.
- [x] 5.4 Remove `openSection`, `chooseSection`, `shows`, `sectionRefs`,
      `pendingScrollSection`, and the `sections`/`StepSection` list now
      that no JSX references them.
- [x] 5.5 Rewrite the three `docs/browser-checks.md` passages that
      describe the retired accordion in prose, not selectors, so the
      grep in 5.3 misses them: the "Developer view" disclosure passage
      (around line 150-155), the "Paths section... marked current"
      passage (around line 1297-1310, referencing
      `openSectionForSelection`), and the "open its Assignment
      section" passage (around line 1312-1328, referencing
      `assignmentWarningText`/`assignmentWarning`). Describe selecting a path edge as
      switching to the source step's Paths tab, describe opening the
      Assignment tab (not "section"), and describe the diagnostics
      drawer's "View raw JSON" toggle as the old "Developer view"
      disclosure's replacement. The line ~150-155 bullet also names the
      path-guard's own CEL "Developer view" toggle (a distinct,
      out-of-scope control) — leave that second mention's name
      unchanged; only the step's disclosure becomes "View raw JSON".
      Optional, cheap to fix alongside: `docs/current-state.md` (around
      line 1495-1497 and 1945-1947) also names the old `StepsPanel`
      expanded-accordion state and its "no aria-haspopup" navigation
      shape; update it in the same pass if convenient.
- [x] 5.6 Change `.claude/rules/ui-glossary.md` for the retired accordion.
      In the edit-screen table, replace the "inspector panel" row ("one
      section inside the inspector") with three rows: identity zone,
      behavior zone (the tab row), and diagnostics drawer. In the "field
      tabs" paragraph, add the behavior zone's tab row to the tab-pattern
      list as a fifth pattern, alongside the register tab, the dock tab,
      the surface toggle, and field tabs.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` and confirm it prints no errors.
- [x] 6.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm the suite reports 0 failures, with
      the DB-backed suites not silently skipped.
- [x] 6.3 In a real browser, select a step, a terminal step, a
      subprocess step, and a path edge; confirm the identity zone,
      behavior tabs, and diagnostics drawer match the requirements in
      `specs/studio-canvas/spec.md`. Also tab to a behavior tab and
      activate it with Enter and with Space; confirm it switches, per
      the delta spec's keyboard-activation scenario.
