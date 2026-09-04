import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listMyReports } from "../api/client.js";
import { describeCaughtError } from "./reportingLogic.js";
import { EmptyState, ErrorNote, WaitingNote } from "../components.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ClientError, Report } from "../api/types.js";

/**
 * Every report the caller owns or has edit/view access to — the list
 * "reopen a report you own or can edit" backs (spec: "A built report is
 * saved, named and reusable").
 */
/** `app.css`'s screen/controls/picker rules, as StyleX. `.rep-report-
 * picker` shares `.rep-picker`'s own shape exactly; kept under its own
 * name here, matching this file's own selector. */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s3,
    alignItems: "flex-end",
    paddingBottom: space.s3,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  reportPicker: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  reportPickerRow: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  pickerItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: space.s3,
    width: "100%",
    background: { default: "none", ":hover": colors.surfaceMuted },
    borderWidth: 0,
    padding: `${space.s3} ${space.s2}`,
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  pickerLabel: {
    fontWeight: 600,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  pickerMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    whiteSpace: "nowrap",
  },
});

export function ReportsListScreen({
  token,
  locale,
  actorId,
  onOpen,
  onNew,
}: {
  token: string;
  locale: UiLocale;
  actorId: string;
  onOpen: (reportId: string) => void;
  onNew: () => void;
}) {
  const [reports, setReports] = useState<Report[] | undefined>();
  const [error, setError] = useState<ClientError | undefined>();

  useEffect(() => {
    let cancelled = false;
    listMyReports(token)
      .then((body) => {
        if (!cancelled) setReports(body.reports);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(describeCaughtError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const controlsProps = stylex.props(styles.controls);
  return (
    <main {...stylex.props(styles.screen)}>
      <div className={controlsProps.className} style={{ ...controlsProps.style, justifyContent: "space-between" }}>
        <h1>{t(locale, "reports.title")}</h1>
        <button type="button" className="btn btn-primary" onClick={onNew}>
          {t(locale, "reports.new")}
        </button>
      </div>
      {error && <ErrorNote error={error} locale={locale} />}
      {!error && reports === undefined && <WaitingNote locale={locale} />}
      {!error && reports?.length === 0 && <EmptyState>{t(locale, "reports.empty")}</EmptyState>}
      {!error && reports && reports.length > 0 && (
        <ul {...stylex.props(styles.reportPicker)}>
          {reports.map((r) => (
            <li key={r.reportId} {...stylex.props(styles.reportPickerRow)}>
              <button type="button" {...stylex.props(styles.pickerItem)} onClick={() => onOpen(r.reportId)}>
                <span {...stylex.props(styles.pickerLabel)}>{r.name}</span>
                <span {...stylex.props(styles.pickerMeta)}>
                  {t(locale, r.owner === actorId ? "reports.metaOwner" : "reports.metaShared")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
