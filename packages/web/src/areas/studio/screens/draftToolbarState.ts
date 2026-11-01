import { canonicalize } from "workflow-engine/schema/canonical-json";
import { resolveAddLocaleAttempt } from "../draft/localized-text.js";

/**
 * Whether the currently-open draft differs from the last body successfully
 * saved to the server, checked structurally, since neither side carries a
 * cheap identity or hash the client can compare instead. This is the body half
 * of `isDraftDirty`, the gate `DraftToolbar`'s Publish action checks before
 * calling `publishDraft` (studio-app spec: "Publishing with unsaved changes
 * prompts a save first"). Publish always targets the persisted draft
 * (studio-publish spec), so a dirty draft must be saved first.
 */
export function isDirty(current: unknown, savedSnapshot: unknown): boolean {
  return JSON.stringify(current) !== JSON.stringify(savedSnapshot);
}

/**
 * Whether the canvas layout differs from the last saved one. A stored layout
 * comes back in the key order of the database, so this compares the canonical
 * form: `JSON.stringify` would call two equal layouts different.
 *
 * ponytail: compares the layouts as they stand, with no normalizer. Ceiling:
 * an edge-style round trip or a last-waypoint delete reads as unsaved until
 * the next save. Upgrade: a normalizer inside `isLayoutDirty`.
 */
export function isLayoutDirty(layout: Record<string, unknown>, savedLayout: Record<string, unknown>): boolean {
  return canonicalize(layout) !== canonicalize(savedLayout);
}

/**
 * The one definition of an unsaved draft: the body or the layout differs from
 * the last save. The header bar, the leave prompts and the Publish dialog all
 * read it.
 */
export function isDraftDirty(
  body: unknown,
  savedBody: unknown,
  layout: Record<string, unknown>,
  savedLayout: Record<string, unknown>,
): boolean {
  return isDirty(body, savedBody) || isLayoutDirty(layout, savedLayout);
}

/** What the Publish control renders, resolved from the loaded draft's own
 * `canPublish` report and the draft's own worst open issue. */
export interface PublishAvailability {
  available: boolean;
  /** The catalog key of the reason, when the control carries one. An
   * unavailable control always carries one. An available control carries the
   * blocked reason too, so a blocking issue reads before the click rather
   * than only inside the dialog the click opens. */
  reasonKey?:
    | "draftToolbar.publishUnavailable"
    | "draftToolbar.publishNeedsStep"
    | "draftToolbar.publishBlockedReason";
}

/**
 * Whether the studio offers Publish at all (studio-publish spec: "The studio
 * offers Publish only where the engine would admit it"). The argument is the
 * loaded record's `canPublish`, never a role: neither authoring role implies
 * the publish permission, and a scoped grant reaches it without either role,
 * so a role check answers wrong in both directions.
 *
 * `undefined` reads as unavailable. A response that carries no field is a
 * response the engine never blessed, and the safe reading of an absent
 * permission is that it is absent.
 *
 * `blocked` is whether the draft's worst open issue is a blocker. A blocked
 * draft stays publishable, so this reports `available: true` beside the
 * reason. The two reasons never compete for the one span: the early return
 * below answers the permission first, and reaches `blocked` only once the
 * permission holds.
 *
 * `noStepYet` is whether the draft has no step. Such a draft cannot publish,
 * so the control is unavailable with its own reason. The order is fixed:
 * permission, then the missing step, then `blocked`.
 */
export function publishAvailability(
  canPublish: boolean | undefined,
  blocked: boolean,
  noStepYet = false,
): PublishAvailability {
  if (canPublish !== true) return { available: false, reasonKey: "draftToolbar.publishUnavailable" };
  if (noStepYet) return { available: false, reasonKey: "draftToolbar.publishNeedsStep" };
  if (blocked) return { available: true, reasonKey: "draftToolbar.publishBlockedReason" };
  return { available: true };
}

/**
 * The version a publish is expected to mint, predicted from the draft's own
 * base version (design.md: no extra request, and no loading state). A null
 * base means nobody has published this process, so the publish mints v1 — the
 * case a naive `base + 1` renders as `vNaN`.
 *
 * The prediction can be wrong: another environment can promote a version
 * between the load and the publish. That is why the dialog labels the row
 * "Next version" rather than "Version", and why the header bar's state stays
 * the report of the number the engine actually assigned.
 */
export function nextVersionLabel(baseVersion: number | null | undefined): string {
  return `v${typeof baseVersion === "number" ? baseVersion + 1 : 1}`;
}

/** What the header bar's state line prints, as parts the caller turns into
 * catalog sentences. `unsaved` carries no time. `savedAt` carries the formatted
 * clock time of a save in this session. `saved` is a clean draft with no save
 * yet. `version` is present where a published version exists. */
export interface HeaderStateLine {
  state: "unsaved" | "savedAt" | "saved";
  time?: string;
  version?: string;
}

/**
 * The state line's parts (studio-canvas spec: "The header bar's state says
 * what holds for the draft"). A dirty draft is `unsaved`, whatever happened
 * before. A clean one is `savedAt` once `savedTime` exists, else `saved`.
 * `baseVersion` is the version the draft stands on; null, undefined, 0 or a
 * non-integer means nobody has published it, so the line carries no version.
 */
export function headerStateLine(
  dirty: boolean,
  savedTime: string | undefined,
  baseVersion: number | null | undefined,
): HeaderStateLine {
  const published = typeof baseVersion === "number" && Number.isInteger(baseVersion) && baseVersion > 0;
  const version = published ? { version: `v${baseVersion}` } : {};
  if (dirty) return { state: "unsaved", ...version };
  if (savedTime !== undefined) return { state: "savedAt", time: savedTime, ...version };
  return { state: "saved", ...version };
}

/**
 * The just-published flag after a render (studio-publish spec: "After a publish
 * the header bar states the version and offers Versions"). A successful publish
 * raises it directly. A dirty draft lowers it, and nothing here raises it again,
 * so a later save leaves it down.
 */
export function justPublishedAfter(current: boolean, dirty: boolean): boolean {
  return current && !dirty;
}

/**
 * Where the focus goes once a save has answered (studio-process-tabs spec: "A
 * keyboard save keeps its place"). `"stateLine"` only when Save's own press
 * started that save, the answer left the draft clean, so the button is gone, and
 * the focus fell to the body. `undefined` leaves the focus where it stands: a
 * refused save keeps the button, and focus the author moved stays put.
 */
export function saveFocusTarget(answer: {
  pressed: boolean;
  clean: boolean;
  focusOnBody: boolean;
}): "stateLine" | undefined {
  return answer.pressed && answer.clean && answer.focusOnBody ? "stateLine" : undefined;
}

/** The clock time of a save, hour and minute, in the browser's locale. */
export function formatSavedTime(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * The English name of a language code, or the code itself when no name
 * exists. `Intl.DisplayNames#of` throws on a malformed tag and echoes a
 * well-formed code it cannot name, so a throw prints the code too.
 */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The language name for the header bar's "Editing" note, or `undefined` when
 * the bar prints none (studio-app spec: "The header bar says when an author
 * edits another language"). The note stands only while the content locale
 * differs from a well-formed base language and the JSON surface is shut. The
 * JSON surface prints every language and reads no content locale.
 *
 * An absent base reads as "en", the fallback every other locale reader
 * applies. A malformed base, such as a half-typed `d`, yields no note.
 */
export function editingLocaleNote(
  contentLocale: string,
  baseLocale: string | undefined,
  jsonOpen: boolean,
): string | undefined {
  if (jsonOpen) return undefined;
  const base = baseLocale ?? "en";
  if (!resolveAddLocaleAttempt(base).ok) return undefined;
  if (contentLocale === base) return undefined;
  return languageName(contentLocale);
}
