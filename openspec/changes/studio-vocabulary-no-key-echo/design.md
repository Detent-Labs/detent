# Design

## Context

See `proposal.md`, Why. Two mechanisms print a JSON key today.

The first is `panels/shared/KeyCaption.tsx`. It takes `text` and an
optional `jsonKey`, and prints the key in a muted mono `<code>` after one
space. Eight panels call it at 26 sites: `StepPage`, `PathsPanel`,
`TimersPanel`, `SubprocessSpecEditor`, `DataSourcesPanel`,
`ProcessHeaderBar`, `MigrationSpecEditor` and `shared/PluginEnvelopeEditor`.
The spec `ui-string-overrides` requires the echo, and
`studio-panels-literal-text.test.ts` lints the component's `text` prop.

The second is a catalog value that is the key itself. The masthead's
captions read `label`, `key` and `description`. The Cancellable section's
field reads `cancellable`, and the end step's field reads `outcome`. The form
editor's strip reads `visible`, `required`, `readonly`, `span`, `group`,
`tab` and `text`.

The matrix's checkbox names and legend swatches read the strip's three words
through `FLAG_LABEL_KEY`. The catalog's header comment says those stay
untranslated on purpose. This change reverses that comment.

The step's key input stands beside the name in the masthead. A path's key
input stands beside its label in the row. Both derive from the label while
untouched (`nextStepKey`, `createPath.ts::slugify`). Nothing reads a step
key or a path key as an identifier (`process-contract.md`). The field
catalog already keeps its key input in the definition half, under a plain
"Key" caption. CEL reads that one.

The constraints: `src/schema/definition.ts` stays. The studio catalog is
English only, and every string reads through `t(key)`. A `CatalogKey` is a
closed union, so a deleted key fails typecheck at every consumer.

## Shape brief

The brief comes from `/impeccable shape`. The run covered the Steps tab of
one draft. That draft held a task step, an automatic way out, a timer and
an action. The mode is Operate.

The owner was absent, so each assumption below stands marked as one. The
owner's measured taste of 2026-10-30 decided them. That taste is sentence
labels, no key outside the Developer view, and no machine chip.

<!-- antislop: allow passive-voice -->
<!-- Why: items 4 and 5 quote the catalog values "How it is taken" and "What happens when it is taken" word for word. -->
1. **Job and audience.** A process author opens a step to name it, connect
   it and say who acts. They read the page top to bottom. They never type a
   key. A developer opens the Developer view for the JSON.
2. **Outcome.** Every caption on the page is a sentence or a plain word.
   No mono `<code>` stands beside a caption. No caption is a JSON key. The
   step's key and each way out's key sit one disclosure away, and typing
   there still writes the draft.
3. **The masthead.** The kicker stays. The name line takes the full width,
   under "Name". "Description" follows. The key leaves the row. Assumption:
   the label-key row style collapses to one column.
4. **A way out.** Each row opens with a heading sentence, as in "Approve →
   Done". It reads the way out's name, an arrow and the target step. Under
   it stand "Name", "Leads to" and "How it is taken". The condition
   fieldset, "What happens when it is taken" and the row's issues follow. A
   "Developer view" disclosure holding "Key" comes next, then "Remove this
   way out". An unnamed way out reads "(unnamed way out)" in the heading.
5. **Time limit and actions.** The captions read "+ Add a time limit",
   "When it runs out" and "After a set time". The target caption reads
   "The way out it takes when it runs out". The actions legends read "What
   happens when entered" and "What happens when left".
6. **Flags.** The strip reads "Asked", "Required", "Read-only" and "Width".
   The card marks read "Required" and "Read-only". The matrix legend and
   checkbox names follow, since they read the same keys. The Forms tab's
   legend and the Fields tab's checkbox read "Required".
7. **Untouched.** The two-column section layout stays until change 10
   folds it. The "Only when" heading waits for change 4. The select options
   that print keys wait for change 3. The canvas waits for change 5 and the
   tab names for change 9. The raw CEL inputs for a deadline and an output
   value stay on purpose (`CLAUDE.md`).

## Goals / Non-Goals

**Goals:**

- No author-facing caption prints a JSON property, on any studio screen.
- The step page, the way-out rows, the timers and the actions read the
  table's words. The Paths tab and the Changes tab read the same words.
- Each view flag has one name on the Fields tab, the form editor, the Forms
  tab and the matrix.
- A key stays editable, inside a Developer view.

**Non-Goals:**

- Renaming anything in the draft model or the definition contract.
- Wording the condition builder's own heading, operands or sentence.
- Printing step labels in a select. A select still prints `key ?? id`
  until change 3.
- Transliterating umlauts in a derived key.

## Decisions

### D1. The caption component goes, with no text-only wrapper in its place

`KeyCaption` without `jsonKey` is `{text}`. Each call site prints its
`t(...)` result directly, inside the element that held the component. The
literal-text lint test drops its `KeyCaption` case and keeps
`NotCheckedBadge`. Alternative: keep the component as a plain-text wrapper.
Rejected, since a wrapper with one prop invites the slot back.

### D2. The key input moves into a Developer view, and stays writable

The step page's disclosure gains a "Key" input, mono, above the `id` line
and the JSON. Each way-out row gains its own `<details>` summary "Developer
view" holding its "Key" input. The glossary already defines the Developer
view as the disclosure over the contract's own word. The field catalog puts
its key input one zone away under a plain caption.

The disclosure's note changes to "The JSON is read-only here. The JSON surface stays the one
place for hand-authoring a definition." The test that proves the JSON
accepts no typing keeps asserting no `<textarea>` inside the disclosure.

Alternative: drop the path key input and leave the JSON surface as its
editor. Rejected: it takes away a guided control the spec promises, for no
gain.

### D3. One table of values, here, for every implementer

The exact values live in this section and in the delta specs. A task cites
them by key and never restates them. The left column is the old value, the
right column the new one.

Step page sections and masthead:

<!-- antislop: allow passive-voice sentence-length synonym-rotation -->
<!-- Why: the cells quote catalog values word for word, one of them with the verb "edit". -->
| Key | Old | New |
|---|---|---|
| `stepSections.paths` | Path to | Ways out |
| `stepSections.assignment` | Assignment | Who acts |
| `stepSections.entry` | On entry | When entered |
| `stepSections.exit` | On exit | When left |
| `stepSections.form` | Step form fields | Form |
| `stepSections.labelField` | label | Name |
| `stepSections.keyField` | key | Key |
| `stepSections.idField` | id | Id |
| `stepSections.descriptionField` | description | Description |
| `stepSections.cancellableField` | cancellable | Cancelling the case here |
| `stepSections.outcomeField` | outcome | How it ended |
| `stepSections.outcomePlaceholder` | choose an outcome… | choose how it ended… |
| `stepSections.outcomeHint` | An outcome binds only on a contracted process. | The name counts only when another process calls this one. |
| `stepSections.noAssignmentWarning` | This step has no assignment. Only … | Nobody is set to act on this step. Only … (the rest unchanged) |
| `stepSections.terminalNoPathsOrTimers` | … has no outgoing path and no time limit. | … has no way out and no time limit. |
| `stepSections.pathsEmptyTerminal` | … has no outgoing path. | … has no way out. |
| `stepSections.noSelection` | Select a step or a path to edit it. | Select a step or a way out to edit it. |
| `stepPage.developerViewNote` | Read-only here. The JSON surface … | The JSON is read-only here. The JSON surface … |
| `steps.onEntryLegend` | Actions on entry | What happens when entered |
| `steps.onExitLegend` | Actions on exit | What happens when left |
| `steps.onCancelLegend` | Actions on cancel | What happens when cancelled |
| `stepKindNote.subprocess` | Waits for it and routes on its outcome. | Waits for it and routes on how it ended. |
| `stepKindNote.terminal` | Closes the case with a named outcome. | Closes the case and names how it ended. |
| `kindSwitch.subprocessTerm` | Subprocess call | The call to another process |
| `kindSwitch.pathsTerm` | Outgoing paths | Ways out |
| `kindSwitch.onExitTerm` | Exit actions | What happens when left |
| `kindSwitch.onCancelTerm` | Cancel actions | What happens when cancelled |
| `kindSwitch.outcomeTerm` | Outcome | How it ended |
| `subprocess.legend` | Subprocess | The call to another process |

Ways out, with four new keys at the end:

<!-- antislop: allow passive-voice sentence-length -->
<!-- Why: the cells quote catalog values word for word. -->
| Key | Old | New |
|---|---|---|
| `paths.empty` | No paths. | No way out yet. |
| `paths.addPath` | + Add path | + Add a way out |
| `paths.newPathTargetLabel` | new path's target | Where the new way out leads |
| `paths.removePath` | Remove path | Remove this way out |
| `paths.selectTargetStep` | (select target step) | (choose a step) |
| `paths.triggeredByLabel` | triggered by | How it is taken |
| `paths.triggeredByManual` | a participant's choice | A person chooses |
| `paths.triggeredByAutomatic` | a condition | Happens by itself |
| `paths.manualGuardNote` | The participant sees this path's button only while the condition holds. | The person sees this way out's button only while the condition holds. |
| `paths.manualGuardHint` | guard (leave empty to always offer this path) | Leave it empty to always offer this way out. |
| `paths.automaticGuardHint` | guard (omit for the default/else path) | Leave it empty on the way out taken when no other matches. |
| `paths.labelCaption` | Label | Name |
| `paths.keyCaption` | Key | Key |
| `paths.toCaption` | Goes to | Leads to |
| `paths.priorityCaption` | Order among automatic paths | Tried in this order, lowest first |
| `paths.onPathLegend` | Actions when the path fires | What happens when it is taken |
| `paths.rowHeading` | (new) | {path} → {step} |
| `paths.unnamedPath` | (new) | (unnamed way out) |
| `paths.noTargetYet` | (new) | (no step yet) |
| `paths.developerView` | (new) | Developer view |

Time limits and actions:

<!-- antislop: allow passive-voice sentence-length em-dash -->
<!-- Why: the cells quote catalog values word for word, and one old value carries an em-dash. -->
| Key | Old | New |
|---|---|---|
| `timers.empty` | No timers. | No time limit. |
| `timers.addTimer` | + Add timer | + Add a time limit |
| `timers.removeTimer` | Remove timer | Remove this time limit |
| `timers.durationOption` | A time limit | After a set time |
| `timers.deadlineOption` | A deadline a condition computes (CEL) | At a moment written as CEL |
| `timers.reminderOption` | (reminder — no transition) | (a reminder: the case stays put) |
| `timers.kindCaption` | When it fires | When it runs out |
| `timers.targetPathCaption` | Path it takes when it fires (skips that path's condition) | The way out it takes when it runs out, skipping that way out's condition |
| `timers.onFireActionsLegend` | Actions when it fires | What happens when it runs out |
| `actions.empty` | No actions. | Nothing happens yet. |
| `actions.addAction` | + Add action | + Add an action |
| `actions.removeAction` | Remove action | Remove this action |
| `actions.pluginLabel` | action | Action |
| `actions.outputMappingLabel` | output mapping | Values it writes back |
| `actions.addOutputMapping` | + Add output mapping | + Add a value it writes back |
| `actions.removeOutputMapping` | remove | Remove |

Three keys keep their text: `timers.deadlineCaption`,
`actions.typePlaceholder` and `actions.resultCelPlaceholder`. Those are the
raw inputs `CLAUDE.md` keeps on purpose.

Flags and their legends:

<!-- antislop: allow passive-voice sentence-length synonym-rotation -->
<!-- Why: the cells quote catalog values word for word, one of them the old word "finding". -->
| Key | Old | New |
|---|---|---|
| `formEditor.visible` | visible | Asked |
| `formEditor.required` | required | Required |
| `formEditor.readonly` | readonly | Read-only |
| `formEditor.markRequired` | required | Required |
| `formEditor.markReadonly` | readonly | Read-only |
| `formEditor.span` | span | Width |
| `formEditor.group` | group | Group |
| `formEditor.tab` | tab | Tab |
| `formEditor.noteText` | text | Text |
| `fieldCatalog.requiredLabel` | A participant must fill this in | Required |
| `formsTab.legendField` | field | Field |
| `formsTab.legendRequired` | required | Required |
| `formsTab.legendConditional` | required if a condition holds | Required if a condition holds |
| `formsTab.legendSection` | section | Section |
| `formsTab.legendHeight` | taller asks for more | Taller asks for more |
| `fieldMatrix.legendFlagged` | A flagged cell already produces a Checks finding. | A flagged cell already stands in Checks as an issue. |

The matrix reads `formEditor.visible`, `formEditor.required` and
`formEditor.readonly` through `FLAG_LABEL_KEY`. Its checkbox names and its
legend swatches therefore follow with no change of their own.

The Paths tab and the Changes tab:

<!-- antislop: allow passive-voice sentence-length -->
<!-- Why: the cells quote catalog values word for word. -->
| Key | Old | New |
|---|---|---|
| `pathsView.trigger` | Trigger | How it is taken |
| `pathsView.priority` | Priority | Tried |
| `pathsView.guard` | Guard | Only if |
| `pathsView.target` | Target | Leads to |
| `pathsView.noPriority` | No priority | No order |
| `pathsView.noGuard` | No guard | Always |
| `pathsView.empty` | This process has no path yet. … | This process has no way out yet. … |
| `changeList.prop.assignment` | Assignment | Who acts |
| `changeList.prop.to` | Target | Leads to |
| `changeList.prop.trigger` | Trigger | How it is taken |
| `changeList.prop.guard` | Guard | Only if |
| `changeList.prop.priority` | Priority | Tried |
| `changeList.prop.duration` | Duration | Time limit |
| `changeList.prop.onFire` | On fire | When it runs out |
| `changeList.prop.targetPath` | Target path | Way out it takes |
| `changeList.prop.outcome` | Outcome | How it ended |
| `changeList.prop.subprocess` | Subprocess | The call to another process |
| `changeList.prop.visible` | Visible | Asked |
| `changeList.prop.dataSource` | Data source | Where values come from |

Six keys go: `ribbon.expand`, `ribbon.collapse`, `steps.pathsHeading`,
`steps.timersHeading`, `stepSections.actions` and
`stepSections.behaviorZoneLabel`. The first two are the dead keys
`docs/decisions.md` names. The other four have no consumer under
`packages/web/src`. Typecheck proves it after the deletion.

### D4. The way-out heading reads the target step's label

The heading fills `paths.rowHeading` with the way out's `label` and the
target step's label. It resolves the step label through
`resolveDraftLocalizedText` with the panel's `contentLocale` and
`baseLocale`. An empty label falls to `paths.unnamedPath`. A target with no
label falls to its key, then its id, the way the select prints it today. No
target falls to `paths.noTargetYet`.

The heading is an `<h4>` in the body face, bold. The arrow is the literal
character the catalog value carries. The heading is text and no control.

### D5. "Asked" for `visible`

The vocabulary table maps `visible` to "asked". The Fields tab's effect
half already uses that word in "Only ask this when" and "Ask for this". The
strip's control still writes `visible`. The Changes tab's property word
follows.

### D6. One vocabulary test over the catalog

A new `packages/web/test/studio-vocabulary.test.ts` asserts the table's
words at their keys. It also asserts one more thing. The three flag words
are equal across the strip keys, the Forms tab legend and the Fields tab
checkbox. It is a string test by design. The spec promises those words, and a catalog
value that drifts should fail by name.

### D7. The spec deltas reverse three rules by REMOVED plus ADDED

Three live requirements state the opposite of this change in a scenario
name. They are the caption-in-mono scenario of `ui-string-overrides` and
the two label-and-key-row requirements of `studio-step-page`. The
"triggered by" requirement of `studio-condition-builder` names the old
words in its own heading. A MODIFIED block must keep every base scenario by
name. Each of those four therefore goes as REMOVED, with successors under
new names. The sync step places each successor where its predecessor stood.

## Risks / Trade-offs

- [The Developer view holds a writable key beside read-only JSON] → The
  note names the JSON as the read-only part. The JSON re-renders from the
  draft, so a typed key shows there at once.
- [A test asserts an old word and goes red] → The suite names it. Each
  group's task lists the test files it touches. The implementer reads the
  named test.
- ["Asked" reads oddly beside a true, false or expression choice] → The
  three-way control's values stay unchanged. The Fields tab already says
  "ask" for the same flag, so the word is consistent.
- [The Paths tab says "way out" while the tab row still says "Paths"] →
  Change 9 folds the tab. Until then the tab name is the
  one site, and the glossary records it.
- [A browser-check walk quotes old captions] → The docs task rewrites every
  quoted caption a grep finds. Known lines in `docs/browser-checks.md`:
  1266 to 1298 and 1314 (Visible), 1439 and 1455, 4631 and 4632, 5773,
  5944 to 5949, 6037 to 6044, and the walk at 6335 to 6360. The walk at
  4331 to 4360 describes the label-and-key row and goes whole.
- [`studio-canvas` names the "Path to" section in six places] → Those are
  prose references in another capability. The decisions entry on retired
  words records them for the spec sweep, the way it records "edit rail".
- [A later change of stage 64 undoes this design] → None does. Change 9
  folds the Paths tab into Ways out and change 10 folds the sections into
  an accordion. Both keep these words and the Developer view placement.

## Migration Plan

No data moves. A stored draft keeps its body. A deployment's string
override keyed on a deleted key stops matching. That is the override
mechanism's documented behavior for a retired key. Rollback is a revert.

## Open Questions

None that change the specs or the tasks. Change 4 decides whether "Only
when" becomes "Only if" at the condition heading. Change 5 decides the
canvas stamp word for a subprocess step.
