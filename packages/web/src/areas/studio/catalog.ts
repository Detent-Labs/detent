/**
 * UI-chrome only (proposal.md scope): headings, buttons, empty-state prose,
 * badges, explanatory hints. Deliberately NOT translated: raw contract
 * vocabulary shown as a bare field label ("key", "label", "type", "guard",
 * "versionBinding", "visible"/"required"/"readonly"/"group", ...) and
 * literal schema enum values ("manual", "automatic", "task", "subprocess",
 * "pinned", "latest-at-spawn") — translating those would decouple the
 * on-screen word from the JSON property/value it names, which defeats the
 * point for a structural JSON editor.
 */
const en = {
  "app.title": "Process Studio",
  "app.draftIncomplete":
    "Draft is not yet structurally valid — CEL, registry, duration, and cross-process checks are held back until it is (see the Zod issues below).",
  "app.processLegend": "Process",

  "draftToolbar.legend": "Draft",
  "draftToolbar.save": "Save",
  "draftToolbar.saving": "Saving…",
  "draftToolbar.discard": "Discard draft",
  "draftToolbar.discardConfirm": "Discard this draft? Unpublished edits will be lost.",
  "draftToolbar.operationFailed": "operation failed",
  "draftToolbar.conflictMessage": "This draft was changed elsewhere.",
  "draftToolbar.conflictReload": "Reload",
  "draftToolbar.unsaved": "Unsaved changes",
  "draftToolbar.saved": "Saved",
  "draftToolbar.publish": "Publish",
  "draftToolbar.publishing": "Publishing…",
  "draftToolbar.publishConfirmSave": "Save your changes and publish?",
  "draftToolbar.publishSuccess": "Published",

  "fieldCatalog.heading": "Field catalog",
  "fieldCatalog.empty": "No fields yet.",
  "fieldCatalog.addField": "+ Add field",
  "fieldCatalog.removeField": "Remove field",
  "fieldCatalog.customTypeOption": "custom (plugin)",
  "fieldCatalog.optionsLegend": "options / dataSource (mutually exclusive)",
  "fieldCatalog.noneOption": "(none)",
  "fieldCatalog.optionValuePlaceholder": "value",
  "fieldCatalog.optionLabelPlaceholder": "label",
  "fieldCatalog.removeOption": "remove",
  "fieldCatalog.addOption": "+ Add option",
  "fieldCatalog.subFieldsLegend": "sub-fields",
  "fieldCatalog.addSubField": "+ Add sub-field",
  "fieldCatalog.customTypeLabel": "custom type",

  "dataSources.heading": "Data sources",
  "dataSources.empty": "No data sources yet.",
  "dataSources.addDataSource": "+ Add data source",
  "dataSources.removeDataSource": "Remove data source",
  "dataSources.pickListKey": "Pick a data list",

  "steps.heading": "Steps",
  "steps.empty": "No steps yet.",
  "steps.addStep": "+ Add step",
  "steps.removeStep": "Remove step",
  "steps.unnamedStep": "(unnamed step)",
  "steps.terminalBadge": "terminal",
  "steps.selectInitialStep": "(select initial step)",
  "steps.crossProcessLegend": "cross-process check (checkSubprocessChildRefs)",
  "steps.crossProcessChecked": "checked against loaded child —",
  "steps.unload": "unload",
  "steps.loadChildError": "failed to load child process JSON",
  "steps.pathsHeading": "Paths",
  "steps.timersHeading": "Timers",
  "steps.assignmentStrategyLabel": "assignment strategy",

  "paths.empty": "No paths.",
  "paths.addPath": "+ Add path",
  "paths.removePath": "Remove path",
  "paths.selectTargetStep": "(select target step)",

  "timers.empty": "No timers.",
  "timers.addTimer": "+ Add timer",
  "timers.removeTimer": "Remove timer",
  "timers.durationOption": "duration (ISO-8601)",
  "timers.deadlineOption": "deadline (CEL)",
  "timers.reminderOption": "(reminder — no transition)",
  "timers.durationPlaceholder": "e.g. PT1H30M",

  "actions.empty": "No actions.",
  "actions.addAction": "+ Add action",
  "actions.removeAction": "Remove action",
  "actions.typePlaceholder": "action type (e.g. http.call)",
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

  "view.legend": "view (per-step field overrides)",
  "view.empty": "No view overrides — every catalog field uses its default presentation.",
  "view.moveUp": "move up",
  "view.moveDown": "move down",
  "view.remove": "Remove",
  "view.addFieldOverride": "+ Add field override",

  "subprocess.legend": "subprocess",
  "subprocess.processIdPlaceholder": "proc_...",
  "subprocess.removeMappingEntry": "remove",
  "subprocess.addInputMapping": "+ Add input mapping",
  "subprocess.addOutputMapping": "+ Add output mapping",

  "contentLocale.legend": "Content locale",
  "contentLocale.invalid": "invalid locale code",
  "contentLocale.addPlaceholder": "add locale (e.g. de)",
  "contentLocale.add": "+ add locale",

  "registry.legend": "Action registry",
  "registry.notLoadedOption": "not loaded",
  "registry.exampleOption": "example registry (http.call, notify.email)",

  "edit.structureTab": "Structure",
  "edit.jsonTab": "JSON",

  "jsonView.label": "Draft body (JSON)",
  "jsonView.apply": "Apply",

  "issues.notChecked": "not checked",

  "canvas.fitToView": "Fit to view",
  "canvas.elseMarker": "else",
  "canvas.inspectorEmpty": "Select a step or a path to edit it.",

  "expression.placeholder": "CEL expression",
  "plugin.typePlaceholder": "plugin type identifier",

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

export type TranslationKey = keyof typeof en;

/** Fixed English catalog lookup — no locale state, no fallback (there is nothing to fall back from). */
export function t(key: TranslationKey): string {
  return en[key];
}
