import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import {
  cancelInstance,
  redactInstance,
  getInstanceRecord,
  getInstanceView,
  listInstanceAudit,
  listPendingTimers,
  listProcesses,
  listVersions,
  verifyInstanceAudit,
} from "../api/client.js";
import type { AuditEntry, AuditVerifyResult, InstanceRecordElement, InstanceView, PendingTimer, VersionSummary } from "../api/types.js";
import { describeRecordElement } from "../../../api/record.js";
import type { Route } from "../routing.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { usePagedList } from "../../../shell/usePagedList.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import { labelText } from "./instancesLogic.js";
import { t, tFill } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { InstanceStatus } from "../api/types.js";

interface InstanceScreenProps {
  instanceId: string;
  navigate: (route: Route) => void;
  token: string;
  locale: UiLocale;
  onUnauthorized: () => void;
}

const RECORD_PAGE_LIMIT = 200;
const AUDIT_PAGE_LIMIT = 200;

/** `app.css`'s screen/detail-header/timeline/badge rules, as StyleX.
 * `InstanceStatus` is a closed union, so `badgeTone` is exhaustive
 * (design.md D3). */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  back: {
    display: "block",
    paddingLeft: 0,
    marginBottom: space.s3,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  detailHeader: {
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.divider,
    padding: space.s3,
    marginBottom: space.s4,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(10rem, 1fr))",
    gap: space.s3,
  },
  detailTerm: {
    fontSize: "0.7rem",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    margin: 0,
  },
  detailValue: {
    margin: 0,
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
    wordBreak: "break-all",
  },
  badge: {
    display: "inline-block",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
  },
  badgeOpen: {
    color: colors.accent,
  },
  badgeSettled: {
    color: colors.text,
  },
  badgeDormant: {
    color: { default: "#726e6e", "@media (prefers-color-scheme: dark)": colors.neutral500 },
  },
  badgeRefusal: {
    color: colors.surface,
    backgroundColor: colors.refusal,
    borderColor: colors.refusal,
  },
  loadMore: {
    marginTop: space.s3,
  },
  timeline: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  timelineItem: {
    paddingBlock: space.s2,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    fontSize: "0.9rem",
  },
  timelineMeta: {
    color: colors.textMuted,
    fontSize: "0.8rem",
    fontFamily: fonts.body,
  },
  timelineKey: {
    fontFamily: fonts.mono,
  },
});

const badgeTone: Record<InstanceStatus, typeof styles.badgeOpen> = {
  running: styles.badgeOpen,
  completed: styles.badgeSettled,
  cancelled: styles.badgeDormant,
  faulted: styles.badgeRefusal,
};

/** A `string` prints bare; anything else (number, boolean, or JSON `null`) prints as its JSON literal, so an authored `null` reads as the text "null". */
function formatAuditValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
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
 * `describeRecordElement`'s `{at, summary}` plus the one field only this
 * screen renders: `actions` and `attempts` name fields, the cause, the event
 * kind and every id are values the engine stores, and none of it enters the
 * catalog, so this stays pure and locale-free.
 */
function describeElement(el: InstanceRecordElement): { at: string; summary: string; detail: string } {
  const { at, summary } = describeRecordElement(el);
  if (el.kind === "transition") {
    const actions = (el.entry.actions ?? []).map((a) => `${a.resolvedHandler}:${a.status} (attempts ${a.attempts})`).join(", ");
    return { at, summary, detail: actions ? `actions: ${actions}` : "" };
  }
  return { at, summary, detail: JSON.stringify(el.event.payload) };
}

export function InstanceScreen({ instanceId, navigate, token, locale, onUnauthorized }: InstanceScreenProps) {
  const [view, setView] = useState<InstanceView | undefined>(undefined);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  // baseLocale is process-level, not carried by InstanceView itself — resolved
  // via GET /processes so the step label renders in the process's own base
  // locale rather than an arbitrary object-key order.
  const [baseLocale, setBaseLocale] = useState<string | undefined>(undefined);
  const [timer, setTimer] = useState<PendingTimer | undefined>(undefined);
  const [verify, setVerify] = useState<AuditVerifyResult | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [cancelling, setCancelling] = useState(false);
  const [redacting, setRedacting] = useState(false);
  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  // A pure paged fetch, unlike `load` below: `getInstanceRecord`'s own page,
  // continuing from wherever `load`'s compound fetch left the cursor (see the
  // `reset` call in `load`). Errors route through the same `fail`/`error`
  // pair `load` uses, so one banner covers both.
  const fetchRecordPage = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      try {
        const rec = await getInstanceRecord(instanceId, token, { limit: RECORD_PAGE_LIMIT, cursor });
        return { items: rec.items, cursor: rec.cursor };
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [instanceId, token, fail],
  );
  const recordList = usePagedList<InstanceRecordElement>(fetchRecordPage);
  const { reset: resetRecordList } = recordList;

  // Same shape as `fetchRecordPage`: a pure paged fetch feeding `auditList`
  // below. The chain's verified/failed state is a separate call (`verify`,
  // fetched once in `load`), not part of this page — paging the entries
  // never re-triggers a chain scan.
  const fetchAuditPage = useCallback(
    async (cursor?: string) => {
      setError(undefined);
      try {
        const page = await listInstanceAudit(instanceId, token, { limit: AUDIT_PAGE_LIMIT, cursor });
        return { items: page.items, cursor: page.cursor };
      } catch (err) {
        fail(err);
        throw err;
      }
    },
    [instanceId, token, fail],
  );
  const auditList = usePagedList<AuditEntry>(fetchAuditPage);
  const { reset: resetAuditList } = auditList;

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const v = await getInstanceView(instanceId, token);
      setView(v);
      const [vs, rec, timers, processes, audit, verifyResult] = await Promise.all([
        listVersions(v.processId, token),
        getInstanceRecord(instanceId, token, { limit: RECORD_PAGE_LIMIT }),
        listPendingTimers(token, { limit: TIMERS_SCAN_LIMIT }),
        listProcesses(token),
        listInstanceAudit(instanceId, token, { limit: AUDIT_PAGE_LIMIT }),
        verifyInstanceAudit(instanceId, token),
      ]);
      setVersions(vs);
      // Seeds the hook's own items/cursor from the page this compound fetch
      // already retrieved, so `recordList.loadMore()`'s first call continues
      // from here instead of refetching page one.
      resetRecordList(rec.items, rec.cursor);
      resetAuditList(audit.items, audit.cursor);
      setTimer(timers.items.find((t) => t.instanceId === instanceId));
      setVerify(verifyResult);
      setBaseLocale(processes.find((p) => p.processId === v.processId)?.baseLocale);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [instanceId, token, locale, fail, resetRecordList, resetAuditList]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const doCancel = async () => {
    setCancelling(true);
    try {
      await cancelInstance(instanceId, token);
      refresh();
    } catch (err) {
      fail(err);
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
      fail(err);
    } finally {
      setRedacting(false);
    }
  };

  if (!view) {
    return (
      <main {...stylex.props(styles.screen)}>
        <button
          type="button"
          className={`btn btn-ghost ${stylex.props(styles.back).className}`}
          style={stylex.props(styles.back).style}
          onClick={() => navigate({ name: "instances" })}
        >
          {t(locale, "instance.back")}
        </button>
        {loading && <p>{t(locale, "common.loading")}</p>}
        {!loading && error && <ErrorBanner error={error} locale={locale} onRetry={refresh} />}
        {!loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "instance.notFound")}</p>}
      </main>
    );
  }

  const definitionHash = versions.find((v) => v.version === view.version)?.definitionHash ?? "—";
  const derived = deriveFromRecord(recordList.items);

  return (
    <main {...stylex.props(styles.screen)}>
      <button
        type="button"
        className={`btn btn-ghost ${stylex.props(styles.back).className}`}
        style={stylex.props(styles.back).style}
        onClick={() => navigate({ name: "instances" })}
      >
        {t(locale, "instance.back")}
      </button>
      <h1>{instanceId}</h1>

      <dl {...stylex.props(styles.detailHeader)}>
        <div>
          <dt {...stylex.props(styles.detailTerm)}>{t(locale, "instance.process")}</dt>
          <dd {...stylex.props(styles.detailValue)}>{view.processId}</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailTerm)}>{t(locale, "instance.version")}</dt>
          <dd {...stylex.props(styles.detailValue)}>{view.version}</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailTerm)}>{t(locale, "instance.definitionHash")}</dt>
          <dd {...stylex.props(styles.detailValue)}>{definitionHash}</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailTerm)}>{t(locale, "instance.status")}</dt>
          <dd {...stylex.props(styles.detailValue)}>
            <span {...stylex.props(styles.badge, badgeTone[view.status])}>{view.status}</span>
          </dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailTerm)}>{t(locale, "instance.currentStep")}</dt>
          <dd {...stylex.props(styles.detailValue)}>{(baseLocale ? labelText(view.step.label, baseLocale) : "") || view.step.key}</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailTerm)}>{t(locale, "instance.transitionSeq")}</dt>
          <dd {...stylex.props(styles.detailValue)}>{derived.transitionSeq ?? "—"}</dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailTerm)}>{t(locale, "instance.claimState")}</dt>
          <dd {...stylex.props(styles.detailValue)}>
            {derived.claimedBy ? tFill(locale, "instance.claimedBy", { actor: derived.claimedBy }) : t(locale, "instance.unclaimed")}
          </dd>
        </div>
        <div>
          <dt {...stylex.props(styles.detailTerm)}>{t(locale, "instance.armedTimer")}</dt>
          <dd {...stylex.props(styles.detailValue)}>{timer ? new Date(timer.nextTimerAt).toLocaleString(locale) : t(locale, "instance.noTimer")}</dd>
        </div>
        {view.redactedAt && (
          <div>
            <dt {...stylex.props(styles.detailTerm)}>{t(locale, "instance.dataRedaction")}</dt>
            <dd {...stylex.props(styles.detailValue)}>
              <span {...stylex.props(styles.badge, styles.badgeDormant)}>
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

      {error && <ErrorBanner error={error} locale={locale} onRetry={refresh} retryDisabled={loading} />}

      <h2>{t(locale, "instance.recordTitle")}</h2>
      {recordList.items.length === 0 && !loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "instance.recordEmpty")}</p>}
      <ul {...stylex.props(styles.timeline)}>
        {recordList.items.map((el, i) => {
          const d = describeElement(el);
          return (
            <li key={i} {...stylex.props(styles.timelineItem)}>
              <div {...stylex.props(styles.timelineMeta)}>{new Date(d.at).toLocaleString(locale)}</div>
              <div>{d.summary}</div>
              {d.detail && <div {...stylex.props(styles.timelineMeta)}>{d.detail}</div>}
            </li>
          );
        })}
      </ul>
      {recordList.cursor && (
        <div {...stylex.props(styles.loadMore)}>
          <button type="button" className="btn btn-secondary" onClick={() => void recordList.loadMore()} disabled={loading || recordList.loading}>
            {t(locale, "instance.loadMoreHistory")}
          </button>
        </div>
      )}

      <h2>
        {t(locale, "audit.title")}{" "}
        {verify &&
          (verify.ok ? (
            <span {...stylex.props(styles.badge, styles.badgeSettled)}>{t(locale, "audit.verified")}</span>
          ) : (
            <span {...stylex.props(styles.badge, styles.badgeRefusal)}>{tFill(locale, "audit.verificationFailed", { seq: verify.failedSeq ?? "?" })}</span>
          ))}
      </h2>
      {auditList.items.length === 0 && !loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "audit.empty")}</p>}
      <ul {...stylex.props(styles.timeline)}>
        {auditList.items.map((e) => (
          <li key={e.seq} {...stylex.props(styles.timelineItem)}>
            <div {...stylex.props(styles.timelineMeta)}>
              {new Date(e.at).toLocaleString(locale)} · <code {...stylex.props(styles.timelineKey)}>{e.actor ?? "—"}</code> ·{" "}
              <code {...stylex.props(styles.timelineKey)}>{e.source ?? "—"}</code>
            </div>
            <div>
              <code {...stylex.props(styles.timelineKey)}>{e.fieldId}</code> {t(locale, e.op === "redact" ? "audit.opRedact" : "audit.opSet")}{" "}
              {"value" in e ? (
                <code {...stylex.props(styles.timelineKey)}>{formatAuditValue(e.value)}</code>
              ) : (
                <span {...stylex.props(styles.badge, styles.badgeDormant)}>{t(locale, "audit.redacted")}</span>
              )}
            </div>
            {e.reason && <div {...stylex.props(styles.timelineMeta)}>{tFill(locale, "audit.reason", { reason: e.reason })}</div>}
          </li>
        ))}
      </ul>
      {auditList.cursor && (
        <div {...stylex.props(styles.loadMore)}>
          <button type="button" className="btn btn-secondary" onClick={() => void auditList.loadMore()} disabled={loading || auditList.loading}>
            {t(locale, "audit.loadMore")}
          </button>
        </div>
      )}
    </main>
  );
}
