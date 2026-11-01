/**
 * Every author-facing string on a studio screen: headings, buttons, empty-state
 * prose, captions, legends, validation messages, warnings and badges.
 * Deliberately NOT translated: literal schema enum values ("manual",
 * "automatic", "task", "subprocess") that an option prints as its own value.
 *
 * A caption reads words, never a JSON property. The property's own name stays
 * in the Developer view, which prints the JSON and holds the step's and each
 * way out's key input (`studio-guided-vocabulary`).
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
  "app.draftIncomplete": "Some checks cannot run yet. Open Checks and fix what it lists.",
  "app.leaveDraftConfirm": "Leave this draft? Unsaved edits will be lost.",
  "app.screenLoading": "Loading the screen…",
  "app.processLegend": "Process",

  // The one dialog form's own words (`panels/shared/StudioDialog.tsx`).
  "dialog.cancel": "Cancel",
  "dialog.noUndo": "The studio has no undo.",

  "draftToolbar.save": "Save",
  "draftToolbar.saving": "Saving…",
  "draftToolbar.discard": "Discard draft",
  "draftToolbar.conflictMessage": "This draft was changed elsewhere.",
  "draftToolbar.conflictReload": "Reload",
  "draftToolbar.publish": "Publish",
  "draftToolbar.publishing": "Publishing…",
  "draftToolbar.publishUnavailable": "Needs the publish permission for this process",
  "draftToolbar.publishNeedsStep": "Publish needs a first step",
  // Beside Publish while the draft's worst open issue is a blocker. The
  // control stays available: the click still opens the confirmation dialog,
  // which states the same warning (`studio-publish`).
  "draftToolbar.publishBlockedReason": "Blocked by an open issue",
  "draftToolbar.dialogCancel": "Cancel",
  "draftToolbar.dialogProcess": "Process",
  "draftToolbar.dialogProcessId": "Process id",
  "draftToolbar.dialogRevision": "Revision",
  "draftToolbar.dialogKey": "Key",
  "draftToolbar.dialogDeveloperView": "Developer view",
  "draftToolbar.dialogLanguages": "Languages",
  "draftToolbar.publishDialogHeading": "Publish this draft",
  "draftToolbar.publishDialogNextVersion": "Next version",
  "draftToolbar.publishDialogUnsaved": "This draft has unsaved changes. Publishing saves them first.",
  "draftToolbar.publishDialogOpenIssues": "Open issues",
  "draftToolbar.publishDialogBlocked": "This draft cannot go out yet. Open Checks and fix what it marks Must fix.",
  "draftToolbar.publishDialogImmutable": "A published version can never change. To correct it, publish a new one.",
  // The publish dialog's Changes row (`studio-publish`): one sentence per
  // state of the base-version fetch, then a disclosure over the change list.
  "draftToolbar.publishDialogChanges": "Changes",
  "draftToolbar.publishDialogFirstVersion": "This publish mints the first version.",
  "draftToolbar.publishDialogChangesReading": "Reading version {version}…",
  "draftToolbar.publishDialogChangesFailed": "Could not read version {version}: {message}",
  "draftToolbar.publishDialogChangesNone": "No changes since version {version}.",
  "draftToolbar.publishDialogChangesOne": "1 change since version {version}.",
  "draftToolbar.publishDialogChangesMany": "{count} changes since version {version}.",
  "draftToolbar.publishDialogChangesShow": "Show",
  "draftToolbar.publishDialogChangesHide": "Hide",
  "draftToolbar.discardDialogHeading": "Discard this draft",
  "draftToolbar.discardDialogLastSaved": "Last saved",
  "draftToolbar.discardDialogKeepsPublished": "The published versions stay. Only the unpublished draft goes.",

  // The notice under the header bar that offers the work a 401 kept in the
  // tab (`panels/RestoreNotice.tsx`). `t` takes no values, so the message
  // names no time.
  "restoreNotice.message": "Your session ended while this draft had unsaved changes. Detent kept them in this browser tab.",
  "restoreNotice.restore": "Restore unsaved changes",
  "restoreNotice.discard": "Discard them",
  "restoreNotice.replaceConfirm": "Replace your current changes with the restored ones?",

  "fieldCatalog.heading": "Field catalog",
  "fieldCatalog.addField": "+ Add field",
  "fieldCatalog.removeField": "Remove field",
  // The removal confirmation dialog, `RemoveFieldDialog.tsx`, which renders
  // when a removal reaches past the field catalog. One key per fact term and
  // per note, so no sentence is assembled from fragments; `{field}` fills
  // through `.replace()`, as `EntityTabs.tsx` does for the move sentences.
  "fieldCatalog.removeDialogHeadingField": "Remove “{field}”?",
  "fieldCatalog.removeDialogHeadingGroup": "Remove the group “{field}”?",
  "fieldCatalog.removeDialogFieldTerm": "Field",
  "fieldCatalog.removeDialogGroupTerm": "Group",
  "fieldCatalog.removeDialogFieldsInsideTerm": "Fields inside it",
  "fieldCatalog.removeDialogStepsTerm": "Steps showing it",
  "fieldCatalog.removeDialogWritersTerm": "Actions and mappings writing it",
  "fieldCatalog.removeDialogContractEntriesTerm": "Contract entries",
  "fieldCatalog.removeDialogColumnMappingsTerm": "Column mappings targeting it",
  "fieldCatalog.removeDialogCelReadsTerm": "CEL expressions reading it",
  "fieldCatalog.removeDialogPluginSettingsTerm": "Plugin settings naming it",
  "fieldCatalog.removeDialogNoteAlways": "Removing it also clears every step entry and reference that names it.",
  "fieldCatalog.removeDialogNoteGroup": "Every field inside the group leaves with it.",
  "fieldCatalog.removeDialogNoteCelKept": "CEL expressions and plugin settings keep their text.",
  "fieldCatalog.removeDialogNoteCheckPublish": "Check each one before you publish.",
  "fieldCatalog.removeDialogConfirmField": "Remove field",
  "fieldCatalog.removeDialogConfirmGroup": "Remove group",
  "fieldCatalog.removeDialogCancel": "Cancel",
  "fieldCatalog.customTypeOption": "custom (plugin)",
  "fieldCatalog.typeDropsFormatConfirm": "The new type doesn't allow this field's format. Switch anyway and drop it?",
  "fieldCatalog.typeDropsControlConfirm": "The new type doesn't allow this field's control. Switch anyway and drop it?",
  "fieldCatalog.typeDropsBothConfirm": "The new type allows neither this field's format nor its control. Switch anyway and drop both?",
  "fieldCatalog.noneOption": "(none)",
  "fieldCatalog.addSubField": "+ Add field to this group",
  "fieldCatalog.customTypeLabel": "custom type",
  "fieldCatalog.developerView": "Developer view",
  "fieldCatalog.groupChildrenHeading": "Fields inside this group",
  "fieldCatalog.baseLocaleMark": "base locale",
  "fieldCatalog.translationComplete": "translated",
  "fieldCatalog.translationGap": "{count} missing",
  "fieldCatalog.technicalClearConfirm":
    "Checking Technical will clear {count} required/readonly key(s) across this draft's steps. Continue?",
  "fieldCatalog.previewHeading": "How it will look",
  "fieldCatalog.previewResolvesAtRuntime":
    "This field's choices come from a data source. They resolve when a participant reaches this step, not here.",
  "fieldCatalog.previewPersonResolvesAtRuntime":
    "This field's people list comes from the groups this process allows. It resolves when a participant reaches this step, not here.",
  "fieldCatalog.usedInEmpty": "No step asks for this field yet.",
  "fieldCatalog.showOnCanvas": "Show on the map",
  "fieldCatalog.readByHeading": "Read by",
  "fieldCatalog.readByEmpty": "No condition reads this field.",
  "fieldCatalog.onlyAskWhenHeading": "Only ask this when",
  "fieldCatalog.conditionClear": "Clear on {steps}",
  "fieldCatalog.conditionDivergentNote": "These steps currently disagree: {steps}.",
  "fieldCatalog.conditionLiteralNote": "This replaces a literal condition on: {steps}.",
  "fieldCatalog.whereValuesHeading": "Where values come from",
  "fieldCatalog.validationHeading": "Validation",
  // The field card's control labels. They read as words rather than as the
  // JSON members they write, because the section headings around them are
  // plain words and a raw `dataSource` beside "Where values come from" put two
  // vocabularies in one section. The JSON view stays the place that spells the
  // member names (design.md: the developer's vocabulary no longer leads). Each
  // one is a word an author reads, so none is mono.
  "fieldCatalog.kindLabel": "Kind",
  "fieldCatalog.descriptionLabel": "Description",
  "fieldCatalog.keyLabel": "Key",
  "fieldCatalog.keyFollows": "The key follows the label until the first publish.",
  "fieldCatalog.keyByHand": "The label no longer sets this key.",
  "fieldCatalog.keyPublished": "This field is in a published version. The label no longer sets its key.",
  "fieldCatalog.keyEmpty": "Type a key, or press Escape to keep the current one.",
  "fieldCatalog.keyGrammar": "A key starts with a letter or an underscore and holds only lower-case letters, digits and underscores.",
  "fieldCatalog.keyLiteral": "Conditions read this word as a value. Pick another key.",
  "fieldCatalog.keyTaken": "{field} already uses this key.",
  "fieldCatalog.rewroteOne": "Updated 1 condition.",
  "fieldCatalog.rewroteMany": "Updated {count} conditions.",
  "fieldCatalog.dataSourceLabel": "Values come from",
  "fieldCatalog.requiredTechnicalNote":
    "The process writes this field itself, so no step view may ask a participant for it.",
  "fieldCatalog.requiredDivergentNote": "These steps currently disagree: {steps}.",
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
  "defaultValue.clear": "Clear default",
  "defaultValue.unparseable": "This does not parse as CEL.",
  "defaultValue.groupDisabledNote": "A group's own default is never read. Set defaults on its children instead.",
  "defaultValue.typeDisabledNote": "This type accepts no default here.",
  "defaultValue.dataSourceNoOptions":
    "This field's choices come from a data source. They resolve at runtime, so there is nothing to pick a default from here. Use CEL instead.",
  "defaultValue.personNoOptions":
    "This field's people list comes from the groups this process allows. It resolves at runtime, so there is nothing to pick a default from here. Use CEL instead.",

  "fieldValidation.notEvaluated": "not evaluated for this field type",

  "dataSources.empty": "No data sources yet.",
  "dataSources.addDataSource": "+ Add data source",
  "dataSources.removeDataSource": "Remove data source",
  "dataSources.removeDialogHeading": "Remove the data source?",
  "dataSources.removeDialogSourceTerm": "Data source",
  "dataSources.removeDialogFieldsTerm": "Fields using it",
  "dataSources.removeDialogColumnMappingsTerm": "Column mappings on them",
  "dataSources.removeDialogNoteClears": "Removing it also clears the data source from those fields.",
  "dataSources.removeDialogNoteClearsMappings": "It also clears the column mappings on them.",
  "dataSources.removeDialogNoteNoUndo": "The studio has no undo.",
  "dataSources.removeDialogCancel": "Cancel",
  "dataSources.pickListKey": "Pick a data list",
  "dataSources.dataListLabel": "data list",
  "dataSources.nameCaption": "Name",
  "dataSources.kindLegend": "What kind of source",
  // The kind picker's names. A type this table misses prints its registry type.
  "dataSourceKind.db.list": "A data list an operator keeps",
  "dataSourceKind.instance.query": "Cases of another process",
  "dataSourceKind.static": "A list typed into this process",
  // `{list}` is the data list key the draft names.
  "dataSources.unknownListWarning":
    "The server has no data list '{list}'. Publishing still works. The field's options stay empty until an operator creates the list.",

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
  "instanceQuery.catalogError": "The published versions of this process could not be read, so the form cannot offer its steps and fields.",
  "instanceQuery.comparedField": "compared field",
  "instanceQuery.operator": "operator",
  "instanceQuery.rightSide": "compare with",
  "instanceQuery.comparisonValue": "comparison value",
  "instanceQuery.attributeField": "attribute field",
  "instanceQuery.listHint": "Separate values with a comma.",
  "instanceQuery.notNumber": "This value is not a number.",
  "instanceQuery.notBoolean": "Each value must be true or false.",
  "instanceQuery.duplicateColumnKey": "An earlier row already uses this column key, so this row is not saved.",

  "steps.unnamedStep": "(unnamed step)",
  // Two or more unnamed steps, each by its steps-rail number.
  "steps.unnamedStepNumbered": "(unnamed step {n})",
  "options.repeatedLabel": "{label} ({n})",
  // A step label two or more steps share, each by its steps-rail number.
  "options.repeatedStep": "{label} (step {n})",
  "steps.crossProcessLegend": "cross-process check (checkSubprocessChildRefs)",
  "steps.crossProcessChecked": "checked against loaded child —",
  "steps.unload": "unload",
  "steps.onEntryLegend": "What happens when entered",
  "steps.onExitLegend": "What happens when left",
  "steps.onCancelLegend": "What happens when cancelled",
  "steps.loadChildError": "failed to load child process JSON",
  "steps.assignmentLabel": "Who can act on this step",

  "paths.empty": "No way out yet.",
  "paths.addPath": "+ Add a way out",
  "paths.newPathTargetLabel": "Where the new way out leads",
  "paths.removePath": "Remove this way out",
  "paths.selectTargetStep": "(choose a step)",
  "paths.triggeredByLabel": "How it is taken",
  "paths.triggeredByManual": "A person chooses",
  "paths.triggeredByAutomatic": "Happens by itself",
  // A manual path's guard: the runtime offers the button only while it holds.
  "paths.manualGuardNote": "The person sees this way out's button only while the condition holds.",
  "paths.manualGuardHint": "Leave it empty to always offer this way out.",
  "paths.automaticGuardHint": "Leave it empty on the one way out taken when nothing else matches.",
  "paths.labelCaption": "Name",
  "paths.keyCaption": "Key",
  "paths.toCaption": "Leads to",
  "paths.priorityCaption": "Tried in this order, lowest first",
  "paths.onPathLegend": "What happens when it is taken",
  "paths.rowHeading": "{path} → {step}",
  "paths.unnamedPath": "(unnamed way out)",
  "paths.noTargetYet": "(no step yet)",
  "paths.targetGone": "(step removed)",
  "paths.developerView": "Developer view",

  "timers.empty": "No time limit.",
  "timers.addTimer": "+ Add a time limit",
  "timers.removeTimer": "Remove this time limit",
  "timers.durationOption": "After a set time",
  "timers.deadlineOption": "At a moment written as CEL",
  "timers.reminderOption": "(a reminder: the case stays put)",
  "timers.descriptionCaption": "Description",
  "timers.kindCaption": "When it runs out",
  "timers.deadlineCaption": "Deadline (CEL)",
  "timers.targetPathCaption": "The way out it takes when it runs out, skipping that way out's condition",
  "timers.onFireActionsLegend": "What happens when it runs out",

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

  "actions.empty": "Nothing happens yet.",
  "actions.addAction": "+ Add an action",
  "actions.removeAction": "Remove this action",
  "actions.typePlaceholder": "action type (e.g. http.call)",
  "actions.pluginLabel": "Action",
  "common.invalidJson": "invalid JSON",
  "common.configErrorPrefix": "config:",
  "actions.outputMappingLabel": "Values it writes back",
  "actions.addOutputMapping": "+ Add a value it writes back",
  "actions.removeOutputMapping": "Remove",
  "actions.resultCelPlaceholder": "result CEL",

  "contract.callableCheckbox": "Other processes can call this one",
  "contract.inputFieldsLegend": "What it takes in",
  "contract.outputFieldsLegend": "What it gives back",
  "contract.outcomesLegend": "How it can end",
  "contract.removeOutcome": "Remove",
  "contract.newOutcomePlaceholder": "Name of an ending",
  "contract.addOutcome": "+ Add an ending",

  // The form editor. It replaced the override-row list, so the old `view.*`
  // keys went with it. The strip's captions read words ("Asked", "Required",
  // "Read-only", "Width"), and the JSON property each one writes stays in the
  // Developer view.
  "formEditor.heading": "The form for {step}",
  "formEditor.back": "← Back to the process",
  "formEditor.breadcrumb": "Breadcrumb",
  "formEditor.crumbForm": "Form",
  "formEditor.nameLabel": "Name",
  "formEditor.nameInputLabel": "Field name",
  "formEditor.namePlaceholder": "Name this field…",
  "formEditor.seedChoice": "Choice {n}",
  "formEditor.spanOne": "One column",
  "formEditor.spanBoth": "Both columns",
  "formEditor.markCondition": "Condition",
  "formEditor.noteKind": "Note",
  "formEditor.stepNotFound": "This step no longer exists in the draft.",
  "formEditor.loadFailed": "The form editor could not load. Your draft is unchanged: go back, save it, then reload the page.",
  "formEditor.navigateAwayKeepsChanges": "Every change is already in the draft. The header bar saves and publishes it, and its ⋮ menu discards it.",
  "formEditor.paletteLabel": "Catalog fields not on this form",
  "formEditor.paletteHeading": "Available fields",
  "formEditor.paletteEmpty": "Every catalog field is on this form.",
  "formEditor.mintHeading": "Add a field to the process",
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
  // A card control's accessible name, naming the entry it acts on. Each
  // begins with the control's visible text above (WCAG 2.5.3).
  "formEditor.moveUpNamed": "Move up: {field}",
  "formEditor.moveDownNamed": "Move down: {field}",
  "formEditor.removeNamed": "Remove: {field}",
  "formEditor.removeGroupNamed": "Remove ({count}): {field}",
  "formEditor.moveNoteUp": "Move up: the note",
  "formEditor.moveNoteDown": "Move down: the note",
  "formEditor.removeNote": "Remove: the note",
  "formEditor.markRequired": "Required",
  "formEditor.markReadonly": "Read-only",
  "formEditor.stripLabel": "Selected field",
  "formEditor.selectAField": "Choose a field on the canvas to edit how this step presents it.",
  "formEditor.visible": "Asked",
  "formEditor.required": "Required",
  "formEditor.readonly": "Read-only",
  "formEditor.span": "Width",
  "formEditor.group": "Group",
  "formEditor.noGroup": "(none)",
  "formEditor.unnamedField": "(unnamed field)",
  "formEditor.noteSectionHeading": "Notes",
  "formEditor.addNote": "Add a note",
  "formEditor.noteHeading": "Note",
  "formEditor.noteText": "Text",
  "formEditor.newNoteText": "New note",
  "formEditor.emptyNote": "(empty note)",

  // The form's own tab strip, above the canvas. "Tab" is the picker's label
  // beside "Group" and "Width".
  "formEditor.tabRowLabel": "Form tabs",
  "formEditor.addTab": "Add a tab",
  "formEditor.renameTab": "Rename",
  "formEditor.moveTabLeft": "Move left",
  "formEditor.moveTabRight": "Move right",
  "formEditor.removeTab": "Remove tab",
  "formEditor.tabName": "Tab name",
  "formEditor.newTabName": "New tab",
  "formEditor.unnamedTab": "(unnamed tab)",
  "formEditor.tab": "Tab",
  "formEditor.tabFromGroup": "The group decides the tab.",

  // The condition builder. Its rows and its sentence read words; the CEL
  // stands only in its Developer view. `rawRow` and `unparseable` serve the
  // rule builder too.
  "condition.empty": "No condition yet: this always matches.",
  "condition.addRow": "+ Add row",
  "condition.removeRow": "Remove row",
  "condition.selectOperand": "(select a field)",
  "condition.operandLabel": "field",
  "condition.operatorLabel": "operator",
  "condition.valueLabel": "value",
  "condition.valuePlaceholder": "value…",
  "condition.selectValue": "(select a value)",
  "condition.yes": "yes",
  "condition.no": "no",
  "condition.rawRow": "Written by hand. Edit it as CEL.",
  "condition.incomplete": "Needs a value before it is written.",
  "condition.joinerHint": "How the rows combine. Click to flip.",
  "condition.unparseable": "This does not parse as CEL, so the builder cannot open it.",
  "condition.developerView": "Developer view",
  "condition.onlyWhenHeading": "Only if",
  // The operator select's words, one per operator.
  "condition.op.eq": "is",
  "condition.op.ne": "is not",
  "condition.op.lt": "is less than",
  "condition.op.le": "is at most",
  "condition.op.gt": "is greater than",
  "condition.op.ge": "is at least",
  "condition.op.in": "contains",
  // One clause per operator, so a translator sees the whole clause.
  "condition.clause.eq": "{field} is {value}",
  "condition.clause.ne": "{field} is not {value}",
  "condition.clause.lt": "{field} is less than {value}",
  "condition.clause.le": "{field} is at most {value}",
  "condition.clause.gt": "{field} is greater than {value}",
  "condition.clause.ge": "{field} is at least {value}",
  "condition.clause.in": "{field} contains {value}",
  "condition.clause.raw": "a hand-written rule",
  "condition.join.and": "{left} and {right}",
  "condition.join.or": "{left} or {right}",
  "condition.joiner.and": "and",
  "condition.joiner.or": "or",
  "condition.sentence": "{condition}.",
  "condition.sentence.held": "Until you finish the row, the condition stays: {condition}.",
  "condition.sentence.none": "Finish a row to set the condition.",
  "condition.sentence.divergent": "The steps hold different conditions. Build one here to set it on every step.",
  "condition.rawRowSentence": "A hand-written rule. The Developer view holds its text.",
  "condition.readerRaw": "A hand-written rule.",
  // The condition a way out's sentence and the form preview's note read for a
  // guard with no readable row, or source that does not parse.
  "condition.handWrittenHolds": "a hand-written rule holds",
  "readBy.wayOut": "On {step}: way out {wayOut}",
  "readBy.asked": "When {step} asks for {field}",
  "readBy.required": "When {step} requires {field}",
  "readBy.readonly": "When {field} is read-only on {step}",
  "readBy.fieldRule": "The rule for {field}",
  "readBy.stepRule": "The rule for {field} on {step}",
  "readBy.default": "The default value of {field}",
  "readBy.timeLimit": "The time limit on {step}",
  "readBy.noteShown": "When {step} shows a note",
  "readBy.childIn": "Values passed to the called process on {step}",
  "readBy.childOut": "Values copied back from the called process on {step}",
  "readBy.otherOnStep": "Another rule on {step}",
  "readBy.other": "Another rule in this process",
  "condition.unparseableRows": "This condition cannot show as rows. Fix it in the Developer view below.",
  "condition.celCaption": "CEL",
  // The operand picker's entries and headings.
  "condition.unnamedField": "(unnamed field)",
  "condition.operand.caseStatus": "The case's status",
  "condition.operand.personRoles": "The person's roles",
  "condition.operand.childOutcome": "How the called process ended",
  "condition.operand.childField": "{label}, from the called process",
  "condition.clauseOperand.caseStatus": "the case's status",
  "condition.clauseOperand.personRoles": "the person's roles",
  "condition.clauseOperand.childOutcome": "how the called process ended",
  "condition.group.fields": "Fields",
  "condition.group.child": "The called process",
  "condition.group.case": "The case",
  "condition.group.person": "The person",
  "condition.status.running": "running",
  "condition.status.completed": "completed",
  "condition.status.cancelled": "cancelled",
  "condition.status.faulted": "faulted",

  // The rule-row builder (`field.validation.rule`). A new component, not a
  // ConditionBuilder instance (design.md), with its own operand and
  // developer-view copy. Only its captions read words: its readout prints
  // the CEL source beside the rows ("Writes <code>…</code>").
  "ruleBuilder.thisAnswer": "this answer",
  "ruleBuilder.empty": "No rule yet: every answer passes.",
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
  "subprocess.legend": "The call to another process",
  "subprocess.contractRefCaption": "Child contract hash",
  "subprocess.inputMappingLegend": "Values passed to the child",
  "subprocess.outputMappingLegend": "Values copied back from the child",
  "subprocess.bindingLegend": "Which version it calls",
  "subprocess.bindingPinned": "Always this exact version",
  "subprocess.bindingLatest": "The newest version whose contract still matches",
  "subprocess.bindingNote": "A contract change starts a new signature, so this step keeps the last matching version.",
  "subprocess.pinnedVersionLabel": "Version",
  "subprocess.removeMappingEntry": "remove",
  "subprocess.addInputMapping": "+ Add input mapping",
  "subprocess.addOutputMapping": "+ Add output mapping",
  "subprocess.childInputsLoading": "Loading the input fields of the called process.",
  "subprocess.childInputsFailed": "The input fields of the called process could not load.",
  "subprocess.childInputsNone": "The called process declares no input fields.",
  "subprocess.noteAllMapped": "Every input field of the called process is mapped.",

  // A locale option that has gaps. `{locale}` is the code, `{count}` the number of missing entries.
  "contentLocale.optionGap": "{locale} — {count} missing",
  "contentLocale.addLabel": "Add another language",
  "contentLocale.invalid": "That is not a language code. Try one such as de or fr-CH.",
  "contentLocale.addPlaceholder": "Language code, such as de",
  "contentLocale.add": "Add",

  "tabs.rowLabel": "Process surface",
  "tabs.map": "Map",
  "tabs.settings": "Settings",
  "tabs.steps": "Steps",
  "tabs.fields": "Fields",
  "tabs.forms": "Forms",
  "tabs.checks": "Checks",
  // Visually-hidden text appended to the Checks tab's count when it carries
  // the blocker color, so the state reaches a screen reader too — color
  // alone conveys nothing there (`studio-process-tabs`).
  "tabs.checksBlocking": "blocking a publish",
  // What the tab row's live region reads when the Checks count crosses from
  // clear to blocker. A full sentence, unlike the fragment above: a live
  // region reads on its own rather than joining an accessible name.
  "tabs.checksBlockingAnnounced": "A blocking issue appeared in Checks.",

  // The Fields tab's sub-row (`studio-process-tabs`).
  "fieldsViews.rowLabel": "Views of the fields",
  "fieldsViews.catalog": "Catalog",
  "fieldsViews.matrix": "Where fields appear",
  "fieldsViews.sources": "Where values come from",

  // The Settings tab: its sub-row, then the Process view's controls
  // (`studio-process-tabs`).
  "settings.rowLabel": "Views of the settings",
  "settings.process": "Process",
  "settings.contract": "What it takes in and gives back",
  "settings.access": "Access",
  "settings.baseLocale": "Base language",
  "settings.contentLocale": "Language you are editing",
  "settings.cancellable": "A case can be cancelled while it runs",
  "settings.collaborationLegend": "Collaboration",
  "settings.comments": "Participants can comment on a case",
  "settings.attachments": "Participants can attach files to a case",
  "settings.developerView": "Developer view",
  "settings.key": "Key",
  "settings.processId": "Process id",
  "settings.revision": "Revision",
  "settings.publishedVersion": "Published version",
  "settings.definitionHash": "Definition hash",
  "settings.manageGroups": "Manage assignment groups for this process",

  // The Forms tab: one plate per step that declares a view
  // (`studio-forms-overview`).
  "formsTab.gridLabel": "Forms in this process",
  "formsTab.empty": "No step in this process declares a form yet.",
  "formsTab.fieldCount": "{count} fields",
  "formsTab.fieldCountOne": "1 field",
  "formsTab.openForm": "Open the form",
  "formsTab.startForm": "Start the form",
  // The check badge's accessible name, one whole sentence per plural form.
  // `{count}` is the badge's visible number, and `{step}` is the step label
  // the card's heading prints.
  "formsTab.issueMark": "{count} open issues on {step}",
  "formsTab.issueMarkOne": "1 open issue on {step}",
  // The foot's count text (`studio-forms-overview`: "A card names its step
  // and counts the fields it draws"), one key per plural form so a
  // translator sees the whole sentence. `fieldCount`/`fieldCountOne` state
  // the field count alone; `miniatureLabel`/`miniatureLabelOne` state the
  // required count beside it. `miniatureEmpty` stands in the miniature's
  // place on a form with no field entry.
  "formsTab.miniatureLabel": "{count} fields, {required} required",
  "formsTab.miniatureLabelOne": "1 field, {required} required",
  "formsTab.miniatureEmpty": "No fields yet",
  // The legend above the grid (`studio-forms-overview`: "The Forms tab
  // explains the miniature's marks"). `legendLabel` names the list. Each
  // other key holds the words beside one sample, in `FORMS_LEGEND`'s order.
  "formsTab.legendLabel": "What the marks mean",
  "formsTab.legendField": "Field",
  "formsTab.legendRequired": "Required",
  "formsTab.legendConditional": "Required if a condition holds",
  "formsTab.legendHeight": "Taller asks for more",

  // The form editor's trailing pane: what a participant meets
  // (`studio-form-editor`).
  "formPreview.heading": "What a participant meets",
  "formPreview.submit": "Submit",
  // The strip inside the preview, named apart from the authoring strip above
  // it: one form-editor screen draws both over the same tab labels.
  "formPreview.formTabsLabel": "Form tabs in the preview",
  // One line per guarded manual path. The preview has no instance data, so it
  // draws the control and names the condition the runtime tests.
  "formPreview.guardedPathNote": "{label}: shown only when {condition}",

  "columnMapping.heading": "Column mapping",
  "columnMapping.noColumns": "This list declares no column, so there is nothing to map.",
  "columnMapping.columnAria": "Column",
  "columnMapping.targetAria": "Target field",
  "columnMapping.addRow": "Map a column",
  "columnMapping.removeRow": "Remove",
  "columnMapping.staleColumn": "The list no longer declares this column. The mapping writes nothing until an operator declares it again, or you remove the row.",

  "panelsScreen.railLabel": "Editors",
  "panelsScreen.unnamedField": "(unnamed field)",
  "panelsScreen.unnamedDataSource": "(unnamed source)",
  "panelsScreen.issueMark": "issues",
  "panelsScreen.railEntryGroup": "in {group}",
  "panelsScreen.moveTargetLabel": "Move this field to",
  "panelsScreen.moveTargetTopLevel": "Top level",
  "panelsScreen.movedIntoGroup": "{field} moved into {group}.",
  "panelsScreen.movedToTopLevel": "{field} moved out of {group}, to the top level.",
  "panelsScreen.fieldAnnouncerLabel": "Field moves and removals",
  "panelsScreen.fieldRemoved": "{field} removed.",
  "panelsScreen.fieldRemovedWithOne": "{field} removed, with the one field inside it.",
  "panelsScreen.fieldRemovedWithMany": "{field} removed, with the {count} fields inside it.",
  "panelsScreen.keepsChanges": "This screen keeps every change. Save from the toolbar to persist it.",

  "fieldMatrix.heading": "Field matrix",
  "fieldMatrix.scrollRegionLabel": "Field matrix grid",
  "fieldMatrix.hatchedCell": "No form on this step",
  "fieldMatrix.hideInertToggle": "Hide steps with no form",
  "fieldMatrix.countLine": "{declared} placements · {fields} fields × {steps} steps · {cells} empty cells",
  "fieldMatrix.legendBulk": "A badge sets the whole column or row it sits on.",
  "fieldMatrix.legendDefault": "An unchecked box writes nothing.",
  "fieldMatrix.legendCel": "Condition means a rule decides in place of a fixed yes or no.",
  "fieldMatrix.legendBlank": "A dash marks a field this step's form does not hold.",
  "fieldMatrix.legendFlagged": "A marked cell stands in Checks.",
  "fieldMatrix.legendTechnical": "Technical means the process fills the field in by itself.",
  "fieldMatrix.legendColors": "Each box's color names its mark:",
  "fieldMatrix.columnInertNote": "No form",
  "fieldMatrix.flaggedCellMark": "Flagged in Checks",
  // The blast radius a bulk press carries. The studio has no undo for a bulk
  // write, so the badge states what a press touches before an author presses
  // it. The flag's own word stays a separate label rather than sitting inside
  // these sentences, so no sentence gets assembled from fragments. A count
  // never modifies a bare noun here either, so one wording serves one cell
  // and twenty without a second key per number.
  "fieldMatrix.bulkSetColumn": "Turns this on for every field on step {name}. Cells it writes: {total}. Already on: {set}.",
  "fieldMatrix.bulkClearColumn": "Turns this off for every field on step {name}. Cells it writes: {total}.",
  "fieldMatrix.bulkSetRow": "Turns this on for {name} on every step that asks for it. Cells it writes: {total}. Already on: {set}.",
  // The matrix drew a header row above nothing at all, which
  // `design-language.md` forbids: "An empty state says so in words. It never
  // shows as an empty table." The two causes need different words, because
  // one is a process to fix and the other a filter to clear.
  // The corner cell heads the field column. It became a focus position when
  // the headers joined the roving model, so it needs a name: an author
  // arriving there by arrow key otherwise lands on silence.
  "fieldMatrix.cornerLabel": "Fields, down the side. Steps, across the top.",
  "fieldMatrix.emptyNoFields": "This process has no field yet, so there is nothing to line up.",
  "fieldMatrix.emptyNoColumns": "Hide steps with no form is on, and it leaves no step to show. Turn it off to see them.",
  // A gated checkbox carried `aria-disabled` and swallowed the click without
  // a word. Each case says which rule gates it.
  "fieldMatrix.gatedNotWritten": "Nothing fills this field before this step, so the mark would strand the participant.",
  "fieldMatrix.gatedTechnical": "A technical field cannot take this mark.",
  "fieldMatrix.bulkClearRow": "Turns this off for {name} on every step that asks for it. Cells it writes: {total}.",
  "fieldMatrix.technicalRowMark": "Technical",

  // The step page's eight section headers (`studio-step-page`). "Time
  // limit" is the word for a timer everywhere an author reads one; the
  // contract's own `deadline` key stays in the step's raw JSON. An end step
  // is never left, so its lifecycle header reads `lifecycleEntryOnly`.
  "stepSections.assignment": "Who acts",
  "stepSections.lifecycle": "When entered or left",
  "stepSections.lifecycleEntryOnly": "When entered",
  "stepSections.more": "More",
  // The cancelling control's own field label, inside More, reads words like
  // the other field captions below.
  "stepSections.cancellableField": "Cancelling the case here",
  "stepSections.cancellableInherit": "Inherit from process",
  "stepSections.cancellableYes": "Cancellable",
  "stepSections.cancellableNo": "Not cancellable",
  "stepSections.cancellableResolvesYes": "Resolves to: cancellable.",
  "stepSections.cancellableResolvesNo": "Resolves to: not cancellable.",
  "stepSections.form": "Form",
  "stepSections.paths": "Ways out",
  "stepSections.timers": "Time limit",
  "stepSections.howItEnds": "How the case ends",
  "stepSections.terminalNoPathsOrTimers": "A step that ends the process has no way out and no time limit.",
  "stepSections.noAssignmentWarning":
    "Nobody is set to act on this step. Only the starter or an admin can act on it, and it stays out of everyone's My-tasks inbox. Publishing still works.",
  "stepSections.subprocess": "Which process it calls",
  "stepSections.pathsEmptyTerminal": "A step that ends the process has no way out.",
  "stepSections.noIssues": "No issues on this step.",
  "stepSections.setInitialStep": "Set as the process's first step",
  "stepSections.outcomePlaceholder": "choose how it ended…",
  "stepSections.isInitialStep": "This is the process's first step.",
  "stepSections.noSelection": "Select a step or a way out to edit it.",
  "stepSections.keyField": "Key",
  "stepSections.labelField": "Name",
  "stepSections.idField": "Id",
  "stepSections.descriptionField": "Description",
  "stepSections.outcomeField": "How it ended",
  "stepSections.outcomeHint": "The name counts only when another process calls this one.",

  // A section header's one-line summary (`studio-step-page`: "A section
  // header carries a summary and its state"). Each is one whole sentence or
  // phrase; the lifecycle counts print as numerals, so one key carries the
  // full sentence. More joins the override words with ", ", one per set
  // override.
  "stepSummary.pathsNone": "No way out yet",
  "stepSummary.timersNone": "No time limit",
  "stepSummary.timersOne": "1 time limit",
  "stepSummary.timersMany": "{count} time limits",
  "stepSummary.actionsNone": "No actions yet",
  "stepSummary.actions": "{entered} when entered, {left} when left",
  "stepSummary.actionsEntryOnly": "{entered} when entered",
  "stepSummary.outcomeNone": "No outcome yet",
  "stepSummary.processNone": "No process chosen yet",
  "stepSummary.moreDefaults": "Follows the process settings",
  "stepSummary.cancellableYes": "Cancellable here",
  "stepSummary.cancellableNo": "Not cancellable here",
  "stepSummary.commentsOn": "Comments on",
  "stepSummary.commentsOff": "Comments off",
  "stepSummary.attachmentsOn": "Attachments on",
  "stepSummary.attachmentsOff": "Attachments off",

  // The Remove this step confirmation (`studio-step-page`: "Removing a step
  // confirms first"). Cancel reuses `fieldCatalog.removeDialogCancel`.
  "removeStep.heading": "Remove “{step}”?",
  "removeStep.stepTerm": "Step",
  "removeStep.incomingTerm": "Ways out leading here",
  "removeStep.formFieldsTerm": "Fields on its form",
  "removeStep.firstStepNote": "This is the process's first step. The first remaining step takes its place.",
  "removeStep.incomingNote": "The ways out leading here stay, and the checks report them.",
  "removeStep.noUndo": "The studio has no undo.",
  "removeStep.confirm": "Remove the step",

  // The More section's per-field three-state control
  // (`studio-step-page`: "The Collaboration section offers a three-state
  // control per field"). `commentLegend`/`attachmentsLegend` keep their own
  // key rather than the header bar checkboxes' identical words, following
  // this catalog's one-key-per-site convention (see the five separate
  // "Developer view" keys). `currently` fills `{value}` with `valueOn`/
  // `valueOff`, the lowercase pair, distinct from the capitalized
  // `optionOn`/`optionOff` the control's own button prints.
  "collaboration.commentLegend": "Comment",
  "collaboration.attachmentsLegend": "Attachments",
  "collaboration.optionDefault": "Default",
  "collaboration.optionOn": "On",
  "collaboration.optionOff": "Off",
  "collaboration.currently": "Currently: {value}",
  "collaboration.valueOn": "on",
  "collaboration.valueOff": "off",

  // The steps rail: one numbered row per step, in the draft's own order
  // (`studio-step-page`).
  "stepsRail.label": "Steps",
  "stepsRail.issueMark": "open issues",
  "stepsRail.issueMarkOne": "open issue",
  "stepsRail.dragHandle": "Reorder {step label}. Alt+Up or Alt+Down moves it.",
  "stepsRail.movedAnnouncement": "{step label} moved to position {position}",
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
  // The visually hidden word beside a done section's check mark, and its
  // tooltip.
  "stepPage.sectionDone": "Done",
  // The mark a section header carries while the step still needs it.
  "stepPage.sectionTodo": "To do",
  "stepPage.developerView": "Developer view",
  "stepPage.developerViewNote":
    "The JSON is read-only here. The JSON surface stays the one place for hand-authoring a definition.",

  // The role word a form card's kicker reads, picked by `draft/roleStamp.ts`,
  // and the step page's mark on the initial step. The canvas stamps read
  // `canvas.startStamp` and `canvas.endStamp*` instead: "End: {outcome}" has
  // no `stepRole` peer.
  "stepRole.initial": "Initial",
  "stepRole.task": "Task",
  "stepRole.subprocess": "Subprocess",
  "stepRole.end": "End",

  // The phrase a control choosing a step's kind prints
  // (`studio-guided-vocabulary`). Keyed by `draft/performedBy.ts`'s own three
  // values, so the closed key union stays exhaustive against the model the
  // sections read. A canvas node's accessible name reads the same phrase. A
  // form card's kicker and the step page's initial mark keep the short
  // `stepRole.*` word instead: a phrase does not fit there. The canvas stamps
  // read `canvas.startStamp` and `canvas.endStamp*`.
  "stepKind.legend": "What this step is",
  "stepKind.participant": "A step someone works",
  "stepKind.subprocess": "A call to another process",
  "stepKind.terminal": "An end",
  "kindSwitch.heading": "Switch to “{kind}”?",
  "kindSwitch.subprocessTerm": "The call to another process",
  "kindSwitch.pathsTerm": "Ways out",
  "kindSwitch.timersTerm": "Time limits",
  "kindSwitch.onExitTerm": "What happens when left",
  "kindSwitch.onCancelTerm": "What happens when cancelled",
  "kindSwitch.cancellableTerm": "Cancellable setting",
  "kindSwitch.outcomeTerm": "How it ended",
  "kindSwitch.noUndo": "The studio has no undo.",
  "kindSwitch.confirm": "Switch and remove",

  // The note under the canvas bar's step-kind menu entries
  // (`studio-guided-vocabulary`), read through `newStepNote`. The bar's menu
  // renders its two entries, subprocess and terminal. `participant` stays:
  // `newStepNote` maps every kind of `guided-labels.ts`'s own closed union,
  // not only the ones the menu draws.
  "stepKindNote.participant": "Someone fills its form and picks a way out.",
  "stepKindNote.subprocess": "Waits for it and routes on how it ended.",
  "stepKindNote.terminal": "Closes the case and names how it ended.",

  // The four assignment strategies the engine registers: `static` in
  // `src/engine/registry.ts`'s createStaticAssignmentRegistry, and the three
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
  "headerBar.nameLabel": "Process name",
  "headerBar.unsaved": "Unsaved changes",
  "headerBar.saved": "Saved",
  "headerBar.findingPrefix": "Stale reference in",
  "headerBar.findingCarriedBy": "carried by",
  "headerBar.findingLiveElsewhere": "live instance(s) elsewhere",
  "headerBar.findingCarriedByNone": "not carried by any live version",
  "headerBar.menuTrigger": "More actions",
  "headerBar.menuGroupViews": "Views",
  "headerBar.jsonOpen": "Open the JSON surface",
  "headerBar.jsonLeave": "Leave the JSON surface",
  "headerBar.versions": "Versions",
  "headerBar.player": "Player",
  // The back control and its accessible name, which holds the visible word.
  "headerBar.back": "← Processes",
  "headerBar.backLabel": "Back to processes",
  // The state line's parts (`studio-canvas`). `{time}` is the save's clock
  // time. `{version}` is the mono version label, such as `v2`.
  "headerBar.savedAt": "Saved at {time}",
  "headerBar.versionPublished": "{version} published",
  "headerBar.test": "Test",
  "headerBar.menuGroupDraft": "Draft",
  // Beside the state while the content locale differs from the base language
  // (`studio-app`). `{language}` is the language's English name.
  "headerBar.editingNote": "Editing {language}",

  // The Player screen. Its own strings are still mostly inline English; this
  // one is a catalog key because it is an accessible name.
  "player.formTabsLabel": "Form tabs",
  "player.formTabOpenedOne": "Opened the {tab} tab. 1 field still needs an entry.",
  "player.formTabOpenedMany": "Opened the {tab} tab. {count} fields still need an entry.",

  "checksRail.heading": "Checks",
  // The validation verdict alone. The rail runs checks; it holds no
  // permission, so it says nothing here about who may publish.
  "checksRail.allClear": "No open issues.",
  "checksRail.noStepYet": "No step yet. Add the first step on the Map tab or the Steps tab.",
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
  "checksRail.fix": "Fix",
  "checksRail.developerView": "Developer view",
  "checksRail.heldBackKinds": "Not run yet:",
  "checksRail.heldBackLine": "More checks run once you fix the rows above. Publishing also checks a few things this list cannot, and tells you if one fails.",
  "checksRail.publishLine": "Publishing also checks a few things this list cannot, and tells you if one fails.",
  "checksRail.subject.steps": "Steps",
  "checksRail.subject.fields": "Fields",
  "checksRail.subject.publishing": "Before publishing",

  // A row's severity word (`draft/checksRail.ts`, the same rule as the count).
  "checks.severity.blocker": "Must fix",
  "checks.severity.advisory": "Worth a look",

  // One sentence per check (`draft/checkSentence.ts`). Each says what to do next.
  "checks.process.firstStep": "No step is set as the first one. On the Steps tab, open a step and choose “Set as the process's first step”.",
  "checks.process.description": "The process description has no text in the base language. Correct it in the JSON surface.",
  "checks.process.key": "The process needs an internal name. On Settings, set it in the Developer view.",
  "checks.process.baseLocale": "The process has no base language. On Settings, type one.",
  "checks.process.duplicateId": "Two parts of this process share one internal id. Correct it in the JSON surface.",
  "checks.process.badId": "An internal id in this process has the wrong form. Correct it in the JSON surface.",
  "checks.process.duplicateFieldKey": "Two fields share one internal name. On the Fields tab, change one in its Developer view.",
  "checks.process.duplicateSourceKey": "Two places values come from share one name. On the Fields tab, under Where values come from, rename one.",
  "checks.process.cancelSink": "The step kept for cancelled cases was changed by hand. Remove it in the JSON surface, and publishing adds it back.",
  "checks.process.unknownEntry": "The definition holds an entry the studio does not know. Remove it in the JSON surface.",
  "checks.step.name": "“{step}” needs a name. Type it in the Name box at the top of its page.",
  "checks.step.description": "The description of “{step}” has no text in the base language. Type it at the top of its page.",
  "checks.step.key": "The internal name of “{step}” cannot be used. Under {section}, change it in the Developer view.",
  "checks.step.kind": "“{step}” has no kind. Choose one at the top of its page.",
  "checks.step.noWayOut": "“{step}” has no way out yet. Under {section}, add one, or make this step an end.",
  "checks.step.endHasWayOut": "“{step}” is an end but still has ways out. Choose another kind at the top of its page.",
  "checks.step.outcomeNotEnd": "“{step}” says how the case ends but is not an end. Make it an end at the top of its page.",
  "checks.step.noProcess": "“{step}” calls no process yet. Under {section}, choose one.",
  "checks.step.strayCall": "“{step}” holds a call to another process but is another kind of step. Choose its kind at the top of its page.",
  "checks.step.callNeedsAutomatic": "“{step}” waits for another process, so each way out must happen by itself. Under {section}, change the ones a person chooses.",
  "checks.step.reservedKey": "“{step}” uses an internal name kept for cancelled cases. Under {section}, change it in the Developer view.",
  "checks.step.reservedId": "“{step}” uses an internal id kept for cancelled cases. Correct it in the JSON surface.",
  "checks.paths.mixed": "The ways out of “{step}” mix a person's choice with ones that happen by themselves. Under {section}, make them all one kind.",
  "checks.paths.noOrder": "The ways out of “{step}” that happen by themselves need an order. Under {section}, give each a number.",
  "checks.paths.sameOrder": "Two ways out of “{step}” share one place in the order. Under {section}, give each its own number.",
  "checks.paths.twoDefaults": "More than one way out of “{step}” has no “Only if”. Under {section}, give all but one a condition.",
  "checks.paths.defaultNotLast": "The way out of “{step}” with no “Only if” must be tried last. Under {section}, give it the highest number.",
  "checks.way.name": "A way out of “{step}” has no name. Under {section}, type one.",
  "checks.way.key": "The way out “{way}” of “{step}” has no internal name. Under {section}, type one in its Developer view.",
  "checks.way.noTarget": "The way out “{way}” of “{step}” leads nowhere yet. Under {section}, choose a step.",
  "checks.way.targetGone": "The way out “{way}” of “{step}” leads to a step that was removed. Under {section}, choose another.",
  "checks.way.trigger": "The way out “{way}” of “{step}” does not say how it is taken. Under {section}, choose one.",
  "checks.way.guard": "The “Only if” on the way out “{way}” of “{step}” cannot be read. Under {section}, correct it.",
  "checks.timer.durationOrDeadline": "A time limit on “{step}” needs a length or a date, and only one. Under {section}, choose one.",
  "checks.timer.duration": "The length of a time limit on “{step}” cannot be read. Under {section}, remove it and add a new one.",
  "checks.timer.tooLong": "A time limit on “{step}” is too long. Under {section}, shorten it.",
  "checks.timer.deadline": "The date of a time limit on “{step}” cannot be read. Under {section}, correct it.",
  "checks.timer.wayGone": "A time limit on “{step}” takes a way out that was removed. Under {section}, choose another.",
  "checks.timer.general": "A time limit on “{step}” is not complete. Under {section}, finish it.",
  "checks.action.unknownType": "An action on “{step}” uses a type this server does not offer. Under {section}, choose another.",
  "checks.action.reservedType": "An action on “{step}” uses a type the studio keeps for itself. Under {section}, choose another.",
  "checks.action.config": "An action on “{step}” has settings that do not pass. Under {section}, correct them.",
  "checks.action.duration": "A waiting time on an action of “{step}” cannot be read. Correct it in the JSON surface.",
  "checks.action.sameOutput": "Two actions around “{step}” write the same field. Under {section}, change one.",
  "checks.action.sameOutputOnWay": "Two actions on the way out “{way}” of “{step}” write the same field. Check that way out, this step's When left list and the next step's When entered list.",
  "checks.action.fieldGone": "An action on “{step}” writes to a field that was removed. Under {section}, choose another.",
  "checks.action.output": "A value an action on “{step}” writes cannot be read. Under {section}, correct it.",
  "checks.action.mapping": "A value an action on “{step}” passes on cannot be read. Under {section}, correct it.",
  "checks.action.chainField": "An action on “{step}” fills a field the other process does not have. Under {section}, correct it.",
  "checks.action.general": "An action on “{step}” is not complete. Under {section}, finish it.",
  "checks.assignment.unknownType": "“{step}” uses a way to pick people that this server does not offer. Under {section}, choose another.",
  "checks.assignment.config": "The settings for who acts on “{step}” do not pass. Under {section}, correct them.",
  "checks.assignment.group": "“{step}” names a group this process may not use. Correct it in the JSON surface.",
  "checks.assignment.personField": "“{step}” takes its person from a field that holds no person. Under {section}, choose a person field.",
  "checks.assignment.general": "Who acts on “{step}” is not complete. Under {section}, finish it.",
  "checks.call.version": "“{step}” does not say which version of the process it calls. Under {section}, choose one.",
  "checks.call.outputGone": "“{step}” copies a result into a field that was removed. Under {section}, choose another.",
  "checks.call.mapping": "A value “{step}” passes to or takes from the other process cannot be read. Under {section}, correct it.",
  "checks.call.general": "The call on “{step}” is not complete. Under {section}, finish it.",
  "checks.end.noOutcome": "“{step}” does not say how the case ends. Under {section}, choose an ending.",
  "checks.end.noEndings": "The process lists no endings yet. On Settings, add one under What it takes in and gives back.",
  "checks.end.unknownOutcome": "“{step}” ends with “{value}”, which the process does not list. On Settings, add it under How it can end, or choose another under {section}.",
  "checks.end.reservedOutcome": "“{step}” uses an ending kept for cancelled cases. Under {section}, choose another.",
  "checks.form.fieldGone": "The form on “{step}” holds a field that was removed. Under {section}, open the form and take it out.",
  "checks.form.tabs": "A field on the form of “{step}” does not fit its tabs. Under {section}, open the form and move it.",
  "checks.form.tabsDeclared": "A field on the form of “{step}” declares a tab it may not. Correct it in the JSON surface.",
  "checks.form.tabDuplicate": "Two tabs on the form of “{step}” share one internal name. Correct it in the JSON surface.",
  "checks.form.tabName": "A tab on the form of “{step}” has no name. Under {section}, open the form and type one.",
  "checks.form.noteText": "A note on the form of “{step}” has no text. Under {section}, open the form and type it.",
  "checks.form.group": "A field on the form of “{step}” sits in the wrong group. Correct it in the JSON surface.",
  "checks.form.noteGroup": "A note on the form of “{step}” sits in a group this form lacks. Under {section}, open the form and choose another.",
  "checks.form.flag": "A condition on “{field}” on the form of “{step}” cannot be read. Under {section}, open the form and correct it.",
  "checks.form.rule": "A rule on “{field}” on the form of “{step}” cannot be read. Correct it in the JSON surface.",
  "checks.form.validation": "A rule on the form of “{step}” is not complete. Correct it in the JSON surface.",
  "checks.form.pattern": "A pattern on the form of “{step}” cannot be read. Correct it in the JSON surface.",
  "checks.form.technicalFlag": "A technical field on the form of “{step}” cannot be required or read-only. Correct it in the JSON surface.",
  "checks.form.unwritable": "“{field}” is required and read-only on “{step}”, and nothing fills it, so every submission fails. Under {section}, open the form and change it.",
  "checks.form.hiddenRequired": "“{field}” is required on “{step}” but not asked, so nobody can fill it. Under {section}, open the form and change it.",
  "checks.form.general": "The form on “{step}” has an entry that does not fit. Under {section}, open the form and correct it.",
  "checks.field.name": "“{field}” needs a name. Type it under Name on its card.",
  "checks.field.description": "The description of “{field}” has no text in the base language. Type it under Description on its card.",
  "checks.field.choiceName": "A choice of “{field}” has no name. Under Choices, type one.",
  "checks.field.key": "The internal name of “{field}” cannot be used. Under More, change it in the Developer view.",
  "checks.field.kind": "The kind of “{field}” does not fit its settings. Under Kind, choose one again.",
  "checks.field.optionsAndSource": "“{field}” has typed choices and a place its values come from. Correct it in the JSON surface.",
  "checks.field.sourceGone": "“{field}” reads from a place that was removed. Under More, in Where values come from, choose another.",
  "checks.field.pattern": "The pattern on “{field}” cannot be read. Under More, correct it in Validation.",
  "checks.field.rule": "The rule on “{field}” cannot be read. Under More, correct it in Validation.",
  "checks.field.default": "The default value of “{field}” cannot be used. Under More, correct it in Default value.",
  "checks.field.columnSource": "“{field}” maps columns but reads from no source. Under More, in Where values come from, choose one.",
  "checks.field.columnMapping": "The column mapping of “{field}” is not complete. Under More, correct it in Where values come from.",
  "checks.field.columnNotString": "“{field}” maps columns, so it must hold one value. Under Kind, choose a kind that does.",
  "checks.field.columnOnChoices": "“{field}” maps columns but has typed choices. Correct it in the JSON surface.",
  "checks.field.groupFlag": "“{field}” is a group, so it cannot be technical or redactable. Correct it in the JSON surface.",
  "checks.field.technicalUnwritten": "“{field}” is technical, and nothing fills it, so it never holds a value. Fill it from an action, or clear Technical under More.",
  "checks.source.key": "A place values come from has no name. Under Where values come from, type one.",
  "checks.source.reservedName": "“{source}” uses a name the studio keeps for itself. Under Where values come from, choose another.",
  "checks.source.unknownType": "“{source}” uses a kind this server does not offer. Under Where values come from, choose another.",
  "checks.source.config": "The settings of “{source}” do not pass. Under Where values come from, correct them.",
  "checks.contract.fieldGone": "What this process takes in or gives back names a field that was removed. Correct it in the JSON surface.",
  "checks.contract.unusedOutcome": "No end step uses the ending “{value}”. On Settings, take it out, or choose it on an end step.",
  "checks.contract.reservedOutcome": "The ending “{value}” is kept for cancelled cases. On Settings, take it out.",
  "checks.contract.general": "What this process takes in and gives back is not complete. On Settings, finish it.",
  "checks.fallback.section": "Something under {section} on “{step}” does not pass a check. On the Checks tab, this check's Developer view names it.",
  "checks.fallback.step": "Something on “{step}” does not pass a check. On the Checks tab, this check's Developer view names it.",
  "checks.fallback.field": "Something on “{field}” does not pass a check. On the Checks tab, this check's Developer view names it.",
  "checks.fallback.source": "Something on “{source}” does not pass a check. On the Checks tab, this check's Developer view names it.",
  "checks.fallback.process": "Something in this process does not pass a check. On the Checks tab, this check's Developer view names it.",
  "checks.fallback.contract": "Something in what this process takes in or gives back does not pass a check. On the Checks tab, this check's Developer view names it.",
  "checks.publishRefused": "Publishing stopped. Fix these, then publish again:",
  "checks.publishRefusedCrossProcess":
    "Publishing stopped: this process depends on another process in a way the server refused. The Developer view below names both.",
  "checks.publishRefusedFallback": "Something in this process does not pass a check. The Developer view below names it.",

  "jsonView.label": "Draft body (JSON)",
  "jsonView.apply": "Apply",

  // The process has no name in its base locale. One whole sentence.
  "issues.processNeedsName": "The process needs a name. Type it in the name field at the top of the page.",

  // A badge for a check the browser holds back. Each is one whole sentence.
  "issues.registryNotChecked": "Registry config: not checked",
  "issues.chainingNotChecked": "Chaining target: not checked",
  "issues.crossProcessNotChecked": "Cross-process references: not checked",

  "canvas.fitToView": "Fit to view",
  "canvas.arrange": "Arrange",
  "canvas.arrangeConfirm":
    "Arrange every step from the workflow graph? This overwrites every saved position and clears any waypoint a path carries.",
  "canvas.edgeStyleToggle": "Rounded corners",
  "canvas.selectionHeading": "Steps selected",
  "canvas.selectionRemoveOne": "Remove step",
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

  // The marks the canvas draws, filled by `canvas/mapWords.ts`. A stamp
  // names the start or an end, with the outcome's whole name. A way out's
  // sentence takes one whole key per form, so a translator sees each
  // sentence: a guarded path reads "Only if", led by its place among the
  // step's automatic ways out, and the guardless default reads "Otherwise".
  // The connect handle's tooltip says what a drag from it does.
  "canvas.startStamp": "Start",
  "canvas.endStamp": "End",
  "canvas.endStampOutcome": "End: {outcome}",
  "canvas.onlyIf": "Only if {phrase}",
  "canvas.onlyIf.first": "First, only if {phrase}",
  "canvas.onlyIf.second": "Second, only if {phrase}",
  "canvas.onlyIf.third": "Third, only if {phrase}",
  "canvas.onlyIf.fourth": "Fourth, only if {phrase}",
  "canvas.onlyIf.fifth": "Fifth, only if {phrase}",
  "canvas.onlyIf.nth": "Number {n}, only if {phrase}",
  "canvas.otherwise": "Otherwise",
  "canvas.connectHandle": "Drag to a step to add a way out, or to empty space to add a new step.",
  "canvas.connectHandleEnd": "An end has no way out.",

  // The accessible names the canvas composes for its nodes, its paths and
  // its `<svg>` root, filled by `canvas/mapWords.ts`. A node's name reads the
  // step's text, the step page's kind phrase (`stepKind.*`) and its count of
  // ways out; each stamp's word follows after a comma, start before end. A
  // path's name reads its label, both steps, how it is taken and the
  // sentence its line draws, or `canvas.pathNoCondition` where the line draws
  // none. No name carries a key, an enum value, a priority or CEL.
  //
  // The count picks between two node templates, because a fixed plural
  // announces "1 ways out" on every single-path step.
  "canvas.nodeLabel": "{label}, {kind}, {count} ways out",
  "canvas.nodeLabelOneWayOut": "{label}, {kind}, 1 way out",
  "canvas.pathLabel": "{label}, from {source} to {target}, {taken}, {sentence}",
  "canvas.pathTakenManual": "a person chooses",
  "canvas.pathTakenAutomatic": "happens by itself",
  "canvas.pathTakenUnset": "not set yet",
  "canvas.pathNoCondition": "no condition",
  "canvas.groupDisclosure": "Steps in {group}",
  "canvas.svgLabel": "Process graph",

  // The words `draft/changeSet.ts` returns for the change list. `prop.*` names
  // a declared key of the definition contract; a key with no entry reads under
  // its own JSON name. Each `{slot}` fills with `.replace()`.
  "changeList.prop.id": "Id",
  "changeList.prop.key": "Key",
  "changeList.prop.label": "Label",
  "changeList.prop.description": "Description",
  "changeList.prop.baseLocale": "Base locale",
  "changeList.prop.allowedGroups": "Allowed groups",
  "changeList.prop.initialStep": "Initial step",
  "changeList.prop.type": "Type",
  "changeList.prop.terminal": "End",
  "changeList.prop.outcome": "How it ended",
  "changeList.prop.subprocess": "The call to another process",
  "changeList.prop.assignment": "Who acts",
  "changeList.prop.collaboration": "Collaboration",
  "changeList.prop.to": "Leads to",
  "changeList.prop.trigger": "How it is taken",
  "changeList.prop.guard": "Only if",
  "changeList.prop.priority": "Tried",
  "changeList.prop.duration": "Time limit",
  "changeList.prop.deadline": "Deadline",
  "changeList.prop.onFire": "When it runs out",
  "changeList.prop.targetPath": "Way out it takes",
  "changeList.prop.config": "Config",
  "changeList.prop.output": "Output",
  "changeList.prop.execution": "Execution",
  "changeList.prop.retry": "Retry",
  "changeList.prop.timeout": "Timeout",
  "changeList.prop.maxAttempts": "Maximum attempts",
  "changeList.prop.backoff": "Backoff",
  "changeList.prop.baseDelay": "Base delay",
  "changeList.prop.processId": "Process",
  "changeList.prop.versionBinding": "Version binding",
  "changeList.prop.pinnedVersion": "Pinned version",
  "changeList.prop.contractRef": "Contract reference",
  "changeList.prop.inputMapping": "Input mapping",
  "changeList.prop.outputMapping": "Output mapping",
  "changeList.prop.ref": "Field",
  "changeList.prop.visible": "Asked",
  "changeList.prop.required": "Required",
  "changeList.prop.readonly": "Read-only",
  "changeList.prop.group": "Group",
  "changeList.prop.tab": "Tab",
  "changeList.prop.span": "Span",
  "changeList.prop.validation": "Validation",
  "changeList.prop.validationMode": "Validation mode",
  "changeList.prop.kind": "Entry kind",
  "changeList.prop.text": "Text",
  "changeList.prop.columns": "Columns",
  "changeList.prop.inputFields": "Input fields",
  "changeList.prop.outputFields": "Output fields",
  "changeList.prop.outcomes": "Outcomes",
  "changeList.prop.format": "Format",
  "changeList.prop.control": "Control",
  "changeList.prop.dataSource": "Where values come from",
  "changeList.prop.columnMapping": "Column mapping",
  "changeList.prop.default": "Default",
  "changeList.prop.technical": "Technical",
  "changeList.prop.redactable": "Redactable",
  "changeList.prop.value": "Value",
  "changeList.prop.attributes": "Attributes",
  "changeList.prop.min": "Minimum",
  "changeList.prop.max": "Maximum",
  "changeList.prop.minLength": "Minimum length",
  "changeList.prop.maxLength": "Maximum length",
  "changeList.prop.pattern": "Pattern",
  "changeList.prop.rule": "Rule",
  "changeList.prop.cancellable": "Cancellable",
  // Names the walker derives rather than reads off one key.
  "changeList.name.group": "Group",
  "changeList.name.kind": "Kind",
  "changeList.name.from": "From",
  "changeList.name.timer": "Time limit {n}",
  "changeList.name.onEntry": "When entered · {type}",
  "changeList.name.onExit": "When left · {type}",
  "changeList.name.onCancel": "When cancelled · {type}",
  "changeList.name.onPath": "When taken · {type}",
  "changeList.name.onFire": "When it runs out · {type}",
  "changeList.name.option": "Option {value}",
  "changeList.name.note": "Note {n}",
  "changeList.name.tab": "Tab {key}",
  "changeList.name.formEntry": "{field} · {property}",
  "changeList.name.locale": "{property} ({locale})",
  "changeList.name.leaf": "{property} · {leaf}",
  // One order property per list whose members differ only in position.
  "changeList.order.fields": "Field order",
  "changeList.order.dataSources": "Order of where values come from",
  "changeList.order.steps": "Step order",
  "changeList.order.allowedGroups": "Allowed group order",
  "changeList.order.options": "Option order",
  "changeList.order.paths": "Way out order",
  "changeList.order.timers": "Time limit order",
  "changeList.order.onEntry": "When entered order",
  "changeList.order.onExit": "When left order",
  "changeList.order.onCancel": "When cancelled order",
  "changeList.order.onPath": "When taken order",
  "changeList.order.onFire": "When it runs out order",
  "changeList.order.form": "Form order",
  "changeList.order.tabs": "Tab order",
  "changeList.order.inputFields": "Input field order",
  "changeList.order.outputFields": "Output field order",
  "changeList.order.outcomes": "Order of how it can end",
  "changeList.value.none": "none",
  "changeList.value.yes": "yes",
  "changeList.value.no": "no",
  "changeList.value.reordered": "Reordered",
  "changeList.value.addedToForm": "Added to the form",
  "changeList.value.removedFromForm": "Removed from the form",
  // A time limit a number and a unit can state: `{count}` from
  // `timeLimitParts`, `{unit}` one of the `timeLimit.unit*` words.
  "changeList.value.timeLimit": "{count} {unit}",
  // The copy `panels/ChangeList.tsx` draws around those words. The heading
  // line names the comparison and never counts; each caller fills its own
  // version numbers. The Fields, Steps and Forms headings read the `tabs.*` names.
  // On the Versions screen `{after}` is side B's version, `{before}` side A's.
  "changeList.heading.versions": "Version {after} compared with version {before}",
  "changeList.heading.draft": "Draft compared with version {version}",
  "changeList.group.process": "Process",
  // The three groups whose tab the six-tab row no longer holds.
  "changeList.group.dataSources": "Where values come from",
  "changeList.group.paths": "Ways out",
  "changeList.group.contract": "What it takes in and gives back",
  // A capitalized word; the stamp's own style sets it in capitals.
  "changeList.stamp.added": "Added",
  "changeList.stamp.changed": "Changed",
  "changeList.stamp.removed": "Removed",
  "changeList.expandAll": "Expand all",
  "changeList.collapseAll": "Collapse all",
  // A folded row names four properties, then this.
  "changeList.more": "+{count} more",
  // A path row's context line: the step the path leaves.
  "changeList.context.from": "From {step}",
  // Visually hidden before each value of an open row's property.
  "changeList.before": "Before:",
  "changeList.after": "After:",
  "changeList.developerView": "Developer view",

  // The Versions screen's own waiting line, shown where its change list will
  // stand while both compared bodies are in flight (process-version-inspection).
  "versionsScreen.waiting": "Reading both versions…",

  "expression.placeholder": "CEL expression",
  "mapping.unlistedKey": "(not in the list)",
  // The accessible names of a field-map row's select, value input and remove
  // control. `{field}` is the row's target text.
  "mapping.targetLabel": "Field",
  "mapping.valueLabel": "Value for {field}",
  "mapping.removeLabel": "Remove: {field}",
  "plugin.typePlaceholder": "plugin type identifier",
  "plugin.selectType": "-- select type --",
  "plugin.unregisteredType": "(unregistered)",
  "plugin.switchToJson": "Edit as JSON",
  "plugin.switchToForm": "Edit as form",
  "plugin.fieldRequired": "required",
  "plugin.typeCaption": "Type",
  "plugin.configCaption": "Settings (JSON)",
  "plugin.descriptionCaption": "Description",
  // Config field messages. `{n}` is a number, `{values}` a comma-separated list.
  "plugin.minLength": "Enter at least {n} characters.",
  "plugin.maxLength": "Enter at most {n} characters.",
  "plugin.min": "Enter {n} or more.",
  "plugin.max": "Enter {n} or less.",
  "plugin.minItems": "Add at least {n} item(s).",
  "plugin.maxItems": "Keep at most {n} item(s).",
  "plugin.invalidEmail": "Enter a valid email address.",
  "plugin.allowedValues": "Choose from: {values}",
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
  "migrationForm.unmappableCaption": "Policy",
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

  // The Access surface: a process's Developer, Owner and Reader lists
  // (`studio-app`'s Access-surface requirement).
  "access.loading": "Loading…",
  "access.developerLabel": "Developer",
  "access.ownerLabel": "Owner",
  "access.readerLabel": "Reader",
  "access.developerEmpty": "No developers listed yet.",
  "access.ownerEmpty": "No owners listed yet.",
  "access.readerEmpty": "No readers listed yet.",
  "access.addPlaceholder": "user_xxx or group_xxx",
  "access.add": "Add",
  "access.remove": "Remove",

  "processList.newProcess": "+ New process",
  "processList.import": "Import a promoted version",
  "processList.headProcess": "Process",
  "processList.headDraft": "Draft",
  "processList.headPublished": "Published",
  "processList.headCommands": "Actions",
  "processList.tableLabel": "Processes",
  "processList.untitled": "Untitled process",
  "processList.savedBy": "Saved by {name}, {when}",
  "processList.savedAnonymous": "Saved {when}",
  "processList.noDraft": "No draft",
  "processList.notPublished": "Not published yet",
  "processList.justNow": "just now",
  "processList.developerView": "Developer view",
  "processList.devKey": "Key",
  "processList.devProcessId": "Process id",
  "processList.devRevision": "Draft revision",
  "processList.devHash": "Published hash",
  "processList.devSavedBy": "Saved by account",
  "processList.createDraft": "Create draft",
  "processList.versions": "Versions",
  "processList.discard": "Discard draft",
  "processList.discardConfirm": "Discard the draft of “{name}”? You lose its unpublished edits.",
  "processList.loading": "Loading…",
  "processList.empty": "No processes yet.",

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

  // The field card (`studio-field-card`): its section headings, the choice
  // rows and the Asked on and Read by commands.
  "fieldCard.nameLabel": "Name",
  "fieldCard.kindHeading": "Kind",
  "fieldCard.choicesHeading": "Choices",
  "fieldCard.askedOnHeading": "Asked on",
  "fieldCard.moreHeading": "More",
  "fieldCard.choiceNamePlaceholder": "Name of the choice",
  "fieldCard.addChoice": "+ Add a choice",
  "fieldCard.removeChoice": "Remove",
  "fieldCard.choiceValueLabel": "Stored value",
  "fieldCard.choiceValueFollows": "The value follows the name until the first publish.",
  "fieldCard.choiceValuePublished": "This field is in a published version. The name no longer sets its values.",
  "fieldCard.choicesFromSource": "The choices come from {source}.",
  "fieldCard.choicesFromSourceNote": "Pick another source under More.",
  "fieldCard.choicesEmpty": "No choice yet, so a participant types freely. Add one to offer a list instead.",
  "fieldCard.hiddenMark": "Not asked",
  "fieldCard.unnamedChoice": "(unnamed choice)",
  "fieldCard.openForm": "Open the form",
  "fieldCard.openPlace": "Open",
  "fieldCard.requiredEverywhere": "Required on every step that asks for it",
  "fieldCard.noSourceOption": "Nowhere: this field lists its own choices",
  "fieldCard.technicalLabel": "Technical: the process fills this in by itself",
  "fieldCard.kindNoteWithChoices": "One pick from the choices below.",
  "fieldMatrix.markCondition": "Condition",
  "fieldMatrix.rowKindLabel": "Kind",
  "defaultValue.computedNote": "A rule computes this default.",
  "defaultValue.developerView": "Developer view",
  "formsTab.legendGroup": "Group",
} as const;

export type CatalogKey = keyof typeof en;

export const studioCatalog = { en };
