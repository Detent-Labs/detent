import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import {
  FieldForm,
  PathButtons,
  filterToEditable,
  firstTabWithIssue,
  resolveFieldsLocale,
  resolveTabsLocale,
  resolveText,
  isResolvedViewField,
  tabIssueFieldCount,
  tabSwitchAnnouncement,
  tabSwitchState,
} from "form-ui";
import type { SubmissionIssue, TabSwitch } from "form-ui";
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
  // Instance access frames its own controls, and did so with the UA's `2px
  // groove` until `global.css` cleared it for every fieldset. The frame is
  // this screen's own intent, so it states it: the 1px hairline in the
  // border role, the same rule `EditScreen`'s `canvasRegion` and the migration
  // editor's map section carry.
  panel: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  studioBack: {
    display: "block",
    paddingLeft: 0,
    marginBottom: space.s3,
  },
  // Off screen, never `display: none`: a hidden node is announced by no
  // engine. `ProcessTabRow.tsx` carries the same pattern for the same reason.
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
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.refusal,
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
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
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
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
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
  const [activeTab, setActiveTab] = useState<string | undefined>(undefined);
  // What the live region below reads out after a failed submission opened a
  // tab the operator did not choose. Data, not a sentence: the sentence needs
  // the resolved tab label the render body already builds. `undefined` is
  // silence, which is what an operator's own tab click leaves behind, and
  // what a submission that opened nothing leaves behind.
  const [tabSwitch, setTabSwitch] = useState<TabSwitch | undefined>(undefined);
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

  // Built once per render and read from both the tab-switch effect below and
  // the JSX return: `fieldIds`/`unmatchedIssues` split raw server issues into
  // the ones a rendered field owns and the ones nothing on this view claims.
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

  // A required field on an unopened tab otherwise blocks the submission with
  // nothing on screen to explain it (form-view-tabs design.md, "The issue
  // switch belongs to the consumer"). Keyed on `validationIssues` alone, NOT
  // on `issuesByField` above: that Map is a fresh object every render, and
  // keying this effect on it would re-run it, and so re-call
  // `firstTabWithIssue`, on every unrelated re-render (record paging, a
  // refresh) — forcing the operator back onto the offending tab even after
  // they had deliberately switched away from it while the same stale issues
  // sat in state. `form-tab-switch-effect.test.ts` pins this dependency
  // list; `form-ui`'s own `tabs.test.tsx` covers the decision itself.
  useEffect(() => {
    if (!view) return;
    const nextTab = firstTabWithIssue(view.fields, view.tabs ?? [], issuesByField);
    if (nextTab !== undefined) setActiveTab(nextTab);
    // `activeTab` read from this render's own closure, not from the
    // dependency list: the effect re-runs on a new `validationIssues`, and
    // the render that hands it that array carries the tab the operator is
    // standing on. `tabSwitchState` answers `undefined` when that tab is
    // already the one the issues name, so the region below never reports an
    // opening nobody saw.
    const fieldCount = nextTab === undefined ? 0 : tabIssueFieldCount(view.fields, nextTab, issuesByField);
    setTabSwitch((prev) => tabSwitchState(prev, view.fields, view.tabs ?? [], activeTab, nextTab, fieldCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validationIssues, view]);

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

  return (
    <main {...stylex.props(styles.studioScreen, styles.studioPlayerScreen)}>
      <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBack)} onClick={() => navigate({ name: "edit", processId })}>
        ← Back to process
      </button>
      <h1>Player</h1>

      <fieldset {...stylex.props(styles.panel)}>
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
              tabs={resolveTabsLocale(view.tabs ?? [], "en", view.baseLocale)}
              activeTab={activeTab}
              onTabChange={(tabKey) => {
                setActiveTab(tabKey);
                // A tab the operator chose announces nothing: they watched it
                // open. The repeat case is the `attempt` key below, not this
                // clear.
                setTabSwitch(undefined);
              }}
              tabsLabel={t("player.formTabsLabel")}
            />

            {/* Outside the form, and mounted at all times so the engine
                announces a change rather than an arrival. Polite: the
                operator has just pressed a path button and is not mid-sentence
                with anything else. The literal "en" is this screen's own
                locale everywhere, `resolveText` included. */}
            <p {...stylex.props(styles.visuallyHidden)} role="status" aria-live="polite">
              {tabSwitch === undefined ? (
                ""
              ) : (
                // Keyed on the attempt: a second failed submission naming the
                // same tab and the same count builds the same sentence, and
                // React writes no DOM for an unchanged string. The key
                // replaces the node instead, which is the mutation the engine
                // speaks.
                <span key={tabSwitch.attempt}>
                  {tabSwitchAnnouncement(
                    { one: t("player.formTabOpenedOne"), many: t("player.formTabOpenedMany") },
                    resolveText(view.tabs?.find((tab) => tab.key === tabSwitch.tabKey)?.label, "en", view.baseLocale),
                    tabSwitch.fieldCount,
                  )}
                </span>
              )}
            </p>

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
