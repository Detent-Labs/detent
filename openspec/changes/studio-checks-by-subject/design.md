# Design

## Context

This is change 12 of stage 64. The function `runValidation` collects issues from the engine's validators plus the studio's own view-flag findings. Each issue carries a raw message, a source and a location. The Checks tab groups them by source. A row prints the message as a button that opens the owning tab. At each placement on the step page and the field card, `IssueItems` prints the same message behind a source label.

A probe of `runValidation` over broken drafts showed what authors meet. A way out with no label reads "Invalid input: expected string, received object". A step with no name reads "missing baseLocale ('en') entry". Every row with a Zod issue holds back five groups.

## Goals / Non-Goals

**Goals**

- One sentence per open issue, at the spot and on the Checks tab.
- Rows by subject with a severity word and a Fix control that lands on the place.
- Every inherited point closed or recorded.

**Non-Goals**

- `src/schema/definition.ts`, every validator and every API stay as they are. The mapping sits in the studio.
- No translation of the sentences. The studio catalog carries English only.
- The one dialog form stays with change 13, and the condition builder's expansion with change 16.

## Shape brief (`/impeccable shape studio-checks`)

No answer round took place: the owner pre-approved every decision and asked for the recommendations. These are assumptions from D5, the principles and the measured taste.

1. **Job and audience.** A process author who pressed Publish or saw a red Checks count. The author wants to know what stops the publish and where to go. Visitor mode: Operate.
2. **Outcome and proof.** Press Fix and stand at the control. Success is a draft cleared without reading a validator's name.
3. **Direction.** The incumbent register. One column at the field card's width (52rem), flush left. The headings take the Title style over a hairline. No new tokens and no new stamp tone.
4. **Scope.** The Checks tab body, the sentences at every placement and the landing. The tab row's count stays.
5. **States and ranges.**
   - Typical: 0 to 10 rows. A template under construction reaches 30.
   - Start state: one sentence and no group.
   - Narrowed: one step's rows.
   - All clear: the ink box and the line.
   - Held back: rows plus the line.
6. **Interaction and layout.**
   - A row holds a kicker word, a sentence, and Fix at the trailing edge.
   - The row's Developer view stands closed under the sentence.
   - Below 40rem of its own width, Fix wraps under the sentence.
   - Steps and Fields with no row draw nothing. An empty heading would claim a pass that a held-back check has not earned.
7. **Constraints.** A press moves focus to the place. The severity word never rests on color alone. A long name wraps.

Composition: `CheckRow` and `HeldBackLine` are small components with explicit props. No boolean mode prop joins `ChecksRail`. The severity word reads a variant style picked in code, as `DESIGN.md` asks.

The web interface guidelines add three things:

- A check's sentence says the next step.
- Fix stays a real `<button>`.
- Fix carries the sentence through `aria-describedby`, so each repeated word has its own description.

## Decisions

### D1. The issue carries a sentence beside its raw message

The type `EditorIssue` gains `sentence?: string`. The function `runValidation` fills it for every issue, as its last step. The raw `message` stays. The row's Developer view prints it, and the validation tests assert it. A reader prints `issueText(issue)`, which falls back to the message. A hand-built issue in a test may omit the sentence.

Names in a sentence read the base locale. `runValidation` takes no content locale, and the base-locale entry always exists. The view-flag findings read the same way today.

### D2. One module, four tiers

`draft/checkSentence.ts` exports `checkSentence(body, { loc, message, entityType, entityId })`. It never reads `source`, so it serves a refused publish, whose issues carry none. It tries four tiers and stops at the first answer:

1. **Literal rule.** A regular expression over the engine's message picks a key. A rule may pick by place too, such as "not registered" on an action or on a source.
2. **Expression site.** The location names a CEL site, such as a guard, a deadline, a view flag or a mapping. A parser's text varies, so the site decides.
3. **Property rule.** The `loc`'s entity and last property pick a key. This serves Zod's built-in messages, such as a way out's `label`.
4. **Entity fallback.** One sentence per entity, naming the step and the section where it can.

The slots read `{step}`, `{way}`, `{field}`, `{source}`, `{section}` and `{value}`.

- The step slot comes from `stepTextMap`, so two unnamed steps read their numbers.
- The way slot prints the label, else "(unnamed way out)".
- The field slot prints the base-locale label, else `panelsScreen.unnamedField`.
- The source slot prints the key, else `panelsScreen.unnamedDataSource`.
- The value slot prints the rule's capture from the message.
- The section slot prints `sectionLabel(section, kind)`. A section word therefore follows a rename, and an end step reads "When entered".

**Each rule carries its place.** A location does not separate the sentences. "Duplicate field ids" and "duplicate field keys" both sit at `fields`. So a rule names a `place`, one of these values:

- `json`, `fields`, `sources`, `settings` or `contract`.
- `steps`, the Steps tab with no step.
- `name`, the process's name in the header bar.
- `page`, the step alone with focus on Name.
- A section's name.

The module exports `checkPlace(body, issue)`, and D7's landing reads it first. A sentence and its landing therefore cannot disagree.

**Some rules pick by the draft.**

- `checks.end.noOutcome` and `checks.end.unknownOutcome` read `checks.end.noEndings`, with `place: contract`, while `contract.outcomes` is empty.
- `checks.timer.tooLong` reads `checks.timer.duration` where `timeLimitParts` answers undefined, since the panel then draws no input.
- `checks.field.columnSource` reads `checks.field.columnOnChoices` where the field has options.
- `checks.action.sameOutput` reads `checks.action.sameOutputOnWay`, with `place: paths`, at a `paths[j]` location.
- A group literal on an entry with no `ref` reads `checks.form.noteGroup`.
- Two tab literals read `checks.form.tabsDeclared`, since the picker cannot repair either. One concerns an entry inside a group, and the other a view with no tabs.

**The field slot on a form issue.** On a view entry, the field slot reads the entry's `ref`. A note's check answers `checks.form.general`.

**One rule reads its section from the draft.** "Action output targets unknown field" names no action in its location. An exported helper in `panels/sectionIssues.ts` reads the field id from the message. It finds the action whose `output` holds that id, across the step's five positions. It answers that action's section. `sectionOfIssue` and `checkPlace` both call it. The sentence, the header's count and the landing therefore agree.

A rule names the section it expects. Where the step's kind lacks that section, the sentence falls to tier 4's step form, which prints no section.

The scan leaves out the literals in `migrationSpec`'s refinements. A migration spec is no process body.

### D3. The sentences

The catalog keys and their texts:

```text
checks.process.firstStep        No step is set as the first one. On the Steps tab, open a step and choose “Set as the process's first step”.
checks.process.description      The process description has no text in the base language. Correct it in the JSON surface.
checks.process.key              The process needs a key. On Settings, set it in the Developer view.
checks.process.baseLocale       The process has no base language. On Settings, type one.
checks.process.duplicateId      Two parts of this process share one internal id. Correct it in the JSON surface.
checks.process.badId            An internal id in this process has the wrong form. Correct it in the JSON surface.
checks.process.duplicateFieldKey Two fields share one key. On the Fields tab, change one in its Developer view.
checks.process.duplicateSourceKey Two places values come from share one name. On the Fields tab, under Where values come from, rename one.
checks.process.cancelSink       The step kept for cancelled cases was changed by hand. Remove it in the JSON surface, and publishing adds it back.
checks.process.unknownEntry     The definition holds an entry the studio does not know. Remove it in the JSON surface.
checks.step.name                “{step}” needs a name. Type it in the Name box at the top of its page.
checks.step.description         The description of “{step}” has no text in the base language. Type it at the top of its page.
checks.step.key                 The key of “{step}” cannot be used. Under {section}, change it in the Developer view.
checks.step.kind                “{step}” has no kind. Choose one at the top of its page.
checks.step.noWayOut            “{step}” has no way out yet. Under {section}, add one, or make this step an end.
checks.step.endHasWayOut        “{step}” is an end but still has ways out. Choose another kind at the top of its page.
checks.step.outcomeNotEnd       “{step}” says how the case ends but is not an end. Make it an end at the top of its page.
checks.step.noProcess           “{step}” calls no process yet. Under {section}, choose one.
checks.step.strayCall           “{step}” holds a call to another process but is another kind of step. Choose its kind at the top of its page.
checks.step.callNeedsAutomatic  “{step}” waits for another process, so each way out must happen by itself. Under {section}, change the ones a person chooses.
checks.step.reservedKey         “{step}” uses a key kept for cancelled cases. Under {section}, change it in the Developer view.
checks.step.reservedId          “{step}” uses an internal id kept for cancelled cases. Correct it in the JSON surface.
checks.paths.mixed              The ways out of “{step}” mix a person's choice with ones that happen by themselves. Under {section}, make them all one kind.
checks.paths.noOrder            The ways out of “{step}” that happen by themselves need an order. Under {section}, give each a number.
checks.paths.sameOrder          Two ways out of “{step}” share one place in the order. Under {section}, give each its own number.
checks.paths.twoDefaults        More than one way out of “{step}” has no “Only if”. Under {section}, give all but one a condition.
checks.paths.defaultNotLast     The way out of “{step}” with no “Only if” must be tried last. Under {section}, give it the highest number.
checks.way.name                 A way out of “{step}” has no name. Under {section}, type one.
checks.way.key                  The way out “{way}” of “{step}” has no key. Under {section}, type one in its Developer view.
checks.way.noTarget             The way out “{way}” of “{step}” leads nowhere yet. Under {section}, choose a step.
checks.way.targetGone           The way out “{way}” of “{step}” leads to a step that was removed. Under {section}, choose another.
checks.way.trigger              The way out “{way}” of “{step}” does not say how it is taken. Under {section}, choose one.
checks.way.guard                The “Only if” on the way out “{way}” of “{step}” cannot be read. Under {section}, correct it.
checks.timer.durationOrDeadline A time limit on “{step}” needs a length or a date, and only one. Under {section}, choose one.
checks.timer.duration           The length of a time limit on “{step}” cannot be read. Correct it in the JSON surface.
checks.timer.tooLong            A time limit on “{step}” is too long. Under {section}, shorten it.
checks.timer.deadline           The date of a time limit on “{step}” cannot be read. Under {section}, correct it.
checks.timer.wayGone            A time limit on “{step}” takes a way out that was removed. Under {section}, choose another.
checks.timer.general            A time limit on “{step}” is not complete. Under {section}, finish it.
checks.action.unknownType       An action on “{step}” uses a type this server does not offer. Under {section}, choose another.
checks.action.reservedType      An action on “{step}” uses a type the studio keeps for itself. Under {section}, choose another.
checks.action.config            An action on “{step}” has settings that do not pass. Under {section}, correct them.
checks.action.duration          A waiting time on an action of “{step}” cannot be read. Correct it in the JSON surface.
checks.action.sameOutput        Two actions around “{step}” write the same field. Under {section}, change one.
checks.action.sameOutputOnWay   Two actions on the way out “{way}” of “{step}” write the same field. Check that way out, this step's When left list and the next step's When entered list.
checks.action.fieldGone         An action on “{step}” writes to a field that was removed. Under {section}, choose another.
checks.action.output            A value an action on “{step}” writes cannot be read. Under {section}, correct it.
checks.action.mapping           A value an action on “{step}” passes on cannot be read. Under {section}, correct it.
checks.action.chainField        An action on “{step}” fills a field the other process does not have. Under {section}, correct it.
checks.action.general           An action on “{step}” is not complete. Under {section}, finish it.
checks.assignment.unknownType   “{step}” uses a way to pick people that this server does not offer. Under {section}, choose another.
checks.assignment.config        The settings for who acts on “{step}” do not pass. Under {section}, correct them.
checks.assignment.group         “{step}” names a group this process may not use. Correct it in the JSON surface.
checks.assignment.personField   “{step}” takes its person from a field that holds no person. Under {section}, choose a person field.
checks.assignment.general       Who acts on “{step}” is not complete. Under {section}, finish it.
checks.call.version             “{step}” does not say which version of the process it calls. Under {section}, choose one.
checks.call.outputGone          “{step}” copies a result into a field that was removed. Under {section}, choose another.
checks.call.mapping             A value “{step}” passes to or takes from the other process cannot be read. Under {section}, correct it.
checks.call.general             The call on “{step}” is not complete. Under {section}, finish it.
checks.end.noOutcome            “{step}” does not say how the case ends. Under {section}, choose an ending.
checks.end.noEndings            The process lists no endings yet. On Settings, add one under What it takes in and gives back.
checks.end.unknownOutcome       “{step}” uses an ending the process does not list. Under {section}, choose another.
checks.end.reservedOutcome      “{step}” uses an ending kept for cancelled cases. Under {section}, choose another.
checks.form.fieldGone           The form on “{step}” holds a field that was removed. Under {section}, open the form and take it out.
checks.form.tabs                A field on the form of “{step}” does not fit its tabs. Under {section}, open the form and move it.
checks.form.tabsDeclared        A field on the form of “{step}” declares a tab it may not. Correct it in the JSON surface.
checks.form.tabDuplicate        Two tabs on the form of “{step}” share one key. Correct it in the JSON surface.
checks.form.tabName             A tab on the form of “{step}” has no name. Under {section}, open the form and type one.
checks.form.noteText            A note on the form of “{step}” has no text. Under {section}, open the form and type it.
checks.form.group               A field on the form of “{step}” sits in the wrong group. Correct it in the JSON surface.
checks.form.noteGroup           A note on the form of “{step}” sits in a group this form lacks. Under {section}, open the form and choose another.
checks.form.flag                A condition on “{field}” on the form of “{step}” cannot be read. Under {section}, open the form and correct it.
checks.form.rule                A rule on “{field}” on the form of “{step}” cannot be read. Correct it in the JSON surface.
checks.form.validation          A rule on the form of “{step}” is not complete. Correct it in the JSON surface.
checks.form.pattern             A pattern on the form of “{step}” cannot be read. Correct it in the JSON surface.
checks.form.technicalFlag       A technical field on the form of “{step}” cannot be required or read-only. Correct it in the JSON surface.
checks.form.unwritable          “{field}” is required and read-only on “{step}”, and nothing fills it, so every submission fails. Under {section}, open the form and change it.
checks.form.hiddenRequired      “{field}” is required on “{step}” but not asked, so nobody can fill it. Under {section}, open the form and change it.
checks.form.general             The form on “{step}” has an entry that does not fit. Under {section}, open the form and correct it.
checks.field.name               “{field}” needs a name. Type it under Name on its card.
checks.field.description        The description of “{field}” has no text in the base language. Type it under Description on its card.
checks.field.choiceName         A choice of “{field}” has no name. Under Choices, type one.
checks.field.key                The key of “{field}” cannot be used. Under More, change it in the Developer view.
checks.field.kind               The kind of “{field}” does not fit its settings. Under Kind, choose one again.
checks.field.optionsAndSource   “{field}” has typed choices and a place its values come from. Correct it in the JSON surface.
checks.field.sourceGone         “{field}” reads from a place that was removed. Under More, in Where values come from, choose another.
checks.field.pattern            The pattern on “{field}” cannot be read. Under More, correct it in Validation.
checks.field.rule               The rule on “{field}” cannot be read. Under More, correct it in Validation.
checks.field.default            The default value of “{field}” cannot be used. Under More, correct it in Default value.
checks.field.columnSource       “{field}” maps columns but reads from no source. Under More, in Where values come from, choose one.
checks.field.columnMapping      The column mapping of “{field}” is not complete. Under More, correct it in Where values come from.
checks.field.columnNotString    “{field}” maps columns, so it must hold one value. Under Kind, choose a kind that does.
checks.field.columnOnChoices    “{field}” maps columns but has typed choices. Correct it in the JSON surface.
checks.field.groupFlag          “{field}” is a group, so it cannot be technical or redactable. Correct it in the JSON surface.
checks.field.technicalUnwritten “{field}” is technical, and nothing fills it, so it never holds a value. Fill it from an action, or clear Technical under More.
checks.source.key               A place values come from has no name. Under Where values come from, type one.
checks.source.reservedName      “{source}” uses a name the studio keeps for itself. Under Where values come from, choose another.
checks.source.unknownType       “{source}” uses a kind this server does not offer. Under Where values come from, choose another.
checks.source.config            The settings of “{source}” do not pass. Under Where values come from, correct them.
checks.contract.fieldGone       What this process takes in or gives back names a field that was removed. Correct it in the JSON surface.
checks.contract.unusedOutcome   No end step uses the ending “{value}”. On Settings, take it out, or choose it on an end step.
checks.contract.reservedOutcome The ending “{value}” is kept for cancelled cases. On Settings, take it out.
checks.contract.general         What this process takes in and gives back is not complete. On Settings, finish it.
checks.fallback.section         Something under {section} on “{step}” does not pass a check. On the Checks tab, this check's Developer view names it.
checks.fallback.step            Something on “{step}” does not pass a check. On the Checks tab, this check's Developer view names it.
checks.fallback.field           Something on “{field}” does not pass a check. On the Checks tab, this check's Developer view names it.
checks.fallback.source          Something on “{source}” does not pass a check. On the Checks tab, this check's Developer view names it.
checks.fallback.process         Something in this process does not pass a check. On the Checks tab, this check's Developer view names it.
```

The process's name keeps `issues.processNeedsName`.

### D4. Subject, severity and order

`draft/checksRail.ts` keeps `groupChecksBySource`, `allChecksClear` and `checksDotState`, since the count and the dialog read them. It adds `groupChecksBySubject(validation)`.

- **Steps:** a `step`, `path`, `timer` or `action` issue. A `process` issue with a `loc` under `workflow` joins it.
- **Fields:** a `field` or `dataSource` issue. A `process` issue with a `loc` under `fields` or `dataSources` joins it.
- **Before publishing:** every other issue.

Inside Steps, rows follow the draft's step order, read from `steps[i]` in the `loc`. A stable sort keeps the rest.

Severity reads the source. `view` reads Worth a look, and every other source reads Must fix. `checksDotState` holds the same rule. The two words live in `checks.severity.blocker` ("Must fix") and `checks.severity.advisory` ("Worth a look"). Must fix prints in refusal and Worth a look in slate. Both take the Legend style.

### D5. The held-back line

Under Before publishing, one `<p>` reads one of two keys:

```text
checksRail.heldBackLine  More checks run once you fix the rows above. Publishing also checks each plugin's settings and any entry the studio cannot see.
checksRail.publishLine   Publishing also checks each plugin's settings and any entry the studio cannot see.
```

The first stands when any source holds back. The line's Developer view lists the held-back source names in mono, then the two existing sentences `checksRail.configHeldBack` and `checksRail.unknownKeysHeldBack`.

Before publishing draws while it holds a row or the line. It holds the line on the whole list and on a narrowed one. The start state alone draws neither.

`checksRail.heldBack` and `checksRail.groupClear` go. The start state keeps its one sentence and shows no line when nothing else is open.

### D6. The row

`CheckRow` is one `<li>`. It holds the severity word and the sentence with a generated id. The `Fix` button stands at the trailing edge, with `aria-describedby` on that id. The closed Developer view follows, with the source, the raw message and the location, all in mono.

A rail mounted with no `onFix` prints no button. `onFix` replaces the prop `onOpenIssue`.

The rail's frame keeps its box. Inside, a column caps at 52rem. A group's heading takes the Title style. Rows take 12px block padding and a hairline between. `checksRail.fix` reads "Fix", in the authoring command style.

### D7. The landing

`CheckTarget` gains `section?: SectionName`, `fieldId?: string`, `zone?: FieldCheckZone`, `dataSourceId?: string`, `focusId?: string` and `json?: true`. `checkTarget(issue, body)` reads `checkPlace` first, then `sectionOfIssue` and the entity. It answers:

| Issue | Tab and place | Focus lands on |
|---|---|---|
| Step, a section owns it | Steps, the step, that section open | the section's header |
| Step, name, description or kind | Steps, the step | the Name input |
| Way out | Steps, the step, Ways out open, the row marked | Ways out's header |
| Timer | Steps, the step, Time limit open | its header |
| Action | Steps, the step, the owning section open | its header |
| Process, `workflow.initialStep` | Steps | the Steps tab |
| Field | Fields, Catalog, the field selected, More open where the zone asks | the sentence at the zone |
| Data source | Fields, Where values come from, the source selected | the sentence in the editor |
| Contract | Settings, What it takes in and gives back | the Settings tab |
| Process name | stays put | the name input in the header bar |
| Process, `key`, `baseLocale` | Settings, Process | the Settings tab |
| Process, duplicate field key | Fields, Catalog | the Fields tab |
| Process, duplicate source name | Fields, Where values come from | the Fields tab |
| Any rule whose sentence names the JSON surface | the JSON surface opens | the JSON input |

`sectionOfIssue` decides for a step's subject. `LOC_SECTION` gains `key: "more"`, so a step's key check stands in More. More's Developer view opens by itself while a key check stands, as the field card's does. Its summary stays a native toggle, and a manual close holds until the check clears. A Fix on that check reopens it.

**Mechanics.** `EditScreen` holds `sectionRequest`, `{ stepId, section }`, passed to `StepPage`. An effect in `StepPage` opens that section when the ids match, then calls `onSectionOpened`, which clears the request. This is the shape `openMoreFor` already has.

`openTabFromRow` keeps its Read by callers and their focus on the tab. A new `fixCheck(target)` adds the landing. `pendingFocus`, `{ tab, elementId? }`, replaces `pendingTabFocus`, and its three writers move with it.

The effect keys on `[openTab, pendingFocus]`. It acts only while `pendingFocus.tab === openTab`. It focuses the element when one exists, else the tab button, then clears. `fixCheck` sets `jsonOpen` and `pendingFocus` in one batch. A Fix on an open tab and Add a step therefore land too. A target with a `fieldId` or `dataSourceId` sets no `pendingFocus`, since `fixRequest` owns that focus.

`EntityTabs` selects a Fields target through a `fixRequest` prop, because selection lives there. `FieldsTabViews` passes it down.

Its effect waits for `visible`, selects, and opens More. A second pass focuses the anchor once the card reads the selected field, then calls `onFixLanded`, which clears the request. A return to the tab therefore pulls no focus.

`IssueItems` gains `anchorId`, which sets `id` and `tabIndex={-1}` on the list, and `IssueList` forwards it. Anchors read `check-anchor-field-<zone>` and `check-anchor-source`. The unplaced checks share the `asks` anchor.

A new `namesFieldSource(loc)` joins `moreChecked`. A removed source's check therefore opens More, where its select stands. The focus pass tries the zone's anchor, then the `asks` anchor. A `values` check on a card with no Choices stands there.

The ids `step-page-name`, `process-header-name` and `json-surface-input` are new, each set on the existing input.

### D8. At the spot

`IssueItems` prints `issueText(issue)` with no source label. `issueSourceLabel` moves to `ChecksRail.tsx`, into the row's Developer view.

The step's name check stands directly under Name. The description check stands under Description. The masthead's end keeps the rest. The banner test `showsStructuralBanner` keeps its meaning. The name gap keeps `plain`.

### D9. Inherited points

- **ACCORDION-4.** The narrowing label reads `stepTextMap`, with no key.
- **ACCORDION-6.** `wayOutHeading` and the Leads to select read `paths.targetGone`, "(step removed)", when `path.to` names no step. The select holds that as a disabled option, and picking any step writes.
- **ACCORDION-9.** The name check above, plus focus. `onAddStep` sets `pendingFocus` for `step-page-name`.
- **ACCORDION-11, first half.** When the current step changes, `StepsRail` scrolls its row into view with `block: "nearest"`. Fix then leaves the rail truthful below 64rem. The overscroll half stays, since `DESIGN.md` states that rule.
- **ACCORDION-12.** The `warning` style in `StepPage.tsx` takes a 3px rule in `colors.advisory`. The exemption in `web-styling` narrows to the timers panel, since this and D5 remove the other two.
- **ACCORDION-14.** The walk and the removal dialog read `stepTextMap`. The rail keeps "(unnamed step)" beside its own number, which tells two apart.
- **HEADER-7, first half.** The texts below replace the blocked sentence and a refused publish's message.

  A new function, `describePublishRefusal(error, draft)`, builds the refusal. One sentence per issue follows the first text. A tier 4 answer reads the fallback text instead, since a dialog has no row. The server's text stands in a closed Developer view, in the dialog and in the banner. It travels through `actions.errorDetail`. The other screens keep `describeError`, since the author did not type their body here.

  ```text
  draftToolbar.publishDialogBlocked   This draft cannot go out yet. Open Checks and fix what it marks Must fix.
  checks.publishRefused               Publishing stopped. Fix these, then publish again:
  checks.publishRefusedCrossProcess   Publishing stopped: this process depends on another process in a way the server refused. The Developer view below names both.
  checks.publishRefusedFallback       Something in this process does not pass a check. The Developer view below names it.
  ```

- **MAPLABELS-5.** `condition.onlyWhenHeading` reads "Only if". The key name stays. The spec heading in `studio-condition-builder` and `docs/authoring-guide.md` follow in this change.
- **The 22 renders with no alert role.** This change's part: `childLoadError` on the step page takes `role="alert"`. The decisions entry narrows to 21.

### D10. The points that stay open

Recorded in `docs/decisions.md` and the report:

- **ACCORDION-7:** a visual detail with no bearing on checks.
- **ACCORDION-8:** the plugin envelope editor needs its own change.
- **ACCORDION-10:** masthead height; the first-step control's place needs its own look.
- **ACCORDION-11, second half:** a `DESIGN.md` rule.
- **ACCORDION-13:** whether Ways out folds its rows needs a design pass.
- **ACCORDION-15:** a press-to-move control needs its own change.
- **ACCORDION-16:** section 8 left it out, as M14.
- **ACCORDION-17 and HEADER-7's revision:** change 13 owns the dialog.

## Risks / Trade-offs

- **A long list of sentences drifts from the engine.** The scan test fails when a literal has no rule. A parser's text cannot drift, because tier 2 ignores it.
- **A sentence names a place the kind lacks.** D2's fall to tier 4 covers it, and a test walks each kind.
- **Names in the base locale on a German-editing session.** Accepted, as D1 says.
- **Focus effects across commits.** The field landing waits for `visible` and the selected field. The browser check walks each row of D7's table.
- **Five requirements reverse.** Each goes by REMOVED plus ADDED, since a MODIFIED block cannot drop a base scenario. The archive appends ADDED blocks at the end, so the sync moves each to its predecessor's place.

## Migration Plan

None. The change alters the UI alone and stores nothing.

## Open Questions

None. The owner pre-approved the recommendations.
