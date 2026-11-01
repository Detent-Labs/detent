/**
 * A step page section header's one-line summary and its state, and which
 * section the page opens on (`studio-step-page`: "A section header carries a
 * summary and its state", "One section stands open at a time", "The page
 * opens on the section that needs the author"). Pure: the page reads it, and
 * a test reads it without a DOM.
 */

import type { Draft } from "../draft/types.js";
import type { DraftStep } from "../draft/createStep.js";
import type { DraftField } from "../draft/fields.js";
import type { ProcessSummary } from "../api/types.js";
import { performedByFor } from "../draft/performedBy.js";
import { assignmentWord, processLabel } from "../draft/guided-labels.js";
import { t, type CatalogKey } from "../catalog.js";
import { formCounts, formSizeText } from "./formCardRows.js";
import { fill, plainStepTextMap, stepTextMap, wayOutHeading } from "./shared/optionText.js";
import type { SectionName } from "./sectionsFor.js";

/** `done`: the section holds what it asks for. `todo`: it is empty and the
 * step needs it. `optional`: it is empty and the step works without it. */
export type SectionState = "done" | "todo" | "optional";

/** One header's summary. `mono` marks a machine value, which prints in the
 * mono face at the size around it. */
export interface SectionSummary {
  text: string;
  mono: boolean;
  state: SectionState;
}

/** What the summaries read. `steps` is the draft's own step list, in order. */
export interface SummaryInput {
  step: DraftStep;
  draft: Draft;
  fields: DraftField[];
  steps: readonly DraftStep[];
  processes: readonly ProcessSummary[];
  contentLocale: string;
  baseLocale: string;
}

const plain = (text: string, state: SectionState): SectionSummary => ({ text, mono: false, state });

/** The override words More's summary names, one per key the step sets. */
function overrideWords(step: DraftStep): string[] {
  const words: CatalogKey[] = [];
  if (step.cancellable !== undefined) words.push(step.cancellable ? "stepSummary.cancellableYes" : "stepSummary.cancellableNo");
  const comments = step.collaboration?.comments;
  if (comments !== undefined) words.push(comments ? "stepSummary.commentsOn" : "stepSummary.commentsOff");
  const attachments = step.collaboration?.attachments;
  if (attachments !== undefined) words.push(attachments ? "stepSummary.attachmentsOn" : "stepSummary.attachmentsOff");
  return words.map((key) => t(key));
}

/** One section's summary and state, per the table in the change's design
 * (D3). A `{slot}` fills through `fill`'s replacer function, so a `$`
 * pattern in a label prints as written. */
export function sectionSummary(section: SectionName, input: SummaryInput): SectionSummary {
  const { step, draft, fields, steps, processes, contentLocale, baseLocale } = input;
  const performedBy = performedByFor(step.type, step.terminal);
  switch (section) {
    case "assignment": {
      const word = assignmentWord(step.assignment?.strategy);
      const type = step.assignment?.strategy?.type;
      const held = typeof type === "string" && type !== "";
      return { text: word.text, mono: word.mono, state: held ? "done" : performedBy === "participant" ? "todo" : "optional" };
    }
    case "form": {
      const { fieldCount, requiredCount } = formCounts(step, fields);
      const size = formSizeText(fieldCount, requiredCount);
      return plain(size ?? t("formsTab.miniatureEmpty"), fieldCount > 0 ? "done" : "optional");
    }
    case "subprocess": {
      const processId = step.type === "subprocess" ? step.subprocess?.processId : undefined;
      if (processId === undefined || processId === "") return plain(t("stepSummary.processNone"), "todo");
      const called = processes.find((p) => p.processId === processId);
      return called !== undefined
        ? plain(processLabel(called, contentLocale), "done")
        : { text: processId, mono: true, state: "done" };
    }
    case "paths": {
      const paths = step.paths ?? [];
      if (paths.length === 0) return plain(t("stepSummary.pathsNone"), "todo");
      const texts = stepTextMap(steps, contentLocale, baseLocale);
      const plainTexts = plainStepTextMap(steps, contentLocale, baseLocale);
      return plain(paths.map((p) => wayOutHeading(p, texts, plainTexts)).join(", "), "done");
    }
    case "howItEnds": {
      const outcome = step.outcome;
      if (outcome !== undefined && outcome !== "") return { text: outcome, mono: true, state: "done" };
      return plain(t("stepSummary.outcomeNone"), (draft.contract?.outcomes?.length ?? 0) > 0 ? "todo" : "optional");
    }
    case "timers": {
      const count = step.timers?.length ?? 0;
      if (count === 0) return plain(t("stepSummary.timersNone"), "optional");
      if (count === 1) return plain(t("stepSummary.timersOne"), "done");
      return plain(fill(t("stepSummary.timersMany"), { count: String(count) }), "done");
    }
    case "lifecycle": {
      const entered = step.onEntry?.length ?? 0;
      // An end step is never left, and its section draws the entry list alone.
      if (performedBy === "terminal") {
        return entered === 0
          ? plain(t("stepSummary.actionsNone"), "optional")
          : plain(fill(t("stepSummary.actionsEntryOnly"), { entered: String(entered) }), "done");
      }
      const left = (step.onExit?.length ?? 0) + (step.onCancel?.length ?? 0);
      if (entered + left === 0) return plain(t("stepSummary.actionsNone"), "optional");
      return plain(fill(t("stepSummary.actions"), { entered: String(entered), left: String(left) }), "done");
    }
    case "more": {
      const words = overrideWords(step);
      return words.length === 0 ? plain(t("stepSummary.moreDefaults"), "optional") : plain(words.join(", "), "done");
    }
  }
}

/**
 * The section the page opens on. In order: Ways out, where a way out is
 * selected and the sections hold it; the first section whose count of open
 * issues is above zero; the first section still to do; the first section.
 * `undefined` only where no section stands.
 */
export function defaultOpenSection(
  sections: readonly SectionName[],
  counts: ReadonlyMap<SectionName, number>,
  states: ReadonlyMap<SectionName, SectionState>,
  selectedPathId: string | undefined,
): SectionName | undefined {
  if (selectedPathId !== undefined && sections.includes("paths")) return "paths";
  return (
    sections.find((s) => (counts.get(s) ?? 0) > 0) ??
    sections.find((s) => states.get(s) === "todo") ??
    sections[0]
  );
}

/** The open section after a header press: pressing the open header closes
 * it, and any other opens in its place. */
export function nextOpenSection(open: SectionName | undefined, pressed: SectionName): SectionName | undefined {
  return pressed === open ? undefined : pressed;
}
