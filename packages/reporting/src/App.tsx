import { useState } from "react";
import { useRoute, type ViewName } from "./routing.js";
import { loadSession, persistSession, clearSession, type Session } from "./session.js";
import { defaultRange, rangeIsValid, REPORTS_ROLE, type DateRange } from "./screens/reportingLogic.js";
import { LoginScreen } from "./screens/LoginScreen.js";
import { ProcessPickerScreen } from "./screens/ProcessPickerScreen.js";
import { CycleTimeScreen } from "./screens/CycleTimeScreen.js";
import { BottleneckScreen } from "./screens/BottleneckScreen.js";
import { SlaScreen } from "./screens/SlaScreen.js";
import { DateRangeControl } from "./components.js";
import { ErrorBoundary } from "./ErrorBoundary.js";

const VIEWS: { name: ViewName; label: string }[] = [
  { name: "cycle-time", label: "Cycle time" },
  { name: "bottleneck", label: "Bottlenecks" },
  { name: "sla", label: "SLA" },
];

/**
 * `baseLocale` is not carried per view response, and the picker's summaries are
 * gone by the time a view renders. English is the seeded base locale for every
 * example process; a step falls back to its key when the locale is absent, so a
 * mismatch degrades to a readable name rather than a blank cell.
 */
const BASE_LOCALE = "en";

export function App() {
  const { route, navigate } = useRoute();
  const [session, setSession] = useState<Session | undefined>(() => loadSession());
  // Owned here, so it survives a view switch and a process switch alike.
  const [range, setRange] = useState<DateRange>(() => defaultRange());
  // The view responses carry step labels but not the process's own, so the
  // picker hands it over. A deep link or a reload has no picker to hand it
  // over, and falls back to the id rather than rendering a blank heading.
  const [processLabel, setProcessLabel] = useState<string | undefined>();

  const logout = () => {
    clearSession();
    setSession(undefined);
    navigate({ name: "login" });
  };

  if (!session || route.name === "login") {
    return (
      <LoginScreen
        onLoggedIn={(s) => {
          setSession(s);
          persistSession(s);
          navigate({ name: "picker" });
        }}
      />
    );
  }

  if (!session.roles.includes(REPORTS_ROLE)) {
    return (
      <main className="rep-empty-role">
        <h1>Reports role required</h1>
        <p>Your account can sign in, but it does not hold the {REPORTS_ROLE} role needed to read process reports.</p>
        <button type="button" onClick={logout}>
          Log out
        </button>
      </main>
    );
  }

  return (
    <div className="rep-shell">
      <header className="rep-header">
        <nav>
          <button type="button" className="rep-home" aria-current={route.name === "picker" ? "page" : undefined} onClick={() => navigate({ name: "picker" })}>
            Processes
          </button>
          {route.name === "view" &&
            VIEWS.map((v) => (
              <button
                key={v.name}
                type="button"
                aria-current={route.view === v.name ? "page" : undefined}
                onClick={() => navigate({ name: "view", view: v.name, processId: route.processId })}
              >
                {v.label}
              </button>
            ))}
        </nav>
        <div className="rep-header-right">
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <ErrorBoundary>
        {route.name === "picker" ? (
          <ProcessPickerScreen
            token={session.token}
            onPick={(processId, label) => {
              setProcessLabel(label);
              navigate({ name: "view", view: "cycle-time", processId });
            }}
          />
        ) : (
          <main className="rep-screen">
            <h1>{processLabel ?? route.processId}</h1>
            <DateRangeControl range={range} onChange={setRange} />
            {!rangeIsValid(range) ? (
              <p className="rep-error" role="alert">
                The start date must not be after the end date.
              </p>
            ) : route.view === "cycle-time" ? (
              <CycleTimeScreen processId={route.processId} range={range} token={session.token} baseLocale={BASE_LOCALE} />
            ) : route.view === "bottleneck" ? (
              <BottleneckScreen processId={route.processId} range={range} token={session.token} baseLocale={BASE_LOCALE} />
            ) : (
              <SlaScreen processId={route.processId} range={range} token={session.token} baseLocale={BASE_LOCALE} />
            )}
          </main>
        )}
      </ErrorBoundary>
    </div>
  );
}
