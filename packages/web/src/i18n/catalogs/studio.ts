/**
 * UI-chrome only (proposal.md scope): headings, buttons, empty-state prose,
 * badges, explanatory hints. Deliberately NOT translated: raw contract
 * vocabulary shown as a bare field label ("key", "label", "type", "guard",
 * "versionBinding", "visible"/"required"/"readonly"/"group", ...) and
 * literal schema enum values ("manual", "automatic", "task", "subprocess") —
 * translating those would decouple the on-screen word from the JSON
 * property/value it names, which defeats the point for a structural JSON
 * editor.
 *
 * The guided-vocabulary layer (`studio-guided-vocabulary`) carves out the
 * authoring controls an author with no JSON meets: a step's kind, its
 * assignment strategy, its time limit and a subprocess step's version
 * binding. Those read as plain phrases here, and "pinned"/"latest-at-spawn"
 * are worded with them. The contract's own word stays one disclosure away, in
 * the step's raw JSON.
 */
export const en = {
  "app.title": "Process Studio",
  "app.draftIncomplete":
    "Draft is not yet structurally valid — CEL, registry, duration, and cross-process checks are held back until it is (see the Zod issues below).",
  "app.leaveDraftConfirm": "Leave this draft? Unsaved edits will be lost.",
  "app.processLegend": "Process",

  "draftToolbar.save": "Save",
  "draftToolbar.saving": "Saving…",
  "draftToolbar.discard": "Discard draft",
  "draftToolbar.conflictMessage": "This draft was changed elsewhere.",
  "draftToolbar.conflictReload": "Reload",
  "draftToolbar.publish": "Publish",
  "draftToolbar.publishing": "Publishing…",
  "draftToolbar.publishUnavailable": "Needs the publish permission for this process",
  // Beside Publish while the draft's worst open issue is a blocker. The
  // control stays available: the click still opens the confirmation dialog,
  // which states the same warning (`studio-publish`).
  "draftToolbar.publishBlockedReason": "Blocked by an open issue",
  "draftToolbar.dialogCancel": "Cancel",
  "draftToolbar.dialogProcess": "Process",
  "draftToolbar.dialogProcessId": "Process id",
  "draftToolbar.dialogRevision": "Revision",
  "draftToolbar.publishDialogHeading": "Publish this draft",
  "draftToolbar.publishDialogNextVersion": "Next version",
  "draftToolbar.publishDialogUnsaved": "This draft has unsaved changes. Publishing saves them first.",
  "draftToolbar.publishDialogOpenIssues": "Open issues",
  "draftToolbar.publishDialogBlocked": "The engine refuses this publish until somebody fixes a blocking issue.",
  "draftToolbar.publishDialogImmutable": "A published version can never change. To correct it, publish a new one.",
  "draftToolbar.discardDialogHeading": "Discard this draft",
  "draftToolbar.discardDialogLastSaved": "Last saved",
  "draftToolbar.discardDialogKeepsPublished": "The published versions stay. Only the unpublished draft goes.",

  "fieldCatalog.heading": "Field catalog",
  "fieldCatalog.addField": "+ Add field",
  "fieldCatalog.removeField": "Remove field",
  "fieldCatalog.customTypeOption": "custom (plugin)",
  "fieldCatalog.typeDropsFormatConfirm": "The new type doesn't allow this field's format. Switch anyway and drop it?",
  "fieldCatalog.typeDropsControlConfirm": "The new type doesn't allow this field's control. Switch anyway and drop it?",
  "fieldCatalog.typeDropsBothConfirm": "The new type allows neither this field's format nor its control. Switch anyway and drop both?",
  "fieldCatalog.optionsLegend": "options / dataSource (mutually exclusive)",
  "fieldCatalog.noneOption": "(none)",
  "fieldCatalog.optionValuePlaceholder": "value",
  "fieldCatalog.optionLabelPlaceholder": "label",
  "fieldCatalog.removeOption": "remove",
  "fieldCatalog.addOption": "+ Add option",
  "fieldCatalog.subFieldsLegend": "sub-fields",
  "fieldCatalog.addSubField": "+ Add sub-field",
  "fieldCatalog.customTypeLabel": "custom type",
  "fieldCatalog.developerView": "Developer view",
  "fieldCatalog.groupChildrenHeading": "Fields inside this group",
  "fieldCatalog.baseLocaleMark": "base locale",
  "fieldCatalog.translationComplete": "translated",
  "fieldCatalog.translationGap": "{count} missing",
  "fieldCatalog.technicalLabel": "Technical",
  "fieldCatalog.technicalClearConfirm":
    "Checking Technical will clear {count} required/readonly key(s) across this draft's steps. Continue?",
  "fieldCatalog.previewHeading": "How it will look",
  "fieldCatalog.previewResolvesAtRuntime":
    "This field's choices come from a data source. They resolve when a participant reaches this step, not here.",
  "fieldCatalog.previewPersonResolvesAtRuntime":
    "This field's people list comes from the groups this process allows. It resolves when a participant reaches this step, not here.",
  "fieldCatalog.usedInHeading": "Used in",
  "fieldCatalog.usedInEmpty": "No step asks for this field yet.",
  "fieldCatalog.showOnCanvas": "Show on the canvas",
  "fieldCatalog.onlyAskWhenHeading": "Only ask this when",
  "fieldCatalog.conditionNoSteps": "No step asks for this field yet, so there is nothing to condition.",
  "fieldCatalog.conditionScopeNote": "Writes to: {steps}.",
  "fieldCatalog.conditionDivergentNote": "These steps currently disagree: {steps}.",
  "fieldCatalog.conditionLiteralNote": "This replaces a literal condition on: {steps}.",
  "fieldCatalog.whereValuesHeading": "Where values come from",
  "fieldCatalog.validationHeading": "Validation",
  "fieldCatalog.whatAsksHeading": "What this field asks",
  "fieldCatalog.whatKindHeading": "What kind of field",
  "fieldCatalog.askForThisHeading": "Ask for this",
  // The five control labels of the definition half. They read as words rather
  // than as the JSON members they write, because the zone headings around them
  // are plain questions and a raw `dataSource` beside "Where values come from"
  // put two vocabularies in one zone. The JSON view stays the place that
  // spells the member names (design.md: the developer's vocabulary no longer
  // leads). Each one is a word an author reads, so none is mono.
  "fieldCatalog.kindLabel": "Kind",
  "fieldCatalog.labelLabel": "Label",
  "fieldCatalog.descriptionLabel": "Description",
  "fieldCatalog.keyLabel": "Key",
  "fieldCatalog.dataSourceLabel": "Data source",
  "fieldCatalog.requiredLabel": "A participant must fill this in",
  "fieldCatalog.requiredNoSteps": "No step asks for this field yet, so there is nothing to require.",
  "fieldCatalog.requiredTechnicalNote":
    "The process writes this field itself, so no step view may ask a participant for it.",
  "fieldCatalog.requiredScopeNote": "Writes to: {steps}.",
  "fieldCatalog.requiredDivergentNote": "These steps currently disagree: {steps}.",
  "fieldCatalog.definitionHalfLabel": "What this field is",
  "fieldCatalog.effectHalfLabel": "Where it acts in the process",
  "fieldCatalog.effectEmptyRoute": "Put this field on a step",
  "fieldCatalog.startHeading": "This process collects nothing yet",
  "fieldCatalog.startBody":
    "A field is one thing the process asks a participant for: an amount, a date, a reason. Add the first one, then say which steps ask for it.",
  "fieldCatalog.addFirstField": "Add the first field",

  // One name and one note per entry of the engine's `FIELD_KINDS` table. The
  // kind picker and the index rail's row both read these, so the two cannot
  // name a different word for the same field.
  "fieldKind.text.name": "Text",
  "fieldKind.text.note": "A line of text.",
  "fieldKind.longText.name": "Long text",
  "fieldKind.longText.note": "A text box that grows, instead of one line.",
  "fieldKind.radioChoice.name": "One choice",
  "fieldKind.radioChoice.note": "Every choice visible at once, one pickable.",
  "fieldKind.date.name": "Date",
  "fieldKind.date.note": "A calendar date, with no time of day.",
  "fieldKind.dateTime.name": "Date and time",
  "fieldKind.dateTime.note": "A calendar date with a time of day.",
  "fieldKind.email.name": "Email address",
  "fieldKind.email.note": "One address the browser and the engine both check.",
  "fieldKind.person.name": "Person",
  "fieldKind.person.note": "One person or group, picked from the ones this process allows.",
  "fieldKind.number.name": "Number",
  "fieldKind.number.note": "A number, with optional min/max checks.",
  "fieldKind.wholeNumber.name": "Whole number",
  "fieldKind.wholeNumber.note": "No decimal part. Conditions compare it as a whole number.",
  "fieldKind.yesNo.name": "Yes/no",
  "fieldKind.yesNo.note": "A single checkbox.",
  "fieldKind.yesNoRadio.name": "Yes/no buttons",
  "fieldKind.yesNoRadio.note": "Both answers visible at once, one pickable.",
  "fieldKind.multiChoice.name": "Several choices",
  "fieldKind.multiChoice.note": "Any number of choices from a list.",
  "fieldKind.checkboxChoice.name": "Checkboxes",
  "fieldKind.checkboxChoice.note": "Every choice visible at once, any number pickable.",
  "fieldKind.people.name": "People",
  "fieldKind.people.note": "Any number of people or groups, picked from the ones this process allows.",
  "fieldKind.file.name": "File",
  "fieldKind.file.note": "A reference to an uploaded file.",
  "fieldKind.group.name": "Group",
  "fieldKind.group.note": "A container for other fields, not a value of its own.",

  "defaultValue.heading": "Default value",
  "defaultValue.literalLabel": "value",
  "defaultValue.celLabel": "CEL expression",
  "defaultValue.editAsCel": "Edit as CEL",
  "defaultValue.useValue": "Use a value",
  "defaultValue.clear": "Clear default",
  "defaultValue.unparseable": "This does not parse as CEL.",
  "defaultValue.groupDisabledNote": "A group's own default is never read. Set defaults on its children instead.",
  "defaultValue.typeDisabledNote": "This type accepts no default here.",
  "defaultValue.dataSourceNoOptions":
    "This field's choices come from a data source. They resolve at runtime, so there is nothing to pick a default from here. Use CEL instead.",
  "defaultValue.personNoOptions":
    "This field's people list comes from the groups this process allows. It resolves at runtime, so there is nothing to pick a default from here. Use CEL instead.",

  "fieldValidation.notEvaluated": "not evaluated for this field type",

  "dataSources.heading": "Data sources",
  "dataSources.empty": "No data sources yet.",
  "dataSources.addDataSource": "+ Add data source",
  "dataSources.removeDataSource": "Remove data source",
  "dataSources.pickListKey": "Pick a data list",
  "dataSources.dataListLabel": "data list",

  "instanceQuery.process": "target process",
  "instanceQuery.pickProcess": "-- select a process --",
  "instanceQuery.steps": "steps",
  "instanceQuery.statuses": "statuses (default: running)",
  "instanceQuery.labelField": "label field",
  "instanceQuery.pickField": "-- select a field --",
  "instanceQuery.staleReference": "not in any published version",
  "instanceQuery.comparisons": "where",
  "instanceQuery.operatorEq": "=",
  "instanceQuery.operatorNe": "≠",
  "instanceQuery.operatorIn": "in",
  "instanceQuery.literal": "literal",
  "instanceQuery.ownField": "field of this process",
  "instanceQuery.addComparison": "+ Add comparison",
  "instanceQuery.removeComparison": "Remove",
  "instanceQuery.attributes": "attributes",
  "instanceQuery.columnKey": "column key",
  "instanceQuery.addAttribute": "+ Add attribute",
  "instanceQuery.removeAttribute": "Remove",

  "steps.unnamedStep": "(unnamed step)",
  "steps.crossProcessLegend": "cross-process check (checkSubprocessChildRefs)",
  "steps.crossProcessChecked": "checked against loaded child —",
  "steps.unload": "unload",
  "steps.loadChildError": "failed to load child process JSON",
  "steps.pathsHeading": "Paths",
  "steps.timersHeading": "Timers",
  "steps.assignmentLabel": "Who can act on this step",

  "paths.empty": "No paths.",
  "paths.addPath": "+ Add path",
  "paths.newPathTargetLabel": "new path's target",
  "paths.removePath": "Remove path",
  "paths.selectTargetStep": "(select target step)",
  "paths.triggeredByLabel": "triggered by",
  "paths.triggeredByManual": "a participant's choice",
  "paths.triggeredByAutomatic": "a condition",

  "timers.empty": "No timers.",
  "timers.addTimer": "+ Add timer",
  "timers.removeTimer": "Remove timer",
  "timers.durationOption": "A time limit",
  "timers.deadlineOption": "A deadline a condition computes (CEL)",
  "timers.reminderOption": "(reminder — no transition)",

  // The time-limit control: a number and a unit over `Timer.duration`
  // (`studio-guided-vocabulary`). It writes the ISO-8601 duration the
  // definition contract requires, so nothing here names a contract key.
  "timeLimit.numberLabel": "After",
  "timeLimit.unitLabel": "Unit",
  "timeLimit.unitHours": "hours",
  "timeLimit.unitDays": "days",
  "timeLimit.unitWeeks": "weeks",
  "timeLimit.written": "This time limit is written out, so a number and a unit cannot state it.",
  "timeLimit.tooFar": "That reaches further ahead than a time limit can go.",

  "actions.empty": "No actions.",
  "actions.addAction": "+ Add action",
  "actions.removeAction": "Remove action",
  "actions.typePlaceholder": "action type (e.g. http.call)",
  "actions.pluginLabel": "action",
  "common.invalidJson": "invalid JSON",
  "common.configErrorPrefix": "config:",
  "actions.outputMappingLabel": "output mapping",
  "actions.addOutputMapping": "+ Add output mapping",
  "actions.removeOutputMapping": "remove",
  "actions.resultCelPlaceholder": "result CEL",

  "contract.heading": "Contract",
  "contract.callableCheckbox": "this process is subprocess-callable",
  "contract.inputFieldsLegend": "inputFields",
  "contract.outputFieldsLegend": "outputFields",
  "contract.outcomesLegend": "outcomes",
  "contract.removeOutcome": "remove",
  "contract.newOutcomePlaceholder": "new outcome name",
  "contract.addOutcome": "+ Add outcome",

  // The form editor. It replaced the override-row list, so the old `view.*`
  // keys went with it. "visible"/"required"/"readonly"/"span"/"group" stay
  // untranslated, per this file's header: they name the JSON being edited.
  "formEditor.heading": "Form",
  "formEditor.back": "← Back to the process",
  "formEditor.stepNotFound": "This step no longer exists in the draft.",
  "formEditor.navigateAwayKeepsChanges": "Every change is already in the draft. Save, Discard and Publish stay on the toolbar.",
  "formEditor.paletteLabel": "Catalog fields not on this form",
  "formEditor.paletteHeading": "Available fields",
  "formEditor.paletteEmpty": "Every catalog field is on this form.",
  "formEditor.mintHeading": "Add a field to the process",
  "formEditor.mintText": "Text",
  "formEditor.mintChoice": "Choice",
  "formEditor.mintDate": "Date",
  "formEditor.mintFile": "File",
  "formEditor.mintSection": "Section",
  "formEditor.developerView": "Developer view",
  "formEditor.canvasLabel": "Form layout",
  "formEditor.canvasEmpty": "No fields yet. Drag one from the list, or choose it there.",
  "formEditor.dropHere": "Drop a field here to place it last.",
  "formEditor.columnsLabel": "Columns",
  "formEditor.oneColumn": "One",
  "formEditor.twoColumns": "Two",
  "formEditor.moveUp": "Move up",
  "formEditor.moveDown": "Move down",
  "formEditor.remove": "Remove",
  "formEditor.removeGroup": "Remove ({count})",
  "formEditor.markRequired": "required",
  "formEditor.markReadonly": "readonly",
  "formEditor.markCel": "CEL",
  "formEditor.stripLabel": "Selected field",
  "formEditor.selectAField": "Choose a field on the canvas to edit how this step presents it.",
  "formEditor.visible": "visible",
  "formEditor.required": "required",
  "formEditor.readonly": "readonly",
  "formEditor.span": "span",
  "formEditor.group": "group",
  "formEditor.noGroup": "(none)",
  "formEditor.unnamedField": "(unnamed field)",
  "formEditor.noteSectionHeading": "Notes",
  "formEditor.addNote": "Add a note",
  "formEditor.noteHeading": "Note",
  "formEditor.noteText": "text",
  "formEditor.newNoteText": "New note",
  "formEditor.noteType": "note",
  "formEditor.emptyNote": "(empty note)",

  // The form's own tab strip, above the canvas. "tab" is the picker's label
  // beside "group" and "span", and stays lowercase with them: all three name
  // the JSON key they write.
  "formEditor.tabRowLabel": "Form tabs",
  "formEditor.addTab": "Add a tab",
  "formEditor.renameTab": "Rename",
  "formEditor.moveTabLeft": "Move left",
  "formEditor.moveTabRight": "Move right",
  "formEditor.removeTab": "Remove tab",
  "formEditor.tabName": "Tab name",
  "formEditor.newTabName": "New tab",
  "formEditor.unnamedTab": "(unnamed tab)",
  "formEditor.tab": "tab",
  "formEditor.tabFromGroup": "The group decides the tab.",

  // The condition builder. "guard", "visible"/"required"/"readonly" and the CEL
  // operators stay untranslated, per this file's header: they name the JSON the
  // author is editing.
  "condition.empty": "No condition — this always matches.",
  "condition.addRow": "+ Add row",
  "condition.removeRow": "Remove row",
  "condition.selectOperand": "(select a field)",
  "condition.operandLabel": "field",
  "condition.operatorLabel": "operator",
  "condition.valueLabel": "value",
  "condition.valuePlaceholder": "value…",
  "condition.selectValue": "(select a value)",
  "condition.contains": "contains",
  "condition.yes": "yes",
  "condition.no": "no",
  "condition.rawRow": "Written by hand. Edit it as CEL.",
  "condition.incomplete": "Needs a value before it is written.",
  "condition.joinerHint": "How the rows combine. Click to flip.",
  "condition.celReadout": "Writes",
  "condition.celEmpty": "nothing yet",
  "condition.editAsCel": "Edit as CEL",
  "condition.useBuilder": "Use the builder",
  "condition.unparseable": "This does not parse as CEL, so the builder cannot open it.",
  "condition.developerView": "Developer view",
  "condition.onlyWhenHeading": "Only when",

  // The rule-row builder (`field.validation.rule`). A new component, not a
  // ConditionBuilder instance (design.md), with its own operand and
  // developer-view copy: "value"/"field"/"operator" stay untranslated
  // per this file's header, the JSON the author is editing.
  "ruleBuilder.thisAnswer": "this answer",
  "ruleBuilder.empty": "No rule — nothing is checked.",
  "ruleBuilder.and": "and",
  "ruleBuilder.valueKindLabel": "compare against",
  "ruleBuilder.valueKindLiteral": "a value",
  "ruleBuilder.valueKindField": "another field",
  "ruleBuilder.selectValueField": "(select a field)",

  // The subprocess step's own two guided controls: the process picker and the
  // version binding (`studio-guided-vocabulary`). The picker prints a process
  // label, never a `proc_` id, and the binding pair reads as two plain
  // choices over "pinned"/"latest-at-spawn".
  "subprocess.processLabel": "Which process it calls",
  "subprocess.selectProcess": "(choose a process)",
  "subprocess.unknownProcess": "(a process you cannot open)",
  "subprocess.bindingLegend": "Which version it calls",
  "subprocess.bindingPinned": "Always this exact version",
  "subprocess.bindingLatest": "The newest version whose contract still matches",
  "subprocess.bindingNote": "A contract change starts a new signature, so this step keeps the last matching version.",
  "subprocess.pinnedVersionLabel": "Version",
  "subprocess.removeMappingEntry": "remove",
  "subprocess.addInputMapping": "+ Add input mapping",
  "subprocess.addOutputMapping": "+ Add output mapping",

  "contentLocale.legend": "Content locale",
  "contentLocale.invalid": "invalid locale code",
  "contentLocale.addPlaceholder": "add locale (e.g. de)",
  "contentLocale.add": "+ add locale",

  "tabs.rowLabel": "Process surface",
  "tabs.canvas": "Canvas",
  "tabs.steps": "Steps",
  "tabs.fields": "Fields",
  "tabs.dataSources": "Data sources",
  "tabs.paths": "Paths",
  "tabs.forms": "Forms",
  "tabs.matrix": "Field matrix",
  "tabs.contract": "Contract",
  "tabs.changes": "Changes",
  "tabs.checks": "Checks",
  // Visually-hidden text appended to the Checks tab's count when it carries
  // the blocker color, so the state reaches a screen reader too — color
  // alone conveys nothing there (`studio-process-tabs`).
  "tabs.checksBlocking": "blocking a publish",
  // What the tab row's live region reads when the Checks count crosses from
  // clear to blocker. A full sentence, unlike the fragment above: a live
  // region reads on its own rather than joining an accessible name.
  "tabs.checksBlockingAnnounced": "A blocking issue appeared in Checks.",

  // The Forms tab: one plate per step that declares a view
  // (`studio-forms-overview`).
  "formsTab.gridLabel": "Forms in this process",
  "formsTab.empty": "No step in this process declares a form yet.",
  "formsTab.fieldCount": "{count} fields",
  "formsTab.fieldCountOne": "1 field",
  "formsTab.emptyForm": "Empty form",
  "formsTab.openForm": "Open the form",
  "formsTab.startForm": "Start the form",
  "formsTab.issueMark": "open issues on this form",
  "formsTab.issueMarkOne": "open issue on this form",
  "formsTab.requiredMark": "required",
  "formsTab.noteEntry": "Note",

  // The form editor's trailing pane: what a participant meets
  // (`studio-form-editor`).
  "formPreview.heading": "What a participant meets",
  "formPreview.submit": "Submit",
  // The strip inside the preview, named apart from the authoring strip above
  // it: one form-editor screen draws both over the same tab labels.
  "formPreview.formTabsLabel": "Form tabs in the preview",

  "columnMapping.heading": "Column mapping",
  "columnMapping.noColumns": "This list declares no column, so there is nothing to map.",
  "columnMapping.columnAria": "Column",
  "columnMapping.targetAria": "Target field",
  "columnMapping.addRow": "Map a column",
  "columnMapping.removeRow": "Remove",
  "columnMapping.staleColumn": "The list no longer declares this column. The mapping writes nothing until an operator declares it again, or you remove the row.",

  "panelsScreen.railLabel": "Editors",
  "panelsScreen.unnamedField": "(unnamed field)",
  "panelsScreen.unnamedDataSource": "(unnamed data source)",
  "panelsScreen.issueMark": "issues",
  "panelsScreen.moveTargetLabel": "Move this field to",
  "panelsScreen.moveTargetTopLevel": "Top level",
  "panelsScreen.movedIntoGroup": "{field} moved into {group}.",
  "panelsScreen.movedToTopLevel": "{field} moved out of {group}, to the top level.",
  "panelsScreen.moveAnnouncerLabel": "Field moves",
  "panelsScreen.keepsChanges": "This screen keeps every change. Save from the toolbar to persist it.",

  "fieldMatrix.heading": "Field matrix",
  "fieldMatrix.scrollRegionLabel": "Field matrix grid",
  "fieldMatrix.hatchedCell": "No view on this step",
  "fieldMatrix.hideInertToggle": "Hide inert columns",
  "fieldMatrix.countLine": "{declared} field entries · {fields} fields × {steps} steps · {cells} cells the visible steps do not declare",
  "fieldMatrix.legendBulk": "A bulk badge sets the whole column or row it sits on.",
  "fieldMatrix.legendDefault": "A control left at its default writes no key.",
  "fieldMatrix.legendCel": "CEL marks an expression, not a fixed value.",
  "fieldMatrix.legendBlank": "A dash marks a field this step does not declare.",
  "fieldMatrix.legendFlagged": "A flagged cell already produces a Checks finding.",
  "fieldMatrix.legendTechnical": "The technical marker means the engine, not a participant, writes this field.",
  "fieldMatrix.legendColors": "Each checkbox's color names its own flag:",
  "fieldMatrix.columnInertNote": "No view — inert",
  "fieldMatrix.rowTypeLabel": "Type",
  "fieldMatrix.flaggedCellMark": "Flagged in Checks",
  // The blast radius a bulk press carries. The studio has no undo for a bulk
  // write, so the badge states what a press touches before an author presses
  // it. The flag's own word stays a separate label rather than sitting inside
  // these sentences, so no sentence gets assembled from fragments. A count
  // never modifies a bare noun here either, so one wording serves one cell
  // and twenty without a second key per number.
  "fieldMatrix.bulkSetColumn": "Sets this flag on step {name}. Cells it writes: {total}. Already set: {set}.",
  "fieldMatrix.bulkClearColumn": "Clears this flag from step {name}. Cells it writes: {total}.",
  "fieldMatrix.bulkSetRow": "Sets this flag for field {name}. Cells it writes: {total}. Already set: {set}.",
  // The matrix drew a header row above nothing at all, which
  // `design-language.md` forbids: "An empty state says so in words. It never
  // shows as an empty table." The two causes need different words, because
  // one is a process to fix and the other a filter to clear.
  // The corner cell heads the field column. It became a focus position when
  // the headers joined the roving model, so it needs a name: an author
  // arriving there by arrow key otherwise lands on silence.
  "fieldMatrix.cornerLabel": "Fields, down the side. Steps, across the top.",
  "fieldMatrix.emptyNoFields": "This process declares no field yet, so the matrix has nothing to line up.",
  "fieldMatrix.emptyNoColumns": "Hide inert columns is on, and it leaves no step to show. Turn it off to see them.",
  // A gated checkbox carried `aria-disabled` and swallowed the click without
  // a word. Each case says which rule gates it.
  "fieldMatrix.gatedNotWritten": "Nothing writes this field before this step, so the flag would strand the participant.",
  "fieldMatrix.gatedTechnical": "The definition contract rejects this flag on a technical field.",
  "fieldMatrix.bulkClearRow": "Clears this flag from field {name}. Cells it writes: {total}.",
  "fieldMatrix.technicalRowMark": "Technical",

  // The step page's eight section headings (`studio-step-page`). "Time
  // limit" is the word for a timer everywhere an author reads one; the
  // contract's own `deadline` key stays in the step's raw JSON.
  "stepSections.entry": "On entry",
  "stepSections.assignment": "Assignment",
  "stepSections.form": "Step form fields",
  "stepSections.paths": "Path to",
  "stepSections.timers": "Time limit",
  "stepSections.exit": "On exit",
  "stepSections.howItEnds": "How the case ends",
  "stepSections.terminalNoPathsOrTimers": "A step that ends the process has no outgoing path and no time limit.",
  "stepSections.noAssignmentWarning":
    "This step has no assignment. Only the starter or an admin can act on it, and it stays out of everyone's My-tasks inbox. Publishing still works.",
  "stepSections.actions": "Actions",
  "stepSections.subprocess": "Which process it calls",
  "stepSections.behaviorZoneLabel": "Behavior",
  "stepSections.pathsEmptyTerminal": "A step that ends the process has no outgoing path.",
  "stepSections.noIssues": "No issues on this step.",
  "stepSections.setInitialStep": "Set as the process's first step",
  "stepSections.outcomePlaceholder": "choose an outcome…",
  "stepSections.isInitialStep": "This is the process's first step.",
  "stepSections.viewBuildForm": "Build the form",
  "stepSections.viewFieldsConfigured": "fields configured",
  "stepSections.noSelection": "Select a step or a path to edit it.",
  "stepSections.renameLabel": "Step name",
  "stepSections.keyField": "key",
  "stepSections.labelField": "label",
  "stepSections.idField": "id",
  "stepSections.descriptionField": "description",
  "stepSections.outcomeField": "outcome",
  "stepSections.outcomeHint": "An outcome binds only on a contracted process.",

  // The steps rail: one numbered row per step, in reachability order
  // (`studio-step-page`).
  "stepsRail.label": "Steps",
  "stepsRail.fieldCount": "{count} form fields",
  "stepsRail.calls": "Calls {process}",
  "stepsRail.callsNothing": "Calls no process yet",
  "stepsRail.ends": "Ends as {outcome}",
  "stepsRail.endsNoOutcome": "Ends with no outcome",
  "stepsRail.issueMark": "open issues",
  "stepsRail.issueMarkOne": "open issue",
  "stepsRail.moveEarlier": "Move earlier",
  "stepsRail.moveLater": "Move later",
  "stepsRail.addLegend": "Add",
  "stepsRail.addStep": "Add a step",
  "stepsRail.addSubprocess": "Add a call to another process",
  "stepsRail.addEnd": "Add an end",
  "stepsRail.empty": "This process carries no step yet.",

  // The step page: one wide page holding everything one step declares.
  "stepPage.stepNumber": "Step {number}",
  "stepPage.sectionsLabel": "Step settings",
  "stepPage.removeStep": "Remove this step",
  "stepPage.walkLabel": "Walk the steps",
  "stepPage.previous": "Previous: {step}",
  "stepPage.previousNone": "Previous step",
  "stepPage.next": "Next: {step}",
  "stepPage.nextNone": "Next step",
  "stepPage.developerView": "Developer view",
  "stepPage.developerViewNote":
    "Read-only here. The JSON surface stays the one place for hand-authoring a definition.",

  // The role a step's stamp reads, in the steps register and in the
  // configuration pane's masthead. `draft/roleStamp.ts` picks which one.
  "stepRole.initial": "Initial",
  "stepRole.task": "Task",
  "stepRole.subprocess": "Subprocess",
  "stepRole.end": "End",

  // The phrase a control choosing a step's kind prints
  // (`studio-guided-vocabulary`). Keyed by `draft/performedBy.ts`'s own three
  // values, so the closed key union stays exhaustive against the model the
  // sections read. A stamp naming an existing step's kind keeps the short
  // `stepRole.*` word instead: a phrase does not fit a stamp.
  "stepKind.legend": "What this step is",
  "stepKind.participant": "A step someone works",
  "stepKind.subprocess": "A call to another process",
  "stepKind.terminal": "An end",

  // The note under the canvas bar's step-kind menu entries
  // (`studio-guided-vocabulary`), read through `newStepNote`. Same three
  // `performedBy.ts` values as `stepKind.*` above.
  "stepKindNote.participant": "Someone fills its form and picks a path.",
  "stepKindNote.subprocess": "Waits for it and routes on its outcome.",
  "stepKindNote.terminal": "Closes the case with a named outcome.",

  // The four assignment strategies the engine registers: `static` in
  // `src/engine/registry.ts`'s createDefaultAssignmentRegistry, and the three
  // `org.` types in `src/engine/assignment-strategies.ts`. A registered
  // strategy this table misses falls back to its registry type, in mono.
  "assignmentStrategy.static.name": "A fixed list of people",
  "assignmentStrategy.static.note": "Everyone the list names can act on the step.",
  "assignmentStrategy.org.manager-of-starter.name": "The starter's manager",
  "assignmentStrategy.org.manager-of-starter.note":
    "The directory resolves that person when an instance enters the step.",
  "assignmentStrategy.org.group-members.name": "Everyone in a group",
  "assignmentStrategy.org.group-members.note":
    "Whoever is in the group when an instance enters the step can act on it.",
  "assignmentStrategy.org.actor-from-field.name": "The person a field names",
  "assignmentStrategy.org.actor-from-field.note":
    "Whoever that field holds when an instance enters the step can act on it.",
  // An absent assignment names no strategy at all, so it never resolves
  // through the registry.
  "assignment.none": "Nobody in particular",

  "headerBar.unnamedProcess": "(untitled process)",
  "headerBar.revision": "rev.",
  "headerBar.unsaved": "Unsaved changes",
  "headerBar.saved": "Saved",
  "headerBar.lastSaved": "Last saved",
  "headerBar.published": "Published",
  "headerBar.findingPrefix": "Stale reference in",
  "headerBar.findingCarriedBy": "carried by",
  "headerBar.findingLiveElsewhere": "live instance(s) elsewhere",
  "headerBar.findingCarriedByNone": "not carried by any live version",
  "headerBar.menuTrigger": "More actions",
  "headerBar.menuGroupDraft": "Process, saved with the draft",
  "headerBar.manageGroups": "Manage assignment groups for this process",
  "headerBar.menuGroupViews": "Views",
  "headerBar.jsonOpen": "Open the JSON surface",
  "headerBar.jsonLeave": "Leave the JSON surface",
  "headerBar.versions": "Versions",
  "headerBar.player": "Player",

  // The Player screen. Its own strings are still mostly inline English; this
  // one is a catalog key because it is an accessible name.
  "player.formTabsLabel": "Form tabs",
  "player.formTabOpenedOne": "Opened the {tab} tab. 1 field still needs an entry.",
  "player.formTabOpenedMany": "Opened the {tab} tab. {count} fields still need an entry.",

  "checksRail.heading": "Checks",
  "checksRail.heldBack": "Held back until earlier checks pass.",
  "checksRail.groupClear": "No open issues in this group.",
  // The validation verdict alone. The rail runs checks; it holds no
  // permission, so it says nothing here about who may publish.
  "checksRail.allClear": "No open issues.",
  // The permission verdict, from the loaded draft's own `canPublish` report.
  // One of the two follows the sentence above, inside the same box.
  "checksRail.clearReadyToPublish": "This draft is ready to publish.",
  "checksRail.clearNeedsPublishPermission": "Publishing needs the publish permission for this process.",
  "checksRail.configHeldBack": "Plugin config check held back — verified at publish.",
  "checksRail.unknownKeysHeldBack": "Unknown-key check held back — verified at publish.",
  // A rail narrowed to one step, and the control that widens it again
  // (`studio-forms-overview`: a card's badge opens Checks on its own step).
  "checksRail.narrowedTo": "Showing the checks on {step}.",
  "checksRail.showEvery": "Show every check",

  "jsonView.label": "Draft body (JSON)",
  "jsonView.apply": "Apply",

  "issues.notChecked": "not checked",

  "canvas.fitToView": "Fit to view",
  "canvas.arrange": "Arrange",
  "canvas.arrangeConfirm":
    "Arrange every step from the workflow graph? This overwrites every saved position and clears any waypoint a path carries.",
  "canvas.elseMarker": "else",
  "canvas.initialStamp": "start",
  "canvas.edgeStyleToggle": "Rounded corners",
  "canvas.selectionHeading": "Steps selected",
  "canvas.selectionRemove": "Remove steps",
  "canvas.groupCreate": "Group these steps",
  "canvas.groupDefaultName": "Group",
  "canvas.groupName": "Group name",
  "canvas.groupCollapse": "Collapse",
  "canvas.groupExpand": "Expand",
  "canvas.groupUngroup": "Ungroup",
  "canvas.groupStepCount": "steps",

  // The canvas bar (`studio-guided-vocabulary`): its Add step button, the
  // caret that opens the step-kind menu, and what the bar prints for a
  // selected step no chain of paths reaches.
  "canvas.addStep": "Add step",
  "canvas.addStepMore": "More step kinds",
  "canvas.unconnected": "unconnected",

  // The accessible names the canvas composes for its nodes, its paths and
  // its `<svg>` root. Each `{slot}` is filled with `.replace()`. The two
  // base templates carry only the segments every element has; a segment that
  // is sometimes absent takes a key of its own, because filling an unused
  // slot with an empty string prints "Capture, capture, Step, , 2 outgoing
  // paths". The kind word comes from `stepRole.task`, `stepRole.subprocess` or
  // `stepRole.end`, the same three the stamp reads, and the guard slot takes
  // the readable guard the edge label draws or, for a guardless path,
  // `canvas.pathLabelNoGuard`.
  //
  // The fan count picks between two node templates, because a fixed plural
  // announces "1 outgoing paths" on every single-path step.
  "canvas.nodeLabel": "{label}, {key}, {kind}, {paths} outgoing paths",
  "canvas.nodeLabelOnePath": "{label}, {key}, {kind}, {paths} outgoing path",
  "canvas.nodeLabelOutcome": "outcome {outcome}",
  "canvas.nodeLabelInitial": "entry point",
  "canvas.pathLabel": "{label}, from {source} to {target}, {trigger}, {guard}",
  "canvas.pathLabelPriority": "priority {priority}",
  "canvas.pathLabelNoGuard": "no guard",
  "canvas.pathLabelNoTrigger": "trigger not set",
  "canvas.groupDisclosure": "Steps in {group}",
  "canvas.svgLabel": "Process graph",

  "ribbon.expand": "Expand the canvas",
  "ribbon.collapse": "Collapse the canvas",

  "changesView.firstPublish": "Nothing to compare yet. Publishing this draft would be the first version.",
  "changesView.none": "This draft matches the version it sits on.",
  "changesView.loading": "Reading the published version…",

  "pathsView.source": "Source step",
  "pathsView.trigger": "Trigger",
  "pathsView.priority": "Priority",
  "pathsView.guard": "Guard",
  "pathsView.target": "Target",
  "pathsView.noPriority": "No priority",
  "pathsView.noGuard": "No guard",
  "pathsView.empty": "This process has no path yet. Drag from a step on the canvas to make one.",

  "expression.placeholder": "CEL expression",
  "plugin.typePlaceholder": "plugin type identifier",
  "plugin.selectType": "-- select type --",
  "plugin.unregisteredType": "(unregistered)",
  "plugin.switchToJson": "Edit as JSON",
  "plugin.switchToForm": "Edit as form",
  "plugin.fieldRequired": "required",
  "plugin.arrayHint": "one per line",

  "migrationPlan.back": "← Back to versions",
  "migrationPlan.surfaceForm": "Mapping",
  "migrationPlan.surfaceJson": "JSON",
  "migrationPlan.surfaceLabel": "Plan surface",
  "migrationPlan.jsonLabel": "Plan spec (JSON — stepMap, fieldMap, transforms, onUnmappable, unmappableStep)",
  "migrationPlan.save": "Save plan",
  "migrationPlan.saving": "Saving…",
  "migrationPlan.loading": "Loading…",
  "migrationPlan.frozen": "this plan is frozen; further edits will be rejected.",
  "migrationPlan.formUnavailable": "The mapping form needs both version bodies. Edit the JSON instead.",
  "migrationPlan.orphanLegend": "Orphan-key dry run",
  "migrationPlan.orphanEmpty": "No orphan keys found.",
  "migrationPlan.orphanUnreadable": "unreadable",

  "migrationForm.stepMapLegend": "stepMap",
  "migrationForm.stepMapHint":
    "Move an instance from a step of the source version onto a step of the target version. A step the target still declares needs no row.",
  "migrationForm.fieldMapLegend": "fieldMap",
  "migrationForm.fieldMapHint":
    "Rename a field. Each target field takes at most one source, and both sides must hold the same CEL type.",
  "migrationForm.transformsLegend": "transforms",
  "migrationForm.transformsHint":
    "Compute a target field from the pre-migration data. The server type-checks each expression on save.",
  "migrationForm.unmappableLegend": "onUnmappable",
  "migrationForm.unmappableHint":
    "What happens to an instance sitting on a step the target version does not declare.",
  "migrationForm.sourceLabel": "Source",
  "migrationForm.targetLabel": "Target",
  "migrationForm.expressionLabel": "CEL expression",
  "migrationForm.expressionPlaceholder": "data.amount * 2.0",
  "migrationForm.unmappableStepLabel": "Unmappable step",
  "migrationForm.policyNone": "(none — an unmappable instance is skipped)",
  "migrationForm.addRow": "+ Add row",
  "migrationForm.removeRow": "Remove",
  "migrationForm.noRows": "No rows yet.",
  "migrationForm.unresolved": "(not in this version)",

  "error.retry": "Retry",
  "error.failed": "Failed",
  "error.authorization": "You don't have permission to do that.",
  "error.actorResolution": "Your session could not be resolved. Sign in again.",
  "error.requestShape": "That request was malformed.",
  "error.notFound": "Not found.",
  "error.draftConflict": "This draft was changed elsewhere.",
  "error.migrationPlan": "This migration plan can't be changed right now.",
  "error.alreadyClaimed": "Someone else claimed this step. Refresh to continue.",
  "error.notACandidate": "You are not a candidate for this step.",
  "error.notClaimed": "This step is no longer claimed. Refresh to continue.",
  "error.notClaimant": "You must claim this step before submitting.",
  "error.notAssigned": "You are not assigned to this step.",
  "error.guardRefused": "The selected path is no longer available. Refresh and try again.",
  "error.concurrencyConflict": "The instance changed concurrently. Refresh and try again.",
  "error.publishRejected": "The server rejected this definition:",
  "error.crossProcess": "A subprocess reference could not be resolved:",
  "error.network": "Could not reach the server. Check your connection and try again.",
  "error.serverError": "The server hit an error. Try again.",
  "error.generic": "Something went wrong. Try again.",
} as const;

export type CatalogKey = keyof typeof en;

export const studioCatalog = { en };
