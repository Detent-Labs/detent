import type { Draft } from "./types";
import { flattenDraftFields, type DraftField } from "./fields";

type Step = NonNullable<NonNullable<Draft["workflow"]>["steps"]>[number];
/** The envelope a step's `assignment.strategy` holds. */
type DraftStrategy = NonNullable<NonNullable<Step["assignment"]>["strategy"]>;

const GROUP_TYPE = "org.group-members";
const PERSON_TYPE = "org.actor-from-field";

const stepOf = (d: Draft, stepId: string): Step | undefined => d.workflow?.steps?.find((s) => s.id === stepId);

/** The group id a strategy names, or undefined when it is not a group strategy with a string id. */
function groupIdOf(strategy: DraftStrategy | undefined): string | undefined {
  if (strategy?.type !== GROUP_TYPE) return undefined;
  const id = (strategy.config as Record<string, unknown> | undefined)?.groupId;
  return typeof id === "string" && id !== "" ? id : undefined;
}

/** A bare person field declares `format: "person"` with neither `options` nor `dataSource`. */
function isBarePersonField(f: DraftField): boolean {
  return f.format === "person" && f.options === undefined && f.dataSource === undefined;
}

/** Whether `allowedGroups` is still read by a bare person field anywhere in the field tree. */
export function hasBarePersonField(d: Draft): boolean {
  return flattenDraftFields(d.fields).some(isBarePersonField);
}

/** Removes `groupId` from `allowedGroups` when no other step names it and no bare person field exists. An emptied list deletes the key. */
function dropUnreadGroup(d: Draft, stepId: string, groupId: string): void {
  if (!d.allowedGroups) return;
  const namedElsewhere = (d.workflow?.steps ?? []).some((s) => s.id !== stepId && groupIdOf(s.assignment?.strategy) === groupId);
  if (namedElsewhere || hasBarePersonField(d)) return;
  const next = d.allowedGroups.filter((g) => g !== groupId);
  if (next.length === d.allowedGroups.length) return;
  if (next.length === 0) delete d.allowedGroups;
  else d.allowedGroups = next;
}

function addGroup(d: Draft, groupId: string): void {
  if (d.allowedGroups?.includes(groupId)) return;
  d.allowedGroups = [...(d.allowedGroups ?? []), groupId];
}

/** Drops the step's old group (if any), runs `write`, then adds the group the step ends up naming. */
function replaceStrategy(d: Draft, stepId: string, write: (s: Step) => DraftStrategy | undefined, skipDropFor?: string): void {
  const step = stepOf(d, stepId);
  if (!step) return;
  const old = groupIdOf(step.assignment?.strategy);
  if (old !== undefined && old !== skipDropFor) {
    dropUnreadGroup(d, stepId, old);
  }
  const next = write(step);
  const added = groupIdOf(next);
  if (added !== undefined) addGroup(d, added);
}

/** Picks a group: writes `groupId` and keeps `allowedGroups`. The drop is skipped when the id is unchanged. */
export function pickGroup(d: Draft, stepId: string, groupId: string): void {
  replaceStrategy(
    d,
    stepId,
    (step) => {
      const strategy: DraftStrategy = { ...step.assignment?.strategy, type: GROUP_TYPE, config: { groupId } };
      step.assignment = { ...step.assignment, strategy };
      return strategy;
    },
    groupId,
  );
}

/** Points the person-field strategy at an existing field. */
export function pickPersonField(d: Draft, stepId: string, fieldId: string): void {
  replaceStrategy(d, stepId, (step) => {
    const strategy: DraftStrategy = { ...step.assignment?.strategy, type: PERSON_TYPE, config: { fieldId } };
    step.assignment = { ...step.assignment, strategy };
    return strategy;
  });
}

/** Adds a field minted outside the recipe to the catalog and points the strategy at it, in one write. */
export function addPersonField(d: Draft, stepId: string, field: DraftField): void {
  d.fields ??= [];
  d.fields.push(structuredClone(field));
  pickPersonField(d, stepId, field.id as string);
}

/** A type change: the old group may leave the list, and a group the new strategy names joins it. */
export function changeStrategy(d: Draft, stepId: string, strategy: DraftStrategy): void {
  replaceStrategy(d, stepId, (step) => {
    step.assignment = { ...step.assignment, strategy };
    return strategy;
  });
}

/** Removes the step's `assignment` key, `description` included. */
export function clearAssignment(d: Draft, stepId: string): void {
  replaceStrategy(d, stepId, (step) => {
    delete step.assignment;
    return undefined;
  });
}

/** How the envelope's next value reaches the draft: a type change runs `changeStrategy`; anything else writes straight to the step. */
export function strategyWriteRoute(prev: DraftStrategy | undefined, next: DraftStrategy): "change" | "direct" {
  return prev?.type === next.type ? "direct" : "change";
}
