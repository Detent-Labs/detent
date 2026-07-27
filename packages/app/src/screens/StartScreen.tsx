import { useEffect, useState } from "react";
import { resolveText } from "form-ui";
import { createInstance, listProcesses } from "../api/client.js";
import { AppClientError } from "../api/client.js";
import { t } from "../i18n/catalog.js";
import type { UiLocale } from "../i18n/locale.js";
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

  useEffect(() => {
    void listProcesses(token)
      .then(setProcesses)
      .catch((err) => {
        if (err instanceof AppClientError && err.status === 401) onUnauthorized();
      });
  }, [token, onUnauthorized]);

  const start = async (processId: string) => {
    setLoading(true);
    try {
      const created = await createInstance(processId, token);
      navigate({ name: "task", instanceId: created.instanceId });
    } catch (err) {
      if (err instanceof AppClientError && err.status === 401) onUnauthorized();
      else throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-screen app-start">
      <h1>{t(locale, "start.title")}</h1>
      {processes.length === 0 && <p className="app-empty">{t(locale, "start.empty")}</p>}
      <ul className="app-process-list">
        {processes.map((p) => (
          <li key={p.processId}>
            <button type="button" disabled={loading} onClick={() => void start(p.processId)}>
              {resolveText(p.label, locale, p.baseLocale)} — {t(locale, "start.create")}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
