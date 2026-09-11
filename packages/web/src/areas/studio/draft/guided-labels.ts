import { t } from "../catalog.js";
import type { ProcessSummary } from "../api/types.js";
import type { PerformedBy } from "./performedBy.js";
import type { StepKind } from "./createStep.js";

/**
 * The plain-language layer over the definition contract
 * (`studio-guided-vocabulary`). One function per concept an author meets, so
 * two surfaces cannot word one concept differently.
 *
 * Functions, not records: `t` reads a deployment's stored override on every
 * call, and a record built at module load would freeze the values before the
 * override store answers (`ui-string-overrides`). `field-type-labels.ts`
 * already documents that reason, and this layer inherits it.
 *
 * Display layer only. Nothing here renames anything in the draft model:
 * `performedBy` keeps its name and its three values, and a path's `guard`
 * keeps its own. The contract's word stays reachable in the step's raw JSON.
 */

/**
 * The assignment strategies the engine registers and this layer names.
 * `static` is registered in `src/engine/registry.ts`
 * (`createDefaultAssignmentRegistry`); the three `org.` types are registered
 * in `src/engine/assignment-strategies.ts`. Neither module is on the engine's
 * exports map, so the four types are literals here rather than imports.
 *
 * `CatalogKey` is a closed union, so the template literals below resolve to
 * one key per member. A type added here and missed in the catalog is a
 * compile error.
 */
export type AssignmentStrategyName =
  | "static"
  | "org.manager-of-starter"
  | "org.group-members"
  | "org.actor-from-field";

const CURATED: readonly AssignmentStrategyName[] = [
  "static",
  "org.manager-of-starter",
  "org.group-members",
  "org.actor-from-field",
];

/** The plain name and the short note for one curated strategy. The note says
 * who ends up able to act on the step. */
export function assignmentStrategyLabel(type: AssignmentStrategyName): { name: string; note: string } {
  return { name: t(`assignmentStrategy.${type}.name`), note: t(`assignmentStrategy.${type}.note`) };
}

/** Whether the curated table above names this registry type. */
export function isCuratedAssignmentStrategy(type: string): type is AssignmentStrategyName {
  return (CURATED as readonly string[]).includes(type);
}

/**
 * What a surface prints for a step's assignment.
 *
 * Three answers. A step carrying no assignment gets its own string and never
 * reaches the table: an absent assignment is not a strategy, and the engine
 * resolves none for it. A curated type takes its plain name and its note. A
 * registered type the table misses falls back to the registry type itself,
 * which is a machine value and therefore mono at the call site — the same
 * fallback `fieldKindWord` makes for an unnamed triple.
 */
export function assignmentWord(strategy: { type?: unknown } | undefined): {
  text: string;
  note: string | undefined;
  mono: boolean;
} {
  const type = strategy?.type;
  if (typeof type !== "string" || type === "") return { text: t("assignment.none"), note: undefined, mono: false };
  if (isCuratedAssignmentStrategy(type)) {
    const { name, note } = assignmentStrategyLabel(type);
    return { text: name, note, mono: false };
  }
  return { text: type, note: undefined, mono: true };
}

/**
 * The phrase a control choosing a step's kind prints. Keyed by
 * `performedBy.ts`'s own three values, so the performed-by control and the
 * palette cannot offer different words for one kind.
 *
 * A stamp naming an existing step's kind reads `stepRole.*` instead: a stamp
 * takes a word, not a phrase.
 */
export function stepKindPhrase(kind: PerformedBy): string {
  return t(`stepKind.${kind}`);
}

/** The palette's own creation union, onto the same three phrases. `end` is a
 * `terminal` flag on an ordinary task step, never a `type` of its own. */
export function newStepPhrase(kind: StepKind): string {
  return stepKindPhrase(kind === "end" ? "terminal" : kind === "subprocess" ? "subprocess" : "participant");
}

/** The short note under the canvas bar's phrase, on `newStepPhrase`'s own kind
 * mapping: `end` reads the `terminal` note, since it is a flag on a task
 * step and never a kind of its own. */
export function newStepNote(kind: StepKind): string {
  return t(`stepKindNote.${kind === "end" ? "terminal" : kind === "subprocess" ? "subprocess" : "participant"}`);
}

/** A process's own label, never its `proc_` id. One surface reads it: the
 * subprocess picker. A published body carries a base-locale entry by
 * invariant, so the `key` fallback is for the moment a summary arrives with
 * neither. */
export function processLabel(process: ProcessSummary, contentLocale: string): string {
  return process.label?.[contentLocale] ?? process.label?.[process.baseLocale] ?? process.key;
}
