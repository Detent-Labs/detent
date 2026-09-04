import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import { resolveText } from "form-ui";
import { createInstance, listProcesses } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ProcessSummary } from "../api/types.js";
import type { Route } from "../routing.js";

/** `.app-screen`, `.app-empty` and `.app-process-list` from `app.css`. */
const styles = stylex.create({
  screen: {
    maxWidth: "46rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  processList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
  },
});

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

  const screenProps = stylex.props(styles.screen);
  return (
    <main className={`app-start ${screenProps.className}`} style={screenProps.style}>
      <h1>{t(locale, "start.title")}</h1>
      {error && <ErrorBanner error={error} locale={locale} onRetry={() => void load()} retryDisabled={loadingList} />}
      {processes.length === 0 && !loadingList && !error && <p {...stylex.props(styles.empty)}>{t(locale, "start.empty")}</p>}
      <ul {...stylex.props(styles.processList)}>
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
