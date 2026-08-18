import { useCallback, useEffect, useState } from "react";
import { resolveText } from "form-ui";
import { createInstance, listProcesses } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ProcessSummary } from "../api/types.js";
import type { Route } from "../routing.js";

interface StartScreenProps {
  token: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

export function StartScreen({ token, locale, navigate, onUnauthorized }: StartScreenProps) {
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const load = useCallback(() => {
    setLoadingList(true);
    setError(undefined);
    return listProcesses(token)
      .then(setProcesses)
      .catch((err) => {
        fail(err);
      })
      .finally(() => setLoadingList(false));
  }, [token, fail, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async (processId: string) => {
    setLoading(true);
    try {
      const created = await createInstance(processId, token);
      navigate({ name: "task", instanceId: created.instanceId });
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-screen app-start">
      <h1>{t(locale, "start.title")}</h1>
      {error && <ErrorBanner error={error} locale={locale} onRetry={() => void load()} retryDisabled={loadingList} />}
      {processes.length === 0 && !loadingList && !error && <p className="app-empty">{t(locale, "start.empty")}</p>}
      <ul className="app-process-list">
        {processes.map((p) => (
          <li key={p.processId}>
            <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void start(p.processId)}>
              {resolveText(p.label, locale, p.baseLocale)} — {t(locale, "start.create")}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
