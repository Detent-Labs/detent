import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Path, Step, Timer } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { TimersPanel } from "../src/areas/studio/panels/TimersPanel.js";
import { studioCatalog } from "../src/i18n/catalogs/studio.js";

/**
 * `studio-step-page`: "Every step and way-out select on the step page lists
 * labels". The time limit's way-out select prints each way out as its row
 * heading. The context is hand-built, as in
 * `studio-pathsPanel-manualGuard.test.tsx`.
 */

type DraftPath = DraftOf<Path>;
type DraftStep = DraftOf<Step>;
type DraftTimer = DraftOf<Timer>;

const validation: ValidationResult = {
  zodValid: true,
  issues: [],
  dimensions: {
    zod: "ran",
    duration: "ran",
    structural: "ran",
    actionType: "ran",
    assignmentType: "ran",
    dataSourceType: "ran",
    registryConfig: "not-run",
    cel: "ran",
  },
  subprocessStepStatus: {},
  chainingSiteStatus: {},
};

const context: DraftContextValue = {
  draft: { fields: [] } as never,
  mutate: () => {},
  replace: () => {},
  validation,
  loadedChildren: {},
  setChildForStep: () => {},
  registry: undefined,
  loadedChainingTargets: {},
  contentLocale: "en",
  setContentLocale: () => {},
  usedLocales: ["en"],
  loadGeneration: 0,
};

const STEPS = [
  { id: "step_1", key: "pruefung", type: "task", label: { en: "Prüfung" } },
  { id: "step_2", key: "abschluss", type: "task", label: { en: "Abschluss" } },
] as unknown as DraftStep[];

const TIMER = { id: "timer_1", duration: "PT1H", onFire: {} } as unknown as DraftTimer;

function render(paths: Record<string, unknown>[]): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={context}>
      <TimersPanel
        timers={[TIMER]}
        paths={paths as unknown as DraftPath[]}
        steps={STEPS}
        fields={[]}
        onChange={() => {}}
        contentLocale="en"
        baseLocale="en"
      />
    </DraftContext.Provider>,
  );
}

/** The way-out select's options, as [value, text] pairs. */
function wayOutOptions(html: string): [string, string][] {
  const at = html.indexOf(studioCatalog.en["timers.targetPathCaption"].replace(/'/g, "&#x27;"));
  const sel = /<select\b[^>]*>([\s\S]*?)<\/select>/.exec(html.slice(at));
  return [...(sel?.[1] ?? "").matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map((m) => [
    /value="([^"]*)"/.exec(m[1]!)?.[1] ?? "",
    m[2]!.replace(/<!-- -->/g, ""),
  ]);
}

describe("the time limit's way-out select", () => {
  it("offers a way out by its heading and never by its key", () => {
    const options = wayOutOptions(render([{ id: "path_1", key: "pr-fung-abschluss", label: "Freigeben", to: "step_2" }]));
    expect(options).toEqual([
      ["", studioCatalog.en["timers.reminderOption"]],
      ["path_1", "Freigeben → Abschluss"],
    ]);
    expect(options.some(([, text]) => text.includes("pr-fung-abschluss"))).toBe(false);
  });

  it("counts a repeated heading in the step's own order", () => {
    const options = wayOutOptions(
      render([
        { id: "path_1", key: "a", label: "Freigeben", to: "step_2" },
        { id: "path_2", key: "b", label: "Freigeben", to: "step_2" },
      ]),
    );
    expect(options.slice(1).map(([, text]) => text)).toEqual(["Freigeben → Abschluss", "Freigeben → Abschluss (2)"]);
  });

  it("offers a default label that already names its target once", () => {
    const options = wayOutOptions(render([{ id: "path_1", key: "p", label: "Prüfung → Abschluss", to: "step_2" }]));
    expect(options[1]).toEqual(["path_1", "Prüfung → Abschluss"]);
  });

  it("names a repeated target step by its steps-rail number", () => {
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={context}>
        <TimersPanel
          timers={[TIMER]}
          paths={[{ id: "path_1", key: "a", label: "Weiter", to: "step_2" }] as unknown as DraftPath[]}
          steps={[STEPS[0]!, { ...STEPS[0]!, id: "step_2" } as DraftStep]}
          fields={[]}
          onChange={() => {}}
          contentLocale="en"
          baseLocale="en"
        />
      </DraftContext.Provider>,
    );
    expect(wayOutOptions(html)[1]).toEqual(["path_1", "Weiter → Prüfung (step 2)"]);
  });

  it("offers a default label naming a repeated target by its rail number", () => {
    const html = renderToStaticMarkup(
      <DraftContext.Provider value={context}>
        <TimersPanel
          timers={[TIMER]}
          paths={[{ id: "path_1", key: "a", label: "Start → Prüfung", to: "step_2" }] as unknown as DraftPath[]}
          steps={[STEPS[0]!, { ...STEPS[0]!, id: "step_2" } as DraftStep]}
          fields={[]}
          onChange={() => {}}
          contentLocale="en"
          baseLocale="en"
        />
      </DraftContext.Provider>,
    );
    expect(wayOutOptions(html)[1]).toEqual(["path_1", "Start → Prüfung (step 2)"]);
  });

  it("takes the studio select, its chevron trailing the select", () => {
    const html = render([{ id: "path_1", key: "a", label: "Freigeben", to: "step_2" }]);
    const at = html.indexOf(studioCatalog.en["timers.targetPathCaption"].replace(/'/g, "&#x27;"));
    const rest = html.slice(at);
    expect(rest).toMatch(/^[^<]*<span[^>]*><select\b/);
    expect(rest.slice(rest.indexOf("</select>"))).toMatch(/^<\/select><span[^>]*><svg[^>]*lucide-chevron-down/);
  });

  it("reads an unnamed way out and a missing target by their placeholders", () => {
    const options = wayOutOptions(render([{ id: "path_1", key: "loose", label: "", to: undefined }]));
    expect(options[1]).toEqual(["path_1", "(unnamed way out) → (no step yet)"]);
  });
});
