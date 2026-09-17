/**
 * The Access tab's body: a process's Developer, Owner and Reader lists
 * (`studio-app`'s Access-surface requirement). Reaching this tab at all
 * already needs Developer-list-or-admin standing, per the edit screen's own
 * gate (`process-drafts`) — this panel adds no visibility gate of its own. It
 * only decides which lists offer add/delete controls, from the actor's own
 * standing on the loaded lists (or `ADMIN_ROLE`).
 *
 * Fetches on mount and again after every add/delete — no optimistic local
 * mutation, since this surface carries no latency pressure (design.md).
 */
import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { addAccessPrincipal, deleteAccessPrincipal, getProcessAccess } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { accessControls } from "./accessLogic.js";
import type { AccessKind, ProcessAccessLists } from "../api/types.js";

/**
 * The `.studio-empty` and `.studio-error-banner*` shapes, both from
 * `app.css`. Duplicated on purpose, the same as `ChangesView.tsx` (D9):
 * component styles compile per file, and this same shape already appears
 * near-identically in other studio files.
 */
const styles = stylex.create({
  section: {
    marginBottom: space.s4,
  },
  list: {
    listStyle: "none",
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s2,
    padding: 0,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
    paddingBlock: space.s1,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  identity: {
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
  },
  empty: {
    color: colors.textMuted,
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s2,
  },
  addForm: {
    display: "flex",
    gap: space.s2,
  },
  loading: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
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
});

/**
 * One list (Developer, Owner or Reader): a raw-id row per principal, mono
 * face, marked `translate="no"` — the same shape `ShareEditor.tsx`'s
 * `PrincipalList` gives a report's `viewers`/`editors` (design.md). Read-only
 * when `editable` is false: no Remove button, no add form, matching
 * `PrincipalList`'s own owner-locked-entry treatment, extended here to the
 * whole list rather than one row. No removal guard beyond that: unlike
 * `PrincipalList`'s "owner cannot remove themselves" rule, nothing in this
 * requirement protects the last Developer entry from deletion.
 */
function AccessListEditor({
  label,
  emptyText,
  values,
  editable,
  onAdd,
  onDelete,
}: {
  label: string;
  emptyText: string;
  values: string[];
  editable: boolean;
  onAdd: (principal: string) => void;
  onDelete: (principal: string) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <section {...stylex.props(styles.section)}>
      <h3>{label}</h3>
      {values.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{emptyText}</p>
      ) : (
        <ul {...stylex.props(styles.list)}>
          {values.map((principal) => (
            <li key={principal} {...stylex.props(styles.row)}>
              <span translate="no" {...stylex.props(styles.identity)}>
                {principal}
              </span>
              {editable && (
                <button type="button" className="btn btn-secondary" onClick={() => onDelete(principal)}>
                  {t("access.remove")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form
          {...stylex.props(styles.addForm)}
          onSubmit={(e) => {
            e.preventDefault();
            const value = draft.trim();
            if (value) onAdd(value);
            setDraft("");
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("access.addPlaceholder")}
            aria-label={label}
          />
          <button type="submit" className="btn btn-secondary">
            {t("access.add")}
          </button>
        </form>
      )}
    </section>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; lists: ProcessAccessLists };

interface AccessPanelProps {
  processId: string;
  token: string;
  /** The calling actor's own id and roles, to decide which lists offer
   * controls (`isDeveloper`/`isOwner` below) — read from the loaded lists,
   * not from a server-computed flag. */
  actorId: string;
  roles: readonly string[];
  onUnauthorized: () => void;
}

export function AccessPanel({ processId, token, actorId, roles, onUnauthorized }: AccessPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [writeError, setWriteError] = useState<string | null>(null);
  // Bumped after every successful add/delete, so the load effect below
  // refetches instead of mutating the loaded lists locally.
  const [reloadKey, setReloadKey] = useState(0);
  const failLoad = useFail(onUnauthorized, (e) => setState({ kind: "error", message: describeCaughtError(e) }));
  const failWrite = useFail(onUnauthorized, (e) => setWriteError(describeCaughtError(e)));

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    getProcessAccess(processId, token)
      .then((lists) => {
        if (!cancelled) setState({ kind: "loaded", lists });
      })
      .catch((e: unknown) => {
        if (!cancelled) failLoad(e);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId, token, reloadKey]);

  const runWrite = (action: () => Promise<unknown>) => {
    setWriteError(null);
    action()
      .then(() => setReloadKey((k) => k + 1))
      .catch(failWrite);
  };

  const onAdd = (kind: AccessKind, principal: string) => runWrite(() => addAccessPrincipal(processId, kind, principal, token));
  const onDelete = (kind: AccessKind, principal: string) => runWrite(() => deleteAccessPrincipal(processId, kind, principal, token));

  if (state.kind === "loading") return <p {...stylex.props(styles.loading)}>{t("access.loading")}</p>;
  if (state.kind === "error") {
    return (
      <div {...stylex.props(styles.errorBanner)} role="alert">
        <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
        <span {...stylex.props(styles.errorBannerMessage)}>{state.message}</span>
      </div>
    );
  }

  const { developerEditable, ownerEditable, readerEditable } = accessControls(state.lists, actorId, roles);

  return (
    <div>
      {writeError !== null && (
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>{writeError}</span>
        </div>
      )}
      <AccessListEditor
        label={t("access.developerLabel")}
        emptyText={t("access.developerEmpty")}
        values={state.lists.developer}
        editable={developerEditable}
        onAdd={(principal) => onAdd("developer", principal)}
        onDelete={(principal) => onDelete("developer", principal)}
      />
      <AccessListEditor
        label={t("access.ownerLabel")}
        emptyText={t("access.ownerEmpty")}
        values={state.lists.owner}
        editable={ownerEditable}
        onAdd={(principal) => onAdd("owner", principal)}
        onDelete={(principal) => onDelete("owner", principal)}
      />
      <AccessListEditor
        label={t("access.readerLabel")}
        emptyText={t("access.readerEmpty")}
        values={state.lists.reader}
        editable={readerEditable}
        onAdd={(principal) => onAdd("reader", principal)}
        onDelete={(principal) => onDelete("reader", principal)}
      />
    </div>
  );
}
