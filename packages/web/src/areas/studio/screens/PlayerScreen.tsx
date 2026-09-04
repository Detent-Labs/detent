import { useCallback, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { FieldForm, PathButtons, filterToEditable, resolveFieldsLocale, isResolvedViewField } from "form-ui";
import type { SubmissionIssue } from "form-ui";
import { createInstance, createTestInstance, getInstanceView, submitPath, claimStep, releaseClaim, getInstanceRecord, StudioClientError } from "../api/client.js";
import type { InstanceView, InstanceRecordElement } from "../api/types.js";
import { seedFormValues, createAndOpenInstance, isTestInstance } from "./playerLogic.js";
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

const styles = stylex.create({
  studioScreen: {
    maxWidth: "60rem",
    marginInline: "auto",
    marginBlock: 0,
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  // The screen is the size container the two-pane fold measures. A
  // container query matches descendants, so this cannot sit on the layout
  // element it governs.
  studioPlayerScreen: {
    containerType: "inline-size",
    containerName: "studio-player",
  },
  studioBack: {
    display: "block",
    paddingLeft: 0,
    marginBottom: space.s3,
  },
  studioControls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
  studioError: {
    color: colors.refusal,
  },
  studioPlayerLayout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) minmax(0, 1fr)",
      "@container studio-player (max-width: 64rem)": "1fr",
    },
    gap: space.s6,
    alignItems: "start",
  },
  studioConflict: {
    border: `2px solid ${colors.refusal}`,
    paddingBlock: space.s3,
    paddingInline: space.s3,
    marginBlock: space.s3,
    marginInline: 0,
    color: colors.refusal,
  },
  studioPlayerTestBadge: {
    display: "inline-block",
    fontFamily: fonts.mono,
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    border: "2px solid currentcolor",
    paddingBlock: "2px",
    paddingInline: "7px",
    color: colors.accent,
  },
  studioEmpty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  studioDiff: {
    listStyle: "none",
    marginBlockStart: space.s3,
    marginBlockEnd: 0,
    marginInline: 0,
    padding: 0,
    fontSize: "0.85rem",
  },
  studioDiffItem: {
    paddingBlock: space.s1,
    paddingInline: 0,
    borderBottom: `1px solid ${colors.border}`,
  },
  studioDiffCode: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
  },
});

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
      const { instanceId: id, view } = await createAndOpenInstance(
        () => createInstance(processId, token),
        (i) => getInstanceView(i, token),
      );
      applyView(id, view);
    });

  const doCreateTest = () =>
    withErrorHandling(async () => {
      const { instanceId: id, view } = await createAndOpenInstance(
        () => createTestInstance(processId, token),
        (i) => getInstanceView(i, token),
      );
      applyView(id, view);
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

  const fieldIds = new Set(view?.fields.filter(isResolvedViewField).map((f) => f.field.id) ?? []);
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
    <main {...stylex.props(styles.studioScreen, styles.studioPlayerScreen)}>
      <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBack)} onClick={() => navigate({ name: "edit", processId })}>
        ← Back to process
      </button>
      <h1>Player</h1>

      <fieldset>
        <legend>Instance access</legend>
        <div {...stylex.props(styles.studioControls)}>
          <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void doCreate()}>
            Create new instance
          </button>
          <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void doCreateTest()}>
            Create test instance
          </button>
        </div>
        <label>
          Open existing instance id
          <input type="text" value={openInstanceIdInput} onChange={(e) => setOpenInstanceIdInput(e.target.value)} />
        </label>
        <div {...stylex.props(styles.studioControls)}>
          <button type="button" className="btn btn-secondary" disabled={loading || !openInstanceIdInput} onClick={() => void doOpen()}>
            Open
          </button>
        </div>
      </fieldset>

      {outcome && <p {...stylex.props(styles.studioError)}>{outcome}</p>}
      {unmatchedIssues.length > 0 && (
        <ul {...stylex.props(styles.studioError)}>
          {unmatchedIssues.map((issue, i) => (
            <li key={i}>
              {issue.fieldId}: {issue.kind}
            </li>
          ))}
        </ul>
      )}

      {view && instanceId && (
        <div {...stylex.props(styles.studioPlayerLayout)}>
          <section className="studio-player-form">
            <p {...stylex.props(styles.studioConflict)}>
              instance {instanceId} · step {view.step.key} · status {view.status}
              {isTestInstance(view) && (
                <>
                  {" "}
                  <span {...stylex.props(styles.studioPlayerTestBadge)}>Test</span>
                </>
              )}
            </p>

            <FieldForm
              fields={resolveFieldsLocale(view.fields, "en", view.baseLocale)}
              values={formValues}
              onChange={(fieldId, value) => setFormValues((v) => ({ ...v, [fieldId]: value }))}
              locale="en"
              issuesByField={issuesByField}
              columns={view.columns ?? 1}
            />

            <div {...stylex.props(styles.studioControls)}>
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
            {recordError && <p {...stylex.props(styles.studioError)}>{recordError}</p>}
            {record.length === 0 && !recordError && <p {...stylex.props(styles.studioEmpty)}>No history yet.</p>}
            <ul {...stylex.props(styles.studioDiff)}>
              {record.map((el, i) => {
                const d = describeRecordElement(el);
                return (
                  <li key={i} {...stylex.props(styles.studioDiffItem)}>
                    <code {...stylex.props(styles.studioDiffCode)}>{new Date(d.at).toLocaleString()}</code> — {d.summary}
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
