import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import * as stylex from "@stylexjs/stylex";
import { Upload } from "lucide-react";
import { layout, colors, fonts, space } from "form-ui/tokens.stylex";
import {
  listProcesses,
  listDrafts,
  getMyProcessAccess,
  saveDraft,
  deleteDraft,
  getVersionBody,
  publishProcess,
  listTemplates,
  getTemplate,
} from "../api/client.js";
import {
  createInFlightGuard,
  deriveProcessRows,
  describeProcessRow,
  isPlainLeftClick,
  narrowToAccessible,
  relativeAgo,
  seededDraftInput,
  sortProcessRows,
  templateDraftInput,
  templateDisplayName,
  type ProcessRow,
  type ProcessRowView,
} from "./processListLogic.js";
import type { TemplateSummary } from "../api/types.js";
import { collidingProcessId, parsePromotionFile, type PromotionPreview } from "./promotionImportLogic.js";
import { mintId } from "../draft/ids.js";
import { routePath, type Route } from "../routing.js";
import { areaHref } from "../../../shell/routing.js";
import { describeCaughtError } from "../errors.js";
import { t } from "../catalog.js";
import { is401, useFail } from "../../../shell/useFail.js";
import {
  DialogDeveloperView,
  DialogFact,
  DialogFacts,
  DialogMonoFact,
  DialogNote,
  DialogRefusal,
  DialogWarning,
  PrimaryConfirm,
  StudioDialog,
} from "../panels/shared/StudioDialog.js";
import { activeControl } from "../panels/shared/dialogFocus.js";
import { ABSOLUTE_TIME, DiscardDraftDialog } from "../panels/DiscardDraftDialog.js";

/** Every class this file's own markup renders. The two dialogs stand on
 * `panels/shared/StudioDialog.tsx`. */
const styles = stylex.create({
  // The refusal of an import file no dialog opened for.
  importFileRefusal: {
    color: colors.refusal,
    whiteSpace: "pre-line",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
  choices: {
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  screen: {
    maxWidth: layout.capWide,
    marginInline: "auto",
    marginBlock: 0,
    paddingBlock: `${space.s4} ${space.s6}`,
    paddingInline: space.s3,
  },
  note: {
    color: colors.textMuted,
    minHeight: "1.25rem",
    marginBlockEnd: space.s2,
    marginBlockStart: 0,
    marginInline: 0,
  },
  errorBanner: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.refusal,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    marginBlock: space.s3,
    marginInline: 0,
  },
  errorBannerStamp: {
    flex: "none",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: colors.refusal,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
    transform: "rotate(-2deg)",
  },
  errorBannerMessage: {
    flex: 1,
    color: colors.text,
  },
  // A fixed layout with set column widths: an open Developer view wraps its
  // values inside the Process column and never moves a column.
  table: {
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
  },
  colProcess: { width: "36%" },
  colDraft: { width: "26%" },
  colPublished: { width: "16%" },
  colCommands: { width: "22%" },
  tableHeadCell: {
    textAlign: "left",
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  tableCell: {
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "top",
  },
  // The name is the row's one link: ink at the table's size, underlined on hover only.
  nameLink: {
    color: colors.text,
    textDecoration: { default: "none", ":hover": "underline" },
    overflowWrap: "anywhere",
  },
  quiet: {
    color: colors.textMuted,
  },
  mono: {
    fontFamily: fonts.mono,
  },
  commands: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
  },
  // A narrow cell wraps whole buttons onto a second line, never a label.
  command: {
    whiteSpace: "nowrap",
  },
  // Copies `panels/ChangeList.tsx`'s `visuallyHidden`.
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
  developer: {
    marginBlockStart: space.s1,
  },
  // `developerSummary` and `developerBox` copy `panels/ChangeList.tsx`'s own
  // shapes. The box leaves out that file's `position` and `overflowX`: every
  // value here wraps, so the box never scrolls.
  developerSummary: {
    width: "fit-content",
    paddingBlock: space.s1,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    cursor: "pointer",
  },
  developerBox: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: `${space.s1} ${space.s3}`,
    marginBlockStart: space.s1,
    marginBlockEnd: 0,
    marginInline: 0,
    padding: space.s2,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    fontSize: "0.8rem",
  },
  developerTerm: {
    color: colors.textMuted,
  },
  developerValue: {
    margin: 0,
    minWidth: 0,
    fontFamily: fonts.mono,
    overflowWrap: "anywhere",
  },
});

// Matches the local-constant convention `areas/admin/root.tsx` and
// `areas/studio/root.tsx` already use — this codebase does not share one
// exported role-constant module across areas.
const ADMIN_ROLE = "system:admin";
const CREATE_ROLE = "system:create";

interface ProcessesScreenProps {
  token: string;
  roles: readonly string[];
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

interface PromotionPreviewDialogProps {
  preview: PromotionPreview;
  /** The process id already publishing under this key, or undefined. Derived by the caller during render. */
  collision: string | undefined;
  /** A refused publish, shown inside the dialog — see the failure note below. */
  error: string | undefined;
  busy: boolean;
  /** The Import control that opened the file chooser, for the focus return. */
  triggerRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * environment-promotion spec: the preview a developer confirms before an import
 * publishes. Mounted only while a file is pending, so the open effect runs once.
 *
 * Shows the INCOMING version's own metadata only. It never compares against
 * another environment — the target may hold no version of this process at all.
 * The key, the process id and the source hash wait in the Developer view.
 */
export function PromotionPreviewDialog({ preview, collision, error, busy, triggerRef, onCancel, onConfirm }: PromotionPreviewDialogProps) {
  return (
    <StudioDialog
      heading={t("processList.importHeading")}
      triggerRef={triggerRef}
      onCancel={onCancel}
      busy={busy}
      confirm={<PrimaryConfirm onClick={onConfirm}>{busy ? t("draftToolbar.publishing") : t("processList.importConfirm")}</PrimaryConfirm>}
      // A refused publish leaves the dialog open so the developer can read the
      // reason beside the file it describes, then cancel or retry. It must
      // render INSIDE the dialog: `showModal()` puts this element in the top
      // layer, so anything on the screen behind it is inert and dimmed.
      refusal={error !== undefined && <DialogRefusal>{error}</DialogRefusal>}
    >
      <DialogFacts>
        <DialogFact term={t("draftToolbar.dialogProcess")}>{preview.label || t("processList.untitled")}</DialogFact>
        <DialogMonoFact term={t("processList.importSourceVersion")}>{preview.version === undefined ? "—" : `v${preview.version}`}</DialogMonoFact>
      </DialogFacts>
      {collision !== undefined && <DialogWarning>{t("processList.importCollision")}</DialogWarning>}
      <DialogNote>{t("processList.importNote")}</DialogNote>
      <DialogDeveloperView>
        <DialogMonoFact term={t("processList.devKey")}>{preview.key === "" ? "—" : preview.key}</DialogMonoFact>
        <DialogMonoFact term={t("processList.devProcessId")}>{preview.processId}</DialogMonoFact>
        <DialogMonoFact term={t("processList.importSourceHash")}>{preview.definitionHash ?? "—"}</DialogMonoFact>
        {collision !== undefined && <DialogMonoFact term={t("processList.importCollisionId")}>{collision}</DialogMonoFact>}
      </DialogDeveloperView>
    </StudioDialog>
  );
}

/** `seededDraftInput` with no seed version never calls its reader; this names that rather than passing a reader that could run. */
const noSeedToRead = (): Promise<never> => Promise.reject(new Error("no seed version to read"));

interface StartPickerDialogProps {
  templates: TemplateSummary[];
  /** The + New process control, for the focus return on a decline. */
  triggerRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onPick: (templateKey: string | undefined) => void;
}

/**
 * What `+ New process` opens. It commits nothing, so the first choice holds
 * the opening focus and Cancel stands last.
 *
 * The empty choice leads first and stays available when no template exists —
 * an installation starts with none, and the picker must not be a dead end.
 */
export function StartPickerDialog({ templates, triggerRef, onCancel, onPick }: StartPickerDialogProps) {
  const emptyChoice = useRef<HTMLButtonElement>(null);

  return (
    <StudioDialog heading={t("processList.startHeading")} triggerRef={triggerRef} onCancel={onCancel} initialFocusRef={emptyChoice}>
      <div {...stylex.props(styles.choices)}>
        <button ref={emptyChoice} type="button" className="btn btn-primary" onClick={() => onPick(undefined)}>
          {t("processList.startEmpty")}
        </button>
        {templates.map((template) => (
          <button key={template.templateKey} type="button" className="btn btn-secondary" onClick={() => onPick(template.templateKey)}>
            {templateDisplayName(template.label, "en", template.templateKey)}
          </button>
        ))}
      </div>
      {templates.length === 0 && <DialogNote>{t("processList.startNoTemplates")}</DialogNote>}
    </StudioDialog>
  );
}

/** A relative time, with the absolute date and time on hover. `now` is the one `Date.now()` the list's pass read. */
function RelativeTime({ iso, now }: { iso: string; now: number }) {
  const absolute = ABSOLUTE_TIME.format(new Date(iso));
  return (
    <time dateTime={iso} title={absolute}>
      {relativeAgo(iso, now)}
    </time>
  );
}

/** "Saved by {name}, {when}" or "Saved {when}", with the `<time>` in the `{when}` slot. */
function SavedLine({ saved, now }: { saved: { by: string | null; at: string }; now: number }) {
  const template = saved.by === null ? t("processList.savedAnonymous") : t("processList.savedBy");
  const [before = "", after = ""] = template.split("{when}");
  // A function fills the slot, so a `$` pattern in a name prints as written.
  const by = saved.by;
  const fill = (part: string) => (by === null ? part : part.replace("{name}", () => by));
  return (
    <>
      {fill(before)}
      <RelativeTime iso={saved.at} now={now} />
      {fill(after)}
    </>
  );
}

function DeveloperEntry({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt {...stylex.props(styles.developerTerm)}>{term}</dt>
      <dd {...stylex.props(styles.developerValue)} translate="no">
        {value}
      </dd>
    </>
  );
}

/** The row's name link, where the focus lands after a discard from that row. */
const nameLinkId = (processId: string): string => `process-name-${processId}`;

export interface ProcessListRowProps {
  view: ProcessRowView;
  /** Epoch milliseconds, read once per pass of the list. */
  now: number;
  /** True while this row's Create draft write is in flight. */
  creating: boolean;
  onNavigate: (route: Route) => void;
  onCreateDraft: (view: ProcessRowView) => void;
  onDiscard: (view: ProcessRowView) => void;
}

/**
 * One process-list row, drawn from its `ProcessRowView` alone. The name is the
 * row's one link; a plain primary click navigates in place, and the browser
 * keeps every other click. Machine values sit only inside the Developer view.
 */
export function ProcessListRow({ view, now, creating, onNavigate, onCreateDraft, onDiscard }: ProcessListRowProps) {
  const { developer } = view;
  const command = stylex.props(styles.command).className;
  return (
    <tr>
      <td {...stylex.props(styles.tableCell)}>
        <a
          href={areaHref("studio", routePath(view.open))}
          id={nameLinkId(view.processId)}
          {...stylex.props(styles.nameLink, view.name === "" && styles.quiet)}
          onClick={(e) => {
            if (!isPlainLeftClick(e)) return;
            e.preventDefault();
            onNavigate(view.open);
          }}
        >
          {view.name || t("processList.untitled")}
        </a>
        <details {...stylex.props(styles.developer)}>
          <summary {...stylex.props(styles.developerSummary)}>{t("processList.developerView")}</summary>
          <dl {...stylex.props(styles.developerBox)}>
            <DeveloperEntry term={t("processList.devKey")} value={developer.key ?? "—"} />
            <DeveloperEntry term={t("processList.devProcessId")} value={developer.processId} />
            {developer.revision !== undefined && <DeveloperEntry term={t("processList.devRevision")} value={String(developer.revision)} />}
            {developer.hash !== undefined && <DeveloperEntry term={t("processList.devHash")} value={developer.hash} />}
            {developer.savedBy !== undefined && <DeveloperEntry term={t("processList.devSavedBy")} value={developer.savedBy} />}
          </dl>
        </details>
      </td>
      <td {...stylex.props(styles.tableCell)}>
        {view.saved ? <SavedLine saved={view.saved} now={now} /> : <span {...stylex.props(styles.quiet)}>{t("processList.noDraft")}</span>}
      </td>
      <td {...stylex.props(styles.tableCell)}>
        {view.published ? (
          <>
            <span {...stylex.props(styles.mono)} translate="no">
              v{view.published.version}
            </span>
            {" · "}
            <RelativeTime iso={view.published.at} now={now} />
          </>
        ) : (
          <span {...stylex.props(styles.quiet)}>{t("processList.notPublished")}</span>
        )}
      </td>
      <td {...stylex.props(styles.tableCell)}>
        <div {...stylex.props(styles.commands)}>
          {view.commands.map((kind) =>
            kind === "createDraft" ? (
              <button key={kind} type="button" className={`btn btn-secondary ${command}`} onClick={() => onCreateDraft(view)} disabled={creating}>
                {t("processList.createDraft")}
              </button>
            ) : kind === "versions" ? (
              <button
                key={kind}
                type="button"
                className={`btn btn-secondary ${command}`}
                onClick={() => onNavigate({ name: "versions", processId: view.processId })}
              >
                {t("processList.versions")}
              </button>
            ) : (
              <button key={kind} type="button" className={`btn btn-secondary btn-destructive ${command}`} onClick={() => onDiscard(view)}>
                {t("processList.discard")}
              </button>
            ),
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * The process list's table: its accessible name, its fixed column widths and
 * its header row. The commands column's header is visually hidden.
 */
export function ProcessListTable({ children }: { children: ReactNode }) {
  return (
    <table {...stylex.props(styles.table)} aria-label={t("processList.tableLabel")}>
      <colgroup>
        <col {...stylex.props(styles.colProcess)} />
        <col {...stylex.props(styles.colDraft)} />
        <col {...stylex.props(styles.colPublished)} />
        <col {...stylex.props(styles.colCommands)} />
      </colgroup>
      <thead>
        <tr>
          <th {...stylex.props(styles.tableHeadCell)}>{t("processList.headProcess")}</th>
          <th {...stylex.props(styles.tableHeadCell)}>{t("processList.headDraft")}</th>
          <th {...stylex.props(styles.tableHeadCell)}>{t("processList.headPublished")}</th>
          <th {...stylex.props(styles.tableHeadCell)}>
            <span {...stylex.props(styles.visuallyHidden)}>{t("processList.headCommands")}</span>
          </th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function ProcessesScreen({ token, roles, navigate, onUnauthorized }: ProcessesScreenProps) {
  const isAdmin = roles.includes(ADMIN_ROLE);
  const canCreate = roles.includes(CREATE_ROLE);
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // Import state, kept apart from `error` above: a rejected file or a refused
  // publish must not blank the process list's own empty state, and vice versa.
  const [pending, setPending] = useState<PromotionPreview | undefined>(undefined);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | undefined>(undefined);
  const [importResult, setImportResult] = useState<string | undefined>(undefined);
  // The row `DiscardDraftDialog` asks about, its request, and its refusal.
  const [pendingDiscard, setPendingDiscard] = useState<ProcessRowView | undefined>(undefined);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | undefined>(undefined);
  // The row's Discard draft, for the focus return on a decline.
  const discardTrigger = useRef<HTMLElement | null>(null);
  // The process whose discard just ended, for the focus landing below.
  const [discardLanding, setDiscardLanding] = useState<string | undefined>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  // The controls that open the two dialogs, for their focus return.
  const newProcessButton = useRef<HTMLButtonElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  // The start picker's own state. `templates` is undefined until the picker opens,
  // so the list screen issues no template request an author may never need.
  const [picking, setPicking] = useState(false);
  // Whether another dialog stands, for `newProcess`'s read after its await.
  const otherDialogOpen = useRef(false);
  otherDialogOpen.current = pending !== undefined || pendingDiscard !== undefined;
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err)));
  const failImport = useFail(onUnauthorized, (err) => setImportError(describeCaughtError(err)));
  const failDiscard = useFail(onUnauthorized, (err) => setDiscardError(describeCaughtError(err)));
  // The set of processIds with a "Create draft" write in flight, mirrored
  // from `runCreateDraft`'s own held set so the row's button can read it.
  // `runCreateDraft` is created once, lazily: a `useRef` argument would
  // create and drop a guard on every render.
  const [creating, setCreating] = useState<ReadonlySet<string>>(() => new Set());
  const [runCreateDraft] = useState(() => createInFlightGuard(setCreating));

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [processes, drafts, access] = await Promise.all([listProcesses(token), listDrafts(token), getMyProcessAccess(token)]);
      setRows(narrowToAccessible(deriveProcessRows(processes, drafts), access, isAdmin));
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [token, fail, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * `seededDraftInput` decides the body and throws if the published version
   * cannot be read, so the `saveDraft` below never runs on a failed seed —
   * writing an empty draft over a version the author wanted to continue from is
   * the bug this path exists to remove.
   *
   * `runCreateDraft` holds `processId` from before the read until `navigate`
   * runs, so a second press on the same row's button while that hold stands
   * sends no second read and no second write. `creating` mirrors the held
   * set into render state, and the row's button reads `disabled` from it. A
   * failed try frees the key: `fail(err)` reports the error, and the button
   * reads enabled again for a later press.
   */
  const createDraft = async (processId: string, seedVersion?: number) => {
    try {
      await runCreateDraft(processId, async () => {
        const input = await seededDraftInput(seedVersion, (v) => getVersionBody(processId, v, token));
        await saveDraft(processId, input, token);
        navigate({ name: "edit", processId });
      });
    } catch (err) {
      fail(err);
    }
  };

  /**
   * `+ New process` opens the picker rather than minting straight away. The
   * template list is read here, not on mount: an author who always starts empty
   * never pays for it. A failed read still opens the picker, with the empty
   * choice, since starting empty must not depend on the template route. A
   * dialog the author opened during the read keeps the screen: the picker stays
   * shut, since two open dialogs break the keyboard hold.
   */
  const newProcess = async () => {
    setError(undefined);
    try {
      setTemplates(await listTemplates(token));
    } catch (err) {
      // A 401 here skips the picker entirely, unlike every other error on this
      // screen — `fail`'s void return cannot express that, so this site keeps
      // its own `is401` check instead of the shared callback.
      if (is401(err)) return onUnauthorized();
      setTemplates([]);
      setError(describeCaughtError(err));
    }
    if (!otherDialogOpen.current) setPicking(true);
  };

  /**
   * Both branches mint the process id here and write one draft, so a template
   * start is the same single round trip an empty start already was.
   * `templateDraftInput` throws when the template cannot be read, so no empty
   * draft lands in place of the template the author picked.
   */
  const startProcess = async (templateKey: string | undefined) => {
    setPicking(false);
    const processId = mintId("process");
    try {
      const input =
        templateKey === undefined
          ? await seededDraftInput(undefined, noSeedToRead)
          : await templateDraftInput(templateKey, (key) => getTemplate(key, token));
      await saveDraft(processId, input, token);
      navigate({ name: "edit", processId });
    } catch (err) {
      fail(err);
    }
  };

  /**
   * Reads a chosen promotion file and, when it passes the shape guard, opens
   * the preview. Nothing reaches the network on this path: a bad file is
   * reported inline and no request goes out. The input is cleared afterwards so
   * choosing the same file twice fires `change` again.
   */
  const chooseFile = (file: File | undefined) => {
    setImportError(undefined);
    setImportResult(undefined);
    setPending(undefined);
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setImportError("The file could not be read.");
    reader.onload = () => {
      const parsed = parsePromotionFile(String(reader.result ?? ""));
      if (parsed.ok) setPending(parsed.preview);
      else setImportError(parsed.message);
    };
    reader.readAsText(file);
  };

  /**
   * Publishes the pending file through the unchanged `POST /processes`, under
   * the source environment's own process id. A failure here is the server's —
   * cross-process validation, authorization, a schema violation — and its
   * message is shown as returned rather than reworded.
   */
  const confirmImport = async () => {
    if (!pending) return;
    setImporting(true);
    setImportError(undefined);
    try {
      const published = await publishProcess(pending.processId, pending.body, token);
      setImportResult(`Published v${published.version} · ${published.definitionHash.slice(0, 12)}`);
      setPending(undefined);
      await load();
    } catch (err) {
      failImport(err);
    } finally {
      setImporting(false);
    }
  };

  /**
   * Closes the preview without publishing, and resets what the preview owned.
   *
   * Clearing `importError` is the load-bearing part. A refused publish sets it
   * while the dialog is open, and the screen-level error below renders only
   * when no dialog is open — so cancelling after a refusal would move that
   * message out from the dialog and onto the screen, where it would sit as a
   * standing error over an import the developer had just abandoned.
   *
   * Clearing `importResult` is defensive. `chooseFile` already clears it, and
   * no path opens this dialog without going through there.
   */
  const cancelImport = () => {
    setPending(undefined);
    setImportError(undefined);
    setImportResult(undefined);
  };

  const askDiscard = (view: ProcessRowView) => {
    discardTrigger.current = activeControl();
    setDiscardError(undefined);
    setPendingDiscard(view);
  };

  /**
   * The dialog stays open, its controls disabled, until the `DELETE` answers. A
   * refusal prints inside it. A discard removes the row when the process has no
   * published version, so the focus does not return to the row's control: it
   * lands once the list has reloaded.
   */
  const confirmDiscard = async () => {
    if (!pendingDiscard) return;
    const { processId } = pendingDiscard;
    setDiscarding(true);
    setDiscardError(undefined);
    try {
      await deleteDraft(processId, token);
      discardTrigger.current = null;
      setPendingDiscard(undefined);
      await load();
      setDiscardLanding(processId);
    } catch (err) {
      failDiscard(err);
    } finally {
      setDiscarding(false);
    }
  };

  // The name link of a row that stayed, else Import. An effect, so it runs after
  // the commit that unmounted the dialog: the page stands inert until then.
  useEffect(() => {
    if (discardLanding === undefined) return;
    (document.getElementById(nameLinkId(discardLanding)) ?? importButton.current)?.focus();
    setDiscardLanding(undefined);
  }, [discardLanding]);

  // One clock read per pass: a list left open does not tick, and its times move on the next load.
  const now = Date.now();
  const views = sortProcessRows(rows.map(describeProcessRow));

  return (
    <main {...stylex.props(styles.screen)}>
      {picking && (
        <StartPickerDialog
          templates={templates}
          triggerRef={newProcessButton}
          onCancel={() => setPicking(false)}
          onPick={(key) => void startProcess(key)}
        />
      )}
      <div {...stylex.props(styles.controls)}>
        {canCreate && (
          <button ref={newProcessButton} type="button" className="btn btn-primary" onClick={() => void newProcess()}>
            {t("processList.newProcess")}
          </button>
        )}
        <button ref={importButton} type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
          <Upload size={18} strokeWidth={1.75} aria-hidden="true" />
          {t("processList.import")}
        </button>
        <input
          id="promotion-import"
          ref={fileInput}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            chooseFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {/* Only a file the guard rejected lands here — no dialog is open then. A
          publish failure renders inside the dialog instead. */}
      {importError === undefined || pending !== undefined ? null : (
        <p {...stylex.props(styles.importFileRefusal)} role="alert">
          {importError}
        </p>
      )}
      <p {...stylex.props(styles.note)} aria-live="polite">
        {importResult ?? ""}
      </p>
      {pending === undefined ? null : (
        <PromotionPreviewDialog
          preview={pending}
          collision={collidingProcessId(pending, rows)}
          error={importError}
          busy={importing}
          triggerRef={importButton}
          onCancel={cancelImport}
          onConfirm={() => void confirmImport()}
        />
      )}
      {pendingDiscard !== undefined && (
        <DiscardDraftDialog
          processLabel={pendingDiscard.name || t("processList.untitled")}
          lastSavedAt={pendingDiscard.saved ? new Date(pendingDiscard.saved.at) : undefined}
          refusal={discardError === undefined ? null : { message: discardError, detail: null }}
          busy={discarding}
          triggerRef={discardTrigger}
          onCancel={() => {
            setPendingDiscard(undefined);
            setDiscardError(undefined);
          }}
          onConfirm={() => void confirmDiscard()}
        />
      )}
      {error && (
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>{error}</span>
          <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            {t("error.retry")}
          </button>
        </div>
      )}
      {loading && rows.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t("processList.loading")}</p>
      ) : rows.length === 0 ? (
        !error && <p {...stylex.props(styles.empty)}>{t("processList.empty")}</p>
      ) : (
        <ProcessListTable>
          {views.map((view) => (
            <ProcessListRow
              key={view.processId}
              view={view}
              now={now}
              creating={creating.has(view.processId)}
              onNavigate={navigate}
              onCreateDraft={(v) => void createDraft(v.processId, v.seedVersion)}
              onDiscard={askDiscard}
            />
          ))}
        </ProcessListTable>
      )}
    </main>
  );
}
