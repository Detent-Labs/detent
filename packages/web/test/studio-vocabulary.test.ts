import { describe, expect, it } from "bun:test";
import { t, type CatalogKey } from "../src/areas/studio/catalog";

/**
 * `studio-guided-vocabulary`: the studio catalog reads the vocabulary table's
 * words at the keys the step page, the way-out rows, the timers, the actions,
 * the form editor, the step page's Ways out section and the change list read.
 */

type Row = readonly [CatalogKey, string];

function expectRows(rows: readonly Row[]): void {
  for (const [key, word] of rows) {
    expect(`${key}: ${t(key)}`).toBe(`${key}: ${word}`);
  }
}

describe("step page vocabulary", () => {
  it("names the sections and the masthead fields in words", () => {
    expectRows([
      ["stepSections.paths", "Ways out"],
      ["stepSections.assignment", "Who acts"],
      ["stepSections.lifecycle", "When entered or left"],
      ["stepSections.lifecycleEntryOnly", "When entered"],
      ["stepSections.more", "More"],
      ["stepSections.form", "Form"],
      ["stepSections.labelField", "Name"],
      ["stepSections.keyField", "Key"],
      ["stepSections.idField", "Id"],
      ["stepSections.descriptionField", "Description"],
      ["stepSections.cancellableField", "Cancelling the case here"],
      ["stepSections.outcomeField", "How it ended"],
      ["stepSections.outcomePlaceholder", "choose how it ended…"],
      ["stepSections.outcomeHint", "The name counts only when another process calls this one."],
      ["stepSections.terminalNoPathsOrTimers", "A step that ends the process has no way out and no time limit."],
      ["stepSections.pathsEmptyTerminal", "A step that ends the process has no way out."],
      ["stepSections.noSelection", "Select a step or a way out to edit it."],
      ["steps.onEntryLegend", "What happens when entered"],
      ["steps.onExitLegend", "What happens when left"],
      ["steps.onCancelLegend", "What happens when cancelled"],
      ["stepKindNote.participant", "Someone fills its form and picks a way out."],
      ["stepKindNote.subprocess", "Waits for it and routes on how it ended."],
      ["stepKindNote.terminal", "Closes the case and names how it ended."],
      ["kindSwitch.subprocessTerm", "The call to another process"],
      ["kindSwitch.pathsTerm", "Ways out"],
      ["kindSwitch.onExitTerm", "What happens when left"],
      ["kindSwitch.onCancelTerm", "What happens when cancelled"],
      ["kindSwitch.outcomeTerm", "How it ended"],
      ["subprocess.legend", "The call to another process"],
    ]);
  });

  it("starts the no-assignment warning with who is missing", () => {
    expect(t("stepSections.noAssignmentWarning").startsWith("Nobody is set to act on this step. ")).toBe(true);
  });

  it("states the Developer view note with the JSON as the read-only part", () => {
    expect(t("stepPage.developerViewNote").startsWith("The JSON is read-only here. ")).toBe(true);
  });
});

describe("way-out vocabulary", () => {
  it("names the row captions, hints and heading pieces", () => {
    expectRows([
      ["paths.empty", "No way out yet."],
      ["paths.addPath", "+ Add a way out"],
      ["paths.newPathTargetLabel", "Where the new way out leads"],
      ["paths.removePath", "Remove this way out"],
      ["paths.selectTargetStep", "(choose a step)"],
      ["paths.triggeredByLabel", "How it is taken"],
      ["paths.triggeredByManual", "A person chooses"],
      ["paths.triggeredByAutomatic", "Happens by itself"],
      ["paths.manualGuardNote", "The person sees this way out's button only while the condition holds."],
      ["paths.manualGuardHint", "Leave it empty to always offer this way out."],
      ["paths.automaticGuardHint", "Leave it empty on the one way out taken when nothing else matches."],
      ["paths.labelCaption", "Name"],
      ["paths.keyCaption", "Key"],
      ["paths.toCaption", "Leads to"],
      ["paths.priorityCaption", "Tried in this order, lowest first"],
      ["paths.onPathLegend", "What happens when it is taken"],
      ["paths.rowHeading", "{path} → {step}"],
      ["paths.unnamedPath", "(unnamed way out)"],
      ["paths.noTargetYet", "(no step yet)"],
      ["paths.developerView", "Developer view"],
    ]);
  });
});

describe("time limit and action vocabulary", () => {
  it("names the timers and actions captions and legends", () => {
    expectRows([
      ["timers.empty", "No time limit."],
      ["timers.addTimer", "+ Add a time limit"],
      ["timers.removeTimer", "Remove this time limit"],
      ["timers.durationOption", "After a set time"],
      ["timers.deadlineOption", "At a moment written as CEL"],
      ["timers.reminderOption", "(a reminder: the case stays put)"],
      ["timers.kindCaption", "When it runs out"],
      ["timers.targetPathCaption", "The way out it takes when it runs out, skipping that way out's condition"],
      ["timers.onFireActionsLegend", "What happens when it runs out"],
      ["actions.empty", "Nothing happens yet."],
      ["actions.addAction", "+ Add an action"],
      ["actions.removeAction", "Remove this action"],
      ["actions.pluginLabel", "Action"],
      ["actions.outputMappingLabel", "Values it writes back"],
      ["actions.addOutputMapping", "+ Add a value it writes back"],
      ["actions.removeOutputMapping", "Remove"],
    ]);
  });

  it("keeps the raw inputs the deadline and the output value stay on purpose", () => {
    expectRows([
      ["timers.deadlineCaption", "Deadline (CEL)"],
      ["actions.typePlaceholder", "action type (e.g. http.call)"],
      ["actions.resultCelPlaceholder", "result CEL"],
    ]);
  });
});

describe("flag vocabulary", () => {
  it("names the form editor strip and marks in words", () => {
    expectRows([
      ["formEditor.nameLabel", "Name"],
      ["formEditor.visible", "Asked"],
      ["formEditor.required", "Required"],
      ["formEditor.readonly", "Read-only"],
      ["formEditor.markRequired", "Required"],
      ["formEditor.markReadonly", "Read-only"],
      ["formEditor.markCondition", "Condition"],
      ["formEditor.span", "Width"],
      ["formEditor.spanOne", "One column"],
      ["formEditor.spanBoth", "Both columns"],
      ["formEditor.group", "Group"],
      ["formEditor.tab", "Tab"],
      ["formEditor.noteText", "Text"],
      ["formsTab.legendField", "Field"],
      ["formsTab.legendConditional", "Required if a condition holds"],
      ["formsTab.legendSection", "Section"],
      ["formsTab.legendHeight", "Taller asks for more"],
      ["fieldMatrix.legendFlagged", "A marked cell stands in Checks."],
      ["fieldCatalog.dataSourceLabel", "Values come from"],
    ]);
  });

  it("names the field card's marks and the matrix's words", () => {
    expectRows([
      ["formsTab.legendGroup", "Group"],
      ["fieldMatrix.markCondition", "Condition"],
      ["fieldMatrix.rowKindLabel", "Kind"],
      ["fieldMatrix.hideInertToggle", "Hide steps with no form"],
      ["fieldMatrix.columnInertNote", "No form"],
      ["fieldCard.hiddenMark", "Not asked"],
      ["fieldCard.openForm", "Open the form"],
      ["fieldCard.openPlace", "Open"],
      ["fieldCard.requiredEverywhere", "Required on every step that asks for it"],
      ["ruleBuilder.empty", "No rule yet: every answer passes."],
    ]);
  });

  it("gives each view flag one name on the strip, the Forms tab and the Fields tab", () => {
    expect(t("formEditor.required")).toBe("Required");
    expect(t("formsTab.legendRequired")).toBe(t("formEditor.required"));
    expect(t("fieldCatalog.requiredLabel")).toBe(t("formEditor.required"));
    expect(t("formEditor.readonly")).toBe("Read-only");
    expect(t("formEditor.visible")).toBe("Asked");
  });
});

describe("Change list vocabulary", () => {
  it("names the change list's properties in the way-out words", () => {
    expectRows([
      ["changeList.prop.assignment", "Who acts"],
      ["changeList.prop.to", "Leads to"],
      ["changeList.prop.trigger", "How it is taken"],
      ["changeList.prop.guard", "Only if"],
      ["changeList.prop.priority", "Tried"],
      ["changeList.prop.duration", "Time limit"],
      ["changeList.prop.onFire", "When it runs out"],
      ["changeList.prop.targetPath", "Way out it takes"],
      ["changeList.prop.outcome", "How it ended"],
      ["changeList.prop.subprocess", "The call to another process"],
      ["changeList.prop.visible", "Asked"],
      ["changeList.prop.dataSource", "Where values come from"],
    ]);
  });

  it("names the change list's entry rows and order rows in the same words", () => {
    expectRows([
      ["changeList.name.timer", "Time limit {n}"],
      ["changeList.name.onEntry", "When entered · {type}"],
      ["changeList.name.onExit", "When left · {type}"],
      ["changeList.name.onCancel", "When cancelled · {type}"],
      ["changeList.name.onPath", "When taken · {type}"],
      ["changeList.name.onFire", "When it runs out · {type}"],
      ["changeList.order.paths", "Way out order"],
      ["changeList.order.timers", "Time limit order"],
      ["changeList.order.onEntry", "When entered order"],
      ["changeList.order.onExit", "When left order"],
      ["changeList.order.onCancel", "When cancelled order"],
      ["changeList.order.onPath", "When taken order"],
      ["changeList.order.onFire", "When it runs out order"],
      ["changeList.order.dataSources", "Order of where values come from"],
      ["changeList.order.outcomes", "Order of how it can end"],
    ]);
  });
});

describe("data source and contract vocabulary", () => {
  it("names the sources' view, name, kind legend and kinds in the author's words", () => {
    expectRows([
      ["fieldsViews.sources", "Where values come from"],
      ["dataSources.nameCaption", "Name"],
      ["dataSources.kindLegend", "What kind of source"],
      ["dataSourceKind.db.list", "A data list an operator keeps"],
      ["dataSourceKind.instance.query", "Cases of another process"],
      ["panelsScreen.unnamedDataSource", "(unnamed source)"],
    ]);
  });

  it("words the contract view as what the process takes in and gives back", () => {
    expectRows([
      ["settings.contract", "What it takes in and gives back"],
      ["contract.callableCheckbox", "Other processes can call this one"],
      ["contract.inputFieldsLegend", "What it takes in"],
      ["contract.outputFieldsLegend", "What it gives back"],
      ["contract.outcomesLegend", "How it can end"],
      ["contract.newOutcomePlaceholder", "Name of an ending"],
      ["contract.addOutcome", "+ Add an ending"],
      ["contract.removeOutcome", "Remove"],
    ]);
  });
});
