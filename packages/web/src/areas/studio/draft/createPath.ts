import type { Path, PathTrigger } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import type { DraftStep } from "./createStep";
import { mintId } from "./ids";
import { resolveDraftLocalizedText } from "./localized-text";

type DraftPath = DraftOf<Path>;

/** A slug: lower-cased, with every run of non-alphanumeric characters
 * collapsed to a single hyphen, and leading/trailing hyphens stripped. Can
 * come out empty for a string with no alphanumeric characters at all
 * (`"!!!"`). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One side's display text for the derived default: the step's own label
 * when non-empty after trimming, else its key when non-empty after
 * trimming, else the caller-resolved "unnamed step" placeholder.
 * `resolveDraftLocalizedText` reads the label at the studio's current
 * content locale, since `Step.label` is a multi-locale map and
 * `newPath()`'s derived `Path.label` is a single plain string. */
function sideText(step: DraftStep | undefined, contentLocale: string, baseLocale: string, unnamedStepPlaceholder: string): string {
  const label = resolveDraftLocalizedText(step?.label, contentLocale, baseLocale)?.trim();
  if (label) return label;
  const key = step?.key?.trim();
  if (key) return key;
  return unnamedStepPlaceholder;
}

/** The default `key`/`label` pair a newly created path gets, derived once
 * from its source and target steps (design.md). Exported for its own test
 * coverage, independent of `newPath()`'s id-minting and shape. */
export function derivePathDefaults(
  source: DraftStep | undefined,
  target: DraftStep | undefined,
  contentLocale: string,
  baseLocale: string,
  unnamedStepPlaceholder: string,
): { key: string; label: string } {
  const sourceText = sideText(source, contentLocale, baseLocale, unnamedStepPlaceholder);
  const targetText = sideText(target, contentLocale, baseLocale, unnamedStepPlaceholder);
  const label = `${sourceText} → ${targetText}`;

  const placeholderSlug = slugify(unnamedStepPlaceholder);
  const sourceSlug = slugify(sourceText) || placeholderSlug;
  const targetSlug = slugify(targetText) || placeholderSlug;
  const key = `${sourceSlug}-${targetSlug}`;

  return { key, label };
}

/** One path-creation shape, called by `PathsPanel`'s own "add path" action
 * and by both canvas drag-to-connect branches (an existing target, and the
 * new drop-on-empty-canvas gesture), and by `insertOnPath.ts`'s
 * step-dropped-on-a-path gesture, so none can drift in which fields it
 * sets. `to` stays a separate param from `target`: a dangling path (the
 * `insertOnPath.ts` case) keeps its original target id even when that id no
 * longer resolves to a `DraftStep`. */
export function newPath(
  source: DraftStep | undefined,
  target: DraftStep | undefined,
  to: string | undefined,
  trigger: PathTrigger,
  contentLocale: string,
  baseLocale: string,
  unnamedStepPlaceholder: string,
): DraftPath {
  const { key, label } = derivePathDefaults(source, target, contentLocale, baseLocale, unnamedStepPlaceholder);
  return { id: mintId("path"), key, label, to: to as DraftPath["to"], trigger };
}

/** The trigger a new path out of `source` takes, so the step stays valid the
 * moment the path exists (`studio-canvas`). A subprocess step's paths are all
 * automatic. Any other step's paths share one trigger, so a new path follows
 * the first; a step with no path starts manual. `PathsPanel`'s "add path" and
 * the canvas's connect drag both call this. */
export function triggerForNewPath(source: DraftStep): PathTrigger {
  if (source.type === "subprocess") return "automatic";
  return source.paths?.[0]?.trigger ?? "manual";
}

/** `path` with its trigger switched. `priority` is the one key the invariants
 * tie to automatic paths, so a switch to manual drops it. The guard stays for
 * either trigger: a manual path's guard decides whether the participant gets
 * the button. */
export function pathWithTrigger(path: DraftPath, trigger: PathTrigger): DraftPath {
  const next: DraftPath = { ...path, trigger };
  if (trigger === "manual") delete next.priority;
  return next;
}
