export type LocaleCode = "en";

export const SUPPORTED_LOCALES: readonly LocaleCode[] = ["en"];

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
  "app.title": "Workflow Editor",
  "app.draftIncomplete":
    "Draft is not yet structurally valid — CEL, registry, duration, and cross-process checks are held back until it is (see the Zod issues below).",
  "app.processLegend": "Process",
  "app.graphHeading": "Graph",

  "graph.initialSuffix": " (initial)",
  "graph.terminalSuffix": " (terminal)",

  "fileToolbar.legend": "File",
  "fileToolbar.save": "Save draft",
  "fileToolbar.load": "Load draft",
  "fileToolbar.export": "Export process JSON",
  "fileToolbar.exportDisabledHint": "resolve all validation issues before exporting",
  "fileToolbar.operationFailed": "operation failed",
  "fileToolbar.draftFileDescription": "Draft JSON",
  "fileToolbar.exportFileDescription": "Process JSON",

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

  "issues.notChecked": "not checked",

  "expression.placeholder": "CEL expression",
  "plugin.typePlaceholder": "plugin type identifier",
} as const;

export type TranslationKey = keyof typeof en;

const catalogs: Record<LocaleCode, Partial<Record<TranslationKey, string>>> = { en };

/**
 * Fallback-to-base-locale rule: a key missing from a non-base catalog renders the `en` entry.
 * `fromCatalogs` defaults to the real catalog map (kept `Record<LocaleCode, ...>` so adding a
 * `LocaleCode` without a matching catalog entry is a compile error, not a silent runtime
 * fallback); tests pass a broader synthetic map to exercise the fallback branch, since this
 * change ships only `en` (design.md "Single-locale scope") and the real map has no non-base
 * catalog to be missing a key from yet.
 */
export function resolveTranslation(
  locale: LocaleCode,
  key: TranslationKey,
  fromCatalogs: Record<string, Partial<Record<TranslationKey, string>>> = catalogs,
): string {
  return fromCatalogs[locale]?.[key] ?? en[key];
}

export function resolveInitialLocale(
  stored: string | null | undefined,
  supported: readonly LocaleCode[] = SUPPORTED_LOCALES,
): LocaleCode {
  return stored != null && (supported as readonly string[]).includes(stored) ? (stored as LocaleCode) : "en";
}
