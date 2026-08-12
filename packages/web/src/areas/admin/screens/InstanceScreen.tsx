import { useCallback, useEffect, useState } from "react";
import { cancelInstance, redactInstance, getInstanceRecord, getInstanceView, listPendingTimers, listProcesses, listVersions, AdminClientError } from "../api/client.js";
import type { InstanceRecordElement, InstanceView, PendingTimer, VersionSummary } from "../api/types.js";
import type { Route } from "../routing.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { labelText } from "./instancesLogic.js";
import { t, tFill } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

interface InstanceScreenProps {
  instanceId: string;
  navigate: (route: Route) => void;
  token: string;
  locale: UiLocale;
  onUnauthorized: () => void;
}

const RECORD_PAGE_LIMIT = 200;
// ponytail: no per-instance timer read exists over HTTP (GET /admin/timers has
// no instanceId filter — see admin-operations-api's three admin-queries.ts
// functions). A generous single page covers the pending-timer backlog any
// real deployment carries; add an instanceId filter if that stops holding.
const TIMERS_SCAN_LIMIT = 200;

/** transitionSeq and claim state have no single-instance read of their own —
 * both are derived from however much of the record has loaded, latest wins. */
function deriveFromRecord(items: InstanceRecordElement[]): { transitionSeq?: number; claimedBy?: string | null } {
  let transitionSeq: number | undefined;
  let claimedBy: string | null | undefined;
  for (const el of items) {
    if (el.kind === "transition") transitionSeq = el.entry.transitionSeq;
    if (el.kind === "event" && el.event.kind === "assignment.claimed") claimedBy = el.event.payload.actorId;
    if (el.kind === "event" && el.event.kind === "assignment.released") claimedBy = null;
    if (el.kind === "event" && el.event.kind === "assignment.delegated") claimedBy = el.event.payload.toActorId;
  }
  return { transitionSeq, claimedBy };
}

/**
 * One record line, built from engine vocabulary alone. `transition` and `event`
 * name the two record kinds, `actions` and `attempts` name fields, and the
 * cause, the event kind and every id are values the engine stores. None of it
 * enters the catalog, so this stays pure and locale-free.
 */
function describeElement(el: InstanceRecordElement): { at: string; summary: string; detail: string } {
  if (el.kind === "transition") {
    const e = el.entry;
    const actions = (e.actions ?? []).map((a) => `${a.resolvedHandler}:${a.status} (attempts ${a.attempts})`).join(", ");
    return {
      at: e.at,
      summary: `transition — ${e.cause}${e.pathId ? ` via ${e.pathId}` : ""} — ${e.fromStepId ?? "(start)"} → ${e.toStepId}`,
      detail: actions ? `actions: ${actions}` : "",
    };
  }
  const ev = el.event;
  return { at: ev.at, summary: `event — ${ev.kind}`, detail: JSON.stringify(ev.payload) };
}

export function InstanceScreen({ instanceId, navigate, token, locale, onUnauthorized }: InstanceScreenProps) {
  const [view, setView] = useState<InstanceView | undefined>(undefined);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  // baseLocale is process-level, not carried by InstanceView itself — resolved
  // via GET /processes so the step label renders in the process's own base
  // locale rather than an arbitrary object-key order.
  const [baseLocale, setBaseLocale] = useState<string | undefined>(undefined);
  const [record, setRecord] = useState<InstanceRecordElement[]>([]);
  const [recordCursor, setRecordCursor] = useState<string | undefined>(undefined);
  const [timer, setTimer] = useState<PendingTimer | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cancelling, setCancelling] = useState(false);
  const [redacting, setRedacting] = useState(false);
  const { reloadToken, refresh } = useRefresh();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const v = await getInstanceView(instanceId, token);
      setView(v);
      const [vs, rec, timers, processes] = await Promise.all([
        listVersions(v.processId, token),
        getInstanceRecord(instanceId, token, { limit: RECORD_PAGE_LIMIT }),
        listPendingTimers(token, { limit: TIMERS_SCAN_LIMIT }),
        listProcesses(token),
      ]);
      setVersions(vs);
      setRecord(rec.items);
      setRecordCursor(rec.cursor);
      setTimer(timers.items.find((t) => t.instanceId === instanceId));
      setBaseLocale(processes.find((p) => p.processId === v.processId)?.baseLocale);
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [instanceId, token, locale, onUnauthorized]);

  const loadMoreRecord = useCallback(async () => {
    if (!recordCursor) return;
    setLoading(true);
    setError(undefined);
    try {
      const rec = await getInstanceRecord(instanceId, token, { limit: RECORD_PAGE_LIMIT, cursor: recordCursor });
      setRecord((prev) => [...prev, ...rec.items]);
      setRecordCursor(rec.cursor);
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
    } finally {
      setLoading(false);
    }
  }, [instanceId, token, recordCursor, locale, onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const doCancel = async () => {
    setCancelling(true);
    try {
      await cancelInstance(instanceId, token);
      refresh();
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
    } finally {
      setCancelling(false);
    }
  };

  const doRedact = async () => {
    if (!window.confirm(t(locale, "instance.redactConfirm"))) return;
    setRedacting(true);
    try {
      await redactInstance(instanceId, token);
      refresh();
    } catch (err) {
      if (err instanceof AdminClientError && err.status === 401) onUnauthorized();
      else setError(describeCaughtError(err, locale));
    } finally {
      setRedacting(false);
    }
  };

  if (!view) {
    return (
      <main className="admin-screen">
        <button type="button" className="btn btn-ghost admin-back" onClick={() => navigate({ name: "instances" })}>
          {t(locale, "instance.back")}
        </button>
        {loading && <p>{t(locale, "common.loading")}</p>}
        {!loading && error && (
          <div className="admin-error-banner" role="alert">
            <span className="admin-error-banner-stamp">{t(locale, "common.failed")}</span>
            <span className="admin-error-banner-message">{error}</span>
            <button type="button" className="btn btn-secondary" onClick={refresh}>
              {t(locale, "common.retry")}
            </button>
          </div>
        )}
        {!loading && !error && <p className="admin-empty">{t(locale, "instance.notFound")}</p>}
      </main>
    );
  }

  const definitionHash = versions.find((v) => v.version === view.version)?.definitionHash ?? "—";
  const derived = deriveFromRecord(record);

  return (
    <main className="admin-screen">
      <button type="button" className="btn btn-ghost admin-back" onClick={() => navigate({ name: "instances" })}>
        {t(locale, "instance.back")}
      </button>
      <h1>{instanceId}</h1>

      <dl className="admin-detail-header">
        <div>
          <dt>{t(locale, "instance.process")}</dt>
          <dd>{view.processId}</dd>
        </div>
        <div>
          <dt>{t(locale, "instance.version")}</dt>
          <dd>{view.version}</dd>
        </div>
        <div>
          <dt>{t(locale, "instance.definitionHash")}</dt>
          <dd>{definitionHash}</dd>
        </div>
        <div>
          <dt>{t(locale, "instance.status")}</dt>
          <dd>
            <span className={`admin-badge admin-badge-${view.status}`}>{view.status}</span>
          </dd>
        </div>
        <div>
          <dt>{t(locale, "instance.currentStep")}</dt>
          <dd>{(baseLocale ? labelText(view.step.label, baseLocale) : "") || view.step.key}</dd>
        </div>
        <div>
          <dt>{t(locale, "instance.transitionSeq")}</dt>
          <dd>{derived.transitionSeq ?? "—"}</dd>
        </div>
        <div>
          <dt>{t(locale, "instance.claimState")}</dt>
          <dd>{derived.claimedBy ? tFill(locale, "instance.claimedBy", { actor: derived.claimedBy }) : t(locale, "instance.unclaimed")}</dd>
        </div>
        <div>
          <dt>{t(locale, "instance.armedTimer")}</dt>
          <dd>{timer ? new Date(timer.nextTimerAt).toLocaleString(locale) : t(locale, "instance.noTimer")}</dd>
        </div>
        {view.redactedAt && (
          <div>
            <dt>{t(locale, "instance.dataRedaction")}</dt>
            <dd>
              <span className="admin-badge admin-badge-redacted">
                {tFill(locale, "instance.redactedOn", { at: new Date(view.redactedAt).toLocaleString(locale) })}
              </span>
            </dd>
          </div>
        )}
      </dl>

      {view.status === "running" && (
        <button type="button" className="btn btn-secondary btn-destructive" onClick={() => void doCancel()} disabled={cancelling}>
          {t(locale, "instance.cancel")}
        </button>
      )}
      {view.status !== "running" && (
        <button type="button" className="btn btn-secondary btn-destructive" onClick={() => void doRedact()} disabled={redacting || !!view.redactedAt}>
          {t(locale, "instance.redact")}
        </button>
      )}
      <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
        {t(locale, "common.refresh")}
      </button>

      {error && (
        <div className="admin-error-banner" role="alert">
          <span className="admin-error-banner-stamp">{t(locale, "common.failed")}</span>
          <span className="admin-error-banner-message">{error}</span>
          <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
            {t(locale, "common.retry")}
          </button>
        </div>
      )}

      <h2>{t(locale, "instance.recordTitle")}</h2>
      {record.length === 0 && !loading && !error && <p className="admin-empty">{t(locale, "instance.recordEmpty")}</p>}
      <ul className="admin-timeline">
        {record.map((el, i) => {
          const d = describeElement(el);
          return (
            <li key={i}>
              <div className="admin-timeline-meta">{new Date(d.at).toLocaleString(locale)}</div>
              <div>{d.summary}</div>
              {d.detail && <div className="admin-timeline-meta">{d.detail}</div>}
            </li>
          );
        })}
      </ul>
      {recordCursor && (
        <div className="admin-load-more">
          <button type="button" className="btn btn-secondary" onClick={() => void loadMoreRecord()} disabled={loading}>
            {t(locale, "instance.loadMoreHistory")}
          </button>
        </div>
      )}
    </main>
  );
}
