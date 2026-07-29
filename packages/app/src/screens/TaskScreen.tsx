import { useCallback, useEffect, useState } from "react";
import { FieldForm, PathButtons, filterToEditable } from "form-ui";
import type { SubmissionIssue } from "form-ui";
import { cancelInstance, claim, getInstanceView, release, submitPath } from "../api/client.js";
import { AppClientError } from "../api/client.js";
import { describeError, type ErrorOutcome } from "../errors.js";
import { t } from "../i18n/catalog.js";
import type { UiLocale } from "../i18n/locale.js";
import type { InstanceView } from "../api/types.js";
import type { Route } from "../routing.js";

interface TaskScreenProps {
  instanceId: string;
  token: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

export function TaskScreen({ instanceId, token, locale, navigate, onUnauthorized }: TaskScreenProps) {
  const [view, setView] = useState<InstanceView | undefined>(undefined);
  const [claimedByMe, setClaimedByMe] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<ErrorOutcome | undefined>(undefined);
  const [validationIssues, setValidationIssues] = useState<SubmissionIssue[]>([]);

  const applyView = useCallback((next: InstanceView) => {
    setView(next);
    setClaimedByMe(false); // a fresh view is always shown read-only first; claiming is explicit
    const seeded: Record<string, unknown> = {};
    for (const f of next.fields) seeded[f.field.id] = f.value;
    setFormValues(seeded);
  }, []);

  const withErrorHandling = useCallback(
    async (fn: () => Promise<void>) => {
      setLoading(true);
      setOutcome(undefined);
      setValidationIssues([]);
      try {
        await fn();
      } catch (err) {
        if (err instanceof AppClientError) {
          if (err.status === 401) {
            onUnauthorized();
            return;
          }
          if (err.error.type === "validation") {
            setValidationIssues(err.error.issues);
            return;
          }
          const described = describeError(err.error, locale);
          setOutcome(described);
          // The claim this screen was relying on is no longer valid server-side —
          // revert to the unclaimed, read-only presentation rather than leaving
          // Release/submit visible for a claim that no longer works.
          if (described.kind === "prompt-claim" || described.kind === "claim-lost") {
            setClaimedByMe(false);
          }
          if (described.kind === "refresh-and-remove") {
            navigate({ name: "tasks" });
            return;
          }
          if (described.kind === "reload-moved-on") {
            // The reload itself can fail too (the instance could be gone by
            // now) — degrade to the outcome message already set rather than
            // letting a second failure escape this catch block unhandled.
            try {
              const fresh = await getInstanceView(instanceId, token);
              applyView(fresh);
            } catch {
              // outcome already communicates the situation; nothing further to do
            }
          }
          return;
        }
        // Every network path wraps its failure as AppClientError (api/client.ts),
        // so a value that isn't one is unexpected — but this screen still must
        // not rethrow it out of an async callback (spa-error-reporting spec:
        // no non-401 error escapes unhandled). Report it the same way every
        // other case in this catch already does, via the existing outcome shape.
        setOutcome({ kind: "explain", message: t(locale, "error.generic") });
      } finally {
        setLoading(false);
      }
    },
    [applyView, instanceId, locale, navigate, onUnauthorized, token],
  );

  useEffect(() => {
    void withErrorHandling(async () => {
      const fresh = await getInstanceView(instanceId, token);
      applyView(fresh);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId]);

  const doClaim = () =>
    withErrorHandling(async () => {
      await claim(instanceId, token);
      setClaimedByMe(true);
    });

  const doRelease = () =>
    withErrorHandling(async () => {
      await release(instanceId, token);
      setClaimedByMe(false);
    });

  const doSubmit = (pathId: string) =>
    withErrorHandling(async () => {
      if (!view) return;
      await submitPath(instanceId, pathId, filterToEditable(formValues, view.fields), token);
      navigate({ name: "tasks" });
    });

  const doDiscard = () =>
    withErrorHandling(async () => {
      await cancelInstance(instanceId, token);
      navigate({ name: "tasks" });
    });

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
    <main className="app-screen app-task">
      <button type="button" className="app-back" onClick={() => navigate({ name: "tasks" })}>
        {t(locale, "task.backToTasks")}
      </button>

      {view && (
        <span className="app-stamp app-stamp-case">
          {instanceId.slice(0, 12)} · {view.step.key}
        </span>
      )}

      {outcome && <p className="app-error">{outcome.message}</p>}

      {unmatchedIssues.length > 0 && (
        <div className="app-error">
          <p>{t(locale, "task.unmatchedIssues")}</p>
          <ul>
            {unmatchedIssues.map((issue, i) => (
              <li key={i}>
                {issue.fieldId}: {issue.kind}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view && (
        <>
          <FieldForm
            fields={view.fields}
            values={formValues}
            onChange={(fieldId, value) => setFormValues((v) => ({ ...v, [fieldId]: value }))}
            locale={locale}
            issuesByField={issuesByField}
          />

          <div className="app-task-actions">
            {!claimedByMe && (
              <button type="button" disabled={loading} onClick={() => void doClaim()}>
                {t(locale, "task.claim")}
              </button>
            )}
            {claimedByMe && (
              <button type="button" disabled={loading} onClick={() => void doRelease()}>
                {t(locale, "task.release")}
              </button>
            )}
            <button type="button" disabled={loading} onClick={() => void doDiscard()}>
              {t(locale, "task.discardCase")}
            </button>
          </div>

          {claimedByMe && <PathButtons paths={view.availablePaths} onSubmit={(pathId) => void doSubmit(pathId)} loading={loading} />}
        </>
      )}
    </main>
  );
}
