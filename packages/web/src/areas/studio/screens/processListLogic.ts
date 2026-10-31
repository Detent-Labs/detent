import type { DraftSummary, LocaleCode, LocalizedText, ProcessSummary } from "../api/types.js";
import type { ProcessBody } from "workflow-engine/schema";
import { t } from "../catalog.js";
import { resolveDraftLocalizedText } from "../draft/localized-text.js";
import type { Route } from "../routing.js";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";

export interface ProcessRowDraft {
  revision: number;
  baseVersion: number | null;
  updatedBy: string;
  updatedAt: string;
  key: string | null;
  label: Record<string, string> | null;
  baseLocale: string | null;
  updatedByDisplayName: string | null;
}

export interface ProcessRowPublished {
  version: number;
  definitionHash: string;
  key: string;
  label: LocalizedText;
  baseLocale: LocaleCode;
  publishedAt: string;
}

export interface ProcessRow {
  processId: string;
  draft?: ProcessRowDraft;
  published?: ProcessRowPublished;
}

/**
 * Merges `GET /processes` (the newest published version per process) with
 * `GET /drafts` (one draft per process) into one row per process id. A
 * process may carry either, both, or (transiently, between mint and first
 * save) neither. Sorted by processId for a stable render order — neither
 * source is guaranteed pre-sorted the same way.
 */
/**
 * The published version a new draft for this row seeds from, or `undefined`
 * for a row with nothing published (a never-published process, or a process id
 * that only a `+ New process` mint has produced). The list already carries the
 * newest published version per row, so seeding needs no extra lookup.
 */
export function seedVersionFor(row: ProcessRow): number | undefined {
  return row.published?.version;
}

/** What `PUT /drafts/:processId` is given to create a draft. */
export interface CreateDraftInput {
  body: unknown;
  layout: Record<string, unknown>;
  revision: number;
  baseVersion?: number;
}

/** The base locale a `+ New process` draft declares. Publish requires
 * `baseLocale` and this seed is the only place the structural panels can
 * supply it before the author has typed anything, so without it a process
 * authored only through those panels could never be published. "en" is what
 * every other studio reader already falls back to for a draft that declares
 * nothing (`collectUsedLocales`, `CanvasView`, the store's content locale). */
const NEW_PROCESS_BASE_LOCALE = "en";

/**
 * The body a new draft starts from. Without a `seedVersion` every list stands
 * in place and empty (`key`, `label`, `fields`, `workflow.steps`) beside
 * `baseLocale`, the `+ New process` case. Only `workflow.initialStep` is
 * absent, since no value is valid before a step exists. With one, it is that
 * published version read back and stripped of the compile pass's cancel-sink injection,
 * since a draft holds the authored shape — stamped with the version it came
 * from so the Versions screen can diff against it. A published body carries
 * its own `baseLocale` (it could not have reached publish otherwise) and
 * `stripCompiledContent` does not remove it, so only the no-seed branch seeds.
 *
 * `readBody` rejecting propagates, and the caller must not write in its place:
 * an empty draft over a published version the author wanted to continue from is
 * the bug this whole path exists to remove. Extracted from `ProcessesScreen` so
 * both branches and that failure are testable without a DOM (studio-app spec,
 * "Studio's testable logic is extracted from its components").
 */
export async function seededDraftInput(
  seedVersion: number | undefined,
  readBody: (version: number) => Promise<unknown>,
): Promise<CreateDraftInput> {
  if (seedVersion === undefined) {
    return {
      body: { key: "", label: {}, baseLocale: NEW_PROCESS_BASE_LOCALE, fields: [], workflow: { steps: [] } },
      layout: {},
      revision: 0,
    };
  }
  const published = (await readBody(seedVersion)) as ProcessBody;
  return { body: stripCompiledContent(published), layout: {}, revision: 0, baseVersion: seedVersion };
}

/**
 * The body a new draft starts from when the author picks a template rather
 * than the empty choice. The template's body and layout travel unchanged: a
 * template already holds the authored shape, so nothing needs stripping here
 * the way `seededDraftInput` strips a published version.
 *
 * No `baseVersion`. A template is not a published version of the new process,
 * and stamping one would offer the Versions screen a diff against a version
 * that has nothing to do with this body. The write path would reject it too.
 *
 * `readTemplate` rejecting propagates, exactly as `seededDraftInput`'s
 * `readBody` does, and for the same reason: an empty draft in place of the
 * template the author picked is the bug this path exists to prevent.
 */
export async function templateDraftInput(
  templateKey: string,
  readTemplate: (key: string) => Promise<{ body: unknown; layout: Record<string, unknown> }>,
): Promise<CreateDraftInput> {
  const template = await readTemplate(templateKey);
  return { body: template.body, layout: template.layout, revision: 0 };
}

/**
 * What a template row and a picker entry are named by. A template body carries
 * its own `label`, but a template is allowed to declare none — the store checks
 * the envelope only — so this falls back to the key rather than rendering a
 * nameless row. `baseLocale` is the body's own, which a template need not
 * declare either, so the caller passes the locale it is displaying in.
 */
export function templateDisplayName(
  label: Partial<Record<string, string>> | null | undefined,
  locale: string,
  templateKey: string,
): string {
  return localizedText(label, locale) ?? templateKey;
}

/**
 * The text of `label` for `locale` (the base locale resolves through
 * `resolveDraftLocalizedText` too), or the first non-empty entry when that
 * resolves to nothing or to an empty string. `undefined` when no entry holds
 * text. The process list has no content locale, so callers pass a base locale.
 */
export function localizedText(label: Partial<Record<string, string>> | null | undefined, locale: string): string | undefined {
  const resolved = resolveDraftLocalizedText(label ?? undefined, locale, locale);
  if (resolved) return resolved;
  return Object.values(label ?? {}).find((text) => text !== undefined && text !== "");
}

export type ProcessRowCommand = "createDraft" | "versions" | "discard";

/** What one process-list row shows and offers, decided apart from the component. */
export interface ProcessRowView {
  processId: string;
  /** The label text, or "" for an untitled process; the component prints the catalog's untitled text. */
  name: string;
  /** The draft's edit route when a draft exists, else the versions route. */
  open: Route;
  saved?: { by: string | null; at: string };
  published?: { version: number; at: string };
  /** `seedVersionFor(row)`: the version Create draft seeds from. */
  seedVersion?: number;
  developer: { key: string | null; processId: string; revision?: number; hash?: string; savedBy?: string };
  commands: ProcessRowCommand[];
}

export function describeProcessRow(row: ProcessRow): ProcessRowView {
  const { draft, published } = row;
  const name =
    localizedText(draft?.label, draft?.baseLocale ?? published?.baseLocale ?? "en") ??
    localizedText(published?.label, published?.baseLocale ?? "en") ??
    "";
  const seedVersion = seedVersionFor(row);
  const commands: ProcessRowCommand[] = [];
  if (!draft) commands.push("createDraft");
  if (draft && published) commands.push("versions");
  if (draft) commands.push("discard");

  const developer: ProcessRowView["developer"] = { key: draft?.key || published?.key || null, processId: row.processId };
  if (draft) {
    developer.revision = draft.revision;
    developer.savedBy = draft.updatedBy;
  }
  if (published) developer.hash = published.definitionHash;

  return {
    processId: row.processId,
    name,
    open: draft ? { name: "edit", processId: row.processId } : { name: "versions", processId: row.processId },
    ...(draft && { saved: { by: draft.updatedByDisplayName, at: draft.updatedAt } }),
    ...(published && { published: { version: published.version, at: published.publishedAt } }),
    ...(seedVersion !== undefined && { seedVersion }),
    developer,
    commands,
  };
}

/**
 * Orders views by name, case- and accent-insensitively; an untitled row sorts
 * as the catalog's untitled text, so it does not lead the list. Ties fall back
 * to `processId`. Returns a new array.
 */
export function sortProcessRows(views: ProcessRowView[]): ProcessRowView[] {
  const sortName = (view: ProcessRowView) => view.name || t("processList.untitled");
  return [...views].sort(
    (a, b) => sortName(a).localeCompare(sortName(b), "en", { sensitivity: "base" }) || a.processId.localeCompare(b.processId),
  );
}

/** True for a primary-button click with no modifier that nothing has handled; the browser owns every other click on a link. */
export function isPlainLeftClick(e: {
  button: number;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return e.button === 0 && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/**
 * How long before `now` (epoch milliseconds) `iso` lies, floored to one unit:
 * "just now" under a minute, then minutes, hours, days, months (capped at 11)
 * and years. A time in the future, or one that does not parse, reads "just now".
 */
export function relativeAgo(iso: string, now: number): string {
  const seconds = Math.floor((now - Date.parse(iso)) / 1000);
  if (!(seconds >= 60)) return t("processList.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return relativeTime.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return relativeTime.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return relativeTime.format(-days, "day");
  if (days < 365) return relativeTime.format(-Math.min(11, Math.floor(days / 30)), "month");
  return relativeTime.format(-Math.floor(days / 365), "year");
}

/**
 * Stops a second press on one process row's "Create draft" from writing a
 * second draft while the first write is still in flight. The returned
 * `run(key, write)` checks the held set before `write`'s first `await`,
 * synchronously inside the call. A held key resolves `false` and never
 * calls `write`. React would disable the button in time on its own — it
 * commits a click's new state in a microtask, ahead of the browser's next
 * click — but a synchronous check needs no render cycle at all, so a
 * `bun:test` suite drives the same rule with no DOM: two calls in one tick
 * still write once.
 *
 * Otherwise the key joins the held set, and `onHeldChange` receives a fresh
 * `Set` copy. React skips a re-render given the same object, so a mutated
 * set would never disable the button. A rejected `write` frees the key,
 * passes another copy to `onHeldChange`, and rethrows the same error. A
 * resolved `write` leaves the key held and resolves `true`.
 */
export function createInFlightGuard(onHeldChange: (held: ReadonlySet<string>) => void) {
  const held = new Set<string>();
  return async function run(key: string, write: () => Promise<void>): Promise<boolean> {
    if (held.has(key)) return false;
    held.add(key);
    onHeldChange(new Set(held));
    try {
      await write();
      return true;
    } catch (err) {
      held.delete(key);
      onHeldChange(new Set(held));
      throw err;
    }
  };
}

/**
 * Narrows `rows` to the processIds the actor's own Developer or Owner
 * list names, unnarrowed for `ADMIN_ROLE` (studio-app: "The process list
 * shows draft and published state per process"). `access` is the
 * response `getMyProcessAccess` returns.
 */
export function narrowToAccessible(rows: ProcessRow[], access: { developer: string[]; owner: string[] }, isAdmin: boolean): ProcessRow[] {
  if (isAdmin) return rows;
  const accessible = new Set([...access.developer, ...access.owner]);
  return rows.filter((row) => accessible.has(row.processId));
}

export function deriveProcessRows(processes: ProcessSummary[], drafts: DraftSummary[]): ProcessRow[] {
  const rows = new Map<string, ProcessRow>();

  for (const p of processes) {
    rows.set(p.processId, {
      processId: p.processId,
      published: {
        version: p.version,
        definitionHash: p.definitionHash,
        key: p.key,
        label: p.label,
        baseLocale: p.baseLocale,
        publishedAt: p.publishedAt,
      },
    });
  }
  for (const d of drafts) {
    const existing = rows.get(d.processId);
    const draft: ProcessRowDraft = {
      revision: d.revision,
      baseVersion: d.baseVersion,
      updatedBy: d.updatedBy,
      updatedAt: d.updatedAt,
      key: d.key,
      label: d.label,
      baseLocale: d.baseLocale,
      updatedByDisplayName: d.updatedByDisplayName,
    };
    rows.set(d.processId, existing ? { ...existing, draft } : { processId: d.processId, draft });
  }

  return [...rows.values()].sort((a, b) => a.processId.localeCompare(b.processId));
}
