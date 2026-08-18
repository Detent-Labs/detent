import { useCallback, useState } from "react";
import { FieldForm, PathButtons, filterToEditable } from "form-ui";
import type { SubmissionIssue } from "form-ui";
import { createInstance, getInstanceView, submitPath, claimStep, releaseClaim, getInstanceRecord, StudioClientError } from "../api/client.js";
import type { InstanceView, InstanceRecordElement } from "../api/types.js";
import { seedFormValues } from "./playerLogic.js";
import { describeRecordElement } from "../../../api/record.js";
import type { Route } from "../routing.js";
import { describeError, describeCaughtError } from "../errors.js";
import { t } from "../catalog.js";
import { is401, useFail } from "../../../shell/useFail.js";

interface PlayerScreenProps {
  processId: string;
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

const RECORD_PAGE_LIMIT = 100;

/** studio-player spec: drives a real instance through the Runtime API Layer, shown beside its merged transition/event record. */
export function PlayerScreen({ processId, token, navigate, onUnauthorized }: PlayerScreenProps) {
  const [instanceId, setInstanceId] = useState<string | undefined>(undefined);
  const [view, setView] = useState<InstanceView | undefined>(undefined);
  const [claimedByMe, setClaimedByMe] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [record, setRecord] = useState<InstanceRecordElement[]>([]);
  const [recordCursor, setRecordCursor] = useState<string | undefined>(undefined);
  const [recordError, setRecordError] = useState<string | undefined>(undefined);
  const [openInstanceIdInput, setOpenInstanceIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<string | undefined>(undefined);
  const [validationIssues, setValidationIssues] = useState<SubmissionIssue[]>([]);
  const failRecord = useFail(onUnauthorized, (e) => setRecordError(describeCaughtError(e)));

  const loadRecord = useCallback(
    (id: string) => {
      getInstanceRecord(id, token, { limit: RECORD_PAGE_LIMIT })
        .then((page) => {
          setRecord(page.items);
          setRecordCursor(page.cursor);
          setRecordError(undefined);
        })
        .catch(failRecord);
    },
    [token, failRecord],
  );

  const applyView = useCallback(
    (id: string, next: InstanceView) => {
      setInstanceId(id);
      setView(next);
      setClaimedByMe(false);
      setFormValues(seedFormValues(next.fields));
      loadRecord(id);
    },
    [loadRecord],
  );

  const withErrorHandling = useCallback(
    async (fn: () => Promise<void>) => {
      setLoading(true);
      setOutcome(undefined);
      setValidationIssues([]);
      try {
        await fn();
      } catch (err) {
        // This ladder tests `validation` and the claim-state fields after the
        // 401 branch, which `useFail`'s void callback can't express — so it
        // keeps its own check, sharing only the `is401` predicate the hook
        // exports.
        if (is401(err)) {
          onUnauthorized();
          return;
        }
        if (err instanceof StudioClientError) {
          if (err.error.type === "validation") {
            setValidationIssues(err.error.issues);
            return;
          }
          setOutcome(describeError(err.error));
          if (err.error.type === "not-claimant" || err.error.type === "not-claimed" || err.error.type === "already-claimed") {
            setClaimedByMe(false);
          }
          return;
        }
        setOutcome(t("error.generic"));
      } finally {
        setLoading(false);
      }
    },
    [onUnauthorized],
  );

  const doCreate = () =>
    withErrorHandling(async () => {
      const created = await createInstance(processId, token);
      const fresh = await getInstanceView(created.instanceId, token);
      applyView(created.instanceId, fresh);
    });

  const doOpen = () =>
    withErrorHandling(async () => {
      const fresh = await getInstanceView(openInstanceIdInput, token);
      applyView(openInstanceIdInput, fresh);
    });

  const doRefresh = () =>
    withErrorHandling(async () => {
      if (!instanceId) return;
      const fresh = await getInstanceView(instanceId, token);
      applyView(instanceId, fresh);
    });

  const doClaim = () =>
    withErrorHandling(async () => {
      if (!instanceId) return;
      await claimStep(instanceId, token);
      setClaimedByMe(true);
    });

  const doRelease = () =>
    withErrorHandling(async () => {
      if (!instanceId) return;
      await releaseClaim(instanceId, token);
      setClaimedByMe(false);
    });

  const doSubmit = (pathId: string) =>
    withErrorHandling(async () => {
      if (!instanceId || !view) return;
      await submitPath(instanceId, pathId, filterToEditable(formValues, view.fields), token);
      const fresh = await getInstanceView(instanceId, token);
      applyView(instanceId, fresh);
    });

  const loadMoreRecord = useCallback(() => {
    if (!instanceId || !recordCursor) return;
    getInstanceRecord(instanceId, token, { limit: RECORD_PAGE_LIMIT, cursor: recordCursor })
      .then((page) => {
        setRecord((prev) => [...prev, ...page.items]);
        setRecordCursor(page.cursor);
      })
      .catch(failRecord);
  }, [instanceId, recordCursor, token, failRecord]);

  const fieldIds = new Set(view?.fields.map((f) => f.field.id) ?? []);
  const issuesByField = new Map<string, SubmissionIssue[]>();
  const unmatchedIssues: SubmissionIssue[] = [];
  for (const issue of validationIssues) {
    if (fieldIds.has(issue.fieldId)) {
      const arr = issuesByField.get(issue.fieldId) ?? [];
      arr.push(issue);
      issuesByField.set(issue.fieldId, arr);
    } else {
      unmatchedIssues.push(issue);
    }
  }

  return (
    // `studio-player-screen` is the size container the two-pane fold measures.
    <main className="studio-screen studio-player-screen">
      <button type="button" className="btn btn-ghost studio-back" onClick={() => navigate({ name: "edit", processId })}>
        ← Back to process
      </button>
      <h1>Player</h1>

      <fieldset>
        <legend>Instance access</legend>
        <div className="studio-controls">
          <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void doCreate()}>
            Create new instance
          </button>
        </div>
        <label>
          Open existing instance id
          <input type="text" value={openInstanceIdInput} onChange={(e) => setOpenInstanceIdInput(e.target.value)} />
        </label>
        <div className="studio-controls">
          <button type="button" className="btn btn-secondary" disabled={loading || !openInstanceIdInput} onClick={() => void doOpen()}>
            Open
          </button>
        </div>
      </fieldset>

      {outcome && <p className="studio-error">{outcome}</p>}
      {unmatchedIssues.length > 0 && (
        <ul className="studio-error">
          {unmatchedIssues.map((issue, i) => (
            <li key={i}>
              {issue.fieldId}: {issue.kind}
            </li>
          ))}
        </ul>
      )}

      {view && instanceId && (
        <div className="studio-player-layout">
          <section className="studio-player-form">
            <p className="studio-conflict">
              instance {instanceId} · step {view.step.key} · status {view.status}
            </p>

            <FieldForm fields={view.fields} values={formValues} onChange={(fieldId, value) => setFormValues((v) => ({ ...v, [fieldId]: value }))} locale="en" issuesByField={issuesByField} columns={view.columns ?? 1} />

            <div className="studio-controls">
              {!claimedByMe && (
                <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void doClaim()}>
                  Claim
                </button>
              )}
              {claimedByMe && (
                <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void doRelease()}>
                  Release
                </button>
              )}
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void doRefresh()}>
                Refresh
              </button>
            </div>

            <PathButtons paths={view.availablePaths} onSubmit={(pathId) => void doSubmit(pathId)} loading={loading} />
          </section>

          <section className="studio-player-record">
            <h2>Record</h2>
            {recordError && <p className="studio-error">{recordError}</p>}
            {record.length === 0 && !recordError && <p className="studio-empty">No history yet.</p>}
            <ul className="studio-diff">
              {record.map((el, i) => {
                const d = describeRecordElement(el);
                return (
                  <li key={i}>
                    <code>{new Date(d.at).toLocaleString()}</code> — {d.summary}
                  </li>
                );
              })}
            </ul>
            {recordCursor && (
              <button type="button" className="btn btn-secondary" onClick={() => loadMoreRecord()}>
                Load more
              </button>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
