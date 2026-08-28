import { useEffect, useState } from "react";
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

  return (
    <main className="rep-screen">
      <div className="rep-controls" style={{ justifyContent: "space-between" }}>
        <h1>{t(locale, "reports.title")}</h1>
        <button type="button" className="btn btn-primary" onClick={onNew}>
          {t(locale, "reports.new")}
        </button>
      </div>
      {error && <ErrorNote error={error} locale={locale} />}
      {!error && reports === undefined && <WaitingNote locale={locale} />}
      {!error && reports?.length === 0 && <EmptyState>{t(locale, "reports.empty")}</EmptyState>}
      {!error && reports && reports.length > 0 && (
        <ul className="rep-report-picker">
          {reports.map((r) => (
            <li key={r.reportId}>
              <button type="button" className="rep-picker-item" onClick={() => onOpen(r.reportId)}>
                <span className="rep-picker-label">{r.name}</span>
                <span className="rep-picker-meta">
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
