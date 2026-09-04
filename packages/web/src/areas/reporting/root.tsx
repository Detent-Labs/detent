import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { ChartNoAxesColumn, FileSpreadsheet } from "lucide-react";
import { matchRoute, routePath, type Route, type ViewName } from "./routing.js";
import { useAreaRoute, PROFILE_PATH } from "../../shell/routing.js";
import { Chrome } from "../../shell/Chrome.js";
import { navStyles } from "../../shell/navStyles.js";
import { colors, space } from "form-ui/tokens.stylex";
import { defaultRange, rangeIsValid, type DateRange } from "./screens/reportingLogic.js";
import { ProcessPickerScreen } from "./screens/ProcessPickerScreen.js";
import { CycleTimeScreen } from "./screens/CycleTimeScreen.js";
import { BottleneckScreen } from "./screens/BottleneckScreen.js";
import { SlaScreen } from "./screens/SlaScreen.js";
import { ReportsListScreen } from "./screens/ReportsListScreen.js";
import { ReportBuilderScreen } from "./screens/ReportBuilderScreen.js";
import { DateRangeControl } from "./components.js";
import { t, type CatalogKey } from "./catalog.js";
import type { AreaRootProps } from "../../shell/App.js";

const VIEWS: { name: ViewName; labelKey: CatalogKey }[] = [
  { name: "cycle-time", labelKey: "nav.cycleTime" },
  { name: "bottleneck", labelKey: "nav.bottleneck" },
  { name: "sla", labelKey: "nav.sla" },
];

/**
 * `baseLocale` is not carried per view response, and the picker's summaries are
 * gone by the time a view renders. English is the seeded base locale for every
 * example process; a step falls back to its key when the locale is absent, so a
 * mismatch degrades to a readable name rather than a blank cell.
 */
const BASE_LOCALE = "en";

/** `.rep-screen` from `app.css`. This root's own `.rep-error` call site
 * carries no stamp, so it keeps the refusal tone — the other half of
 * `components.tsx`'s two-way choice (design.md D12's per-call-site
 * bucket-2 rule). */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  errorRefusal: {
    fontSize: "0.9rem",
    color: colors.refusal,
    marginBlock: space.s3,
    marginInline: 0,
  },
});

/**
 * The process-owner area's root. The `system:reports` gate that used to live
 * here is now the shell's, read from one table (`shell/areas.ts`); the server's
 * `requireRole` on every `/reporting/*` route stays the enforcement.
 */
export function ReportingArea({ session, locale, localPath, go, onLocaleChange, onLogout }: AreaRootProps) {
  const { route, navigate } = useAreaRoute<Route>("reporting", localPath, matchRoute, routePath, go);
  // Owned here, so it survives a view switch and a process switch alike.
  const [range, setRange] = useState<DateRange>(() => defaultRange());
  // The view responses carry step labels but not the process's own, so the
  // picker hands it over. A deep link or a reload has no picker to hand it
  // over, and falls back to the id rather than rendering a blank heading.
  const [processLabel, setProcessLabel] = useState<string | undefined>();

  const pickerCurrent = route.name === "picker";
  const reportsCurrent = route.name === "reports" || route.name === "newReport" || route.name === "report";
  const pickerProps = stylex.props(pickerCurrent && navStyles.navCurrent);
  const reportsProps = stylex.props(reportsCurrent && navStyles.navCurrent);

  const nav = (
    <nav {...stylex.props(navStyles.nav)}>
      <button
        type="button"
        className={`btn btn-secondary rep-home ${pickerProps.className}`}
        style={pickerProps.style}
        aria-current={pickerCurrent ? "page" : undefined}
        onClick={() => navigate({ name: "picker" })}
      >
        <ChartNoAxesColumn size={18} strokeWidth={1.75} aria-hidden="true" />
        {t(locale, "nav.processes")}
      </button>
      {route.name === "view" &&
        VIEWS.map((v) => {
          const viewProps = stylex.props(route.view === v.name && navStyles.navCurrent);
          return (
            <button
              key={v.name}
              type="button"
              className={`btn btn-secondary ${viewProps.className}`}
              style={viewProps.style}
              aria-current={route.view === v.name ? "page" : undefined}
              onClick={() => navigate({ name: "view", view: v.name, processId: route.processId })}
            >
              {t(locale, v.labelKey)}
            </button>
          );
        })}
      <button
        type="button"
        className={`btn btn-secondary ${reportsProps.className}`}
        style={reportsProps.style}
        aria-current={reportsCurrent ? "page" : undefined}
        onClick={() => navigate({ name: "reports" })}
      >
        <FileSpreadsheet size={18} strokeWidth={1.75} aria-hidden="true" />
        {t(locale, "nav.reports")}
      </button>
    </nav>
  );

  return (
    <Chrome
      area="reporting"
      roles={session.roles}
      session={session}
      locale={locale}
      onLocaleChange={onLocaleChange}
      onLogout={onLogout}
      onGoToArea={(a) => go(`/${a}`)}
      onGoToProfile={() => go(PROFILE_PATH)}
      nav={nav}
    >
      {route.name === "picker" ? (
        <ProcessPickerScreen
          token={session.token}
          locale={locale}
          onPick={(processId, label) => {
            setProcessLabel(label);
            navigate({ name: "view", view: "cycle-time", processId });
          }}
        />
      ) : route.name === "reports" ? (
        <ReportsListScreen
          token={session.token}
          locale={locale}
          actorId={session.actorId}
          onOpen={(reportId) => navigate({ name: "report", reportId })}
          onNew={() => navigate({ name: "newReport" })}
        />
      ) : route.name === "newReport" ? (
        <ReportBuilderScreen
          token={session.token}
          locale={locale}
          actorId={session.actorId}
          onSaved={(reportId) => navigate({ name: "report", reportId })}
        />
      ) : route.name === "report" ? (
        <ReportBuilderScreen
          reportId={route.reportId}
          token={session.token}
          locale={locale}
          actorId={session.actorId}
          onSaved={(reportId) => navigate({ name: "report", reportId })}
        />
      ) : (
        <main {...stylex.props(styles.screen)}>
          <h1>{processLabel ?? route.processId}</h1>
          <DateRangeControl range={range} onChange={setRange} locale={locale} />
          {!rangeIsValid(range) ? (
            <p {...stylex.props(styles.errorRefusal)} role="alert">
              {t(locale, "range.invalid")}
            </p>
          ) : route.view === "cycle-time" ? (
            <CycleTimeScreen processId={route.processId} range={range} token={session.token} baseLocale={BASE_LOCALE} locale={locale} />
          ) : route.view === "bottleneck" ? (
            <BottleneckScreen processId={route.processId} range={range} token={session.token} baseLocale={BASE_LOCALE} locale={locale} />
          ) : (
            <SlaScreen processId={route.processId} range={range} token={session.token} baseLocale={BASE_LOCALE} locale={locale} />
          )}
        </main>
      )}
    </Chrome>
  );
}
