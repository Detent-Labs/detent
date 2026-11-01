import { readFileSync } from "node:fs";
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Step } from "workflow-engine/schema";
import type { DraftOf, Draft } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { sectionsFor, type SectionName } from "../src/areas/studio/panels/sectionsFor.js";
import { StepPage } from "../src/areas/studio/panels/StepPage.js";
import { fixOpensDeveloperView, sectionForRequest, type SectionRequest } from "../src/areas/studio/panels/stepSummaries.js";

/**
 * A Fix control's request to open one section (design.md D7). A page mounting
 * for the request opens on that section, which the rendered string shows. On a
 * page already mounted the request reaches an effect, so its decision is
 * `sectionForRequest`'s, and the effect's own wiring reads off the source.
 */

const STEP = {
  id: "step_a",
  key: "intake",
  label: { en: "Intake" },
  type: "task",
  paths: [{ id: "path_1", to: "step_b", label: "Go" }],
} as unknown as DraftOf<Step>;

const VALIDATION: ValidationResult = {
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

const CONTEXT: DraftContextValue = {
  draft: { baseLocale: "en", workflow: { initialStep: "step_a", steps: [STEP] } } as unknown as Draft,
  mutate: () => {},
  replace: () => {},
  validation: VALIDATION,
  loadedChildren: {},
  setChildForStep: () => {},
  registry: undefined,
  loadedChainingTargets: {},
  contentLocale: "en",
  setContentLocale: () => {},
  usedLocales: ["en"],
  loadGeneration: 0,
};

function render(sectionRequest?: SectionRequest): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={CONTEXT}>
      <StepPage
        fields={[]}
        token="t"
        step={STEP}
        stepNumber={1}
        previous={undefined}
        next={undefined}
        onSelectStep={() => {}}
        onRemoveStep={() => {}}
        sectionRequest={sectionRequest}
        navigate={() => {}}
        processes={[]}
      />
    </DraftContext.Provider>,
  );
}

const headerOf = (html: string, section: SectionName) => {
  const at = html.indexOf(`id="step-section-${section}"`);
  return html.slice(html.lastIndexOf("<button", at), html.indexOf(">", at));
};

describe("sectionForRequest", () => {
  const sections = sectionsFor("participant");

  it("answers the section a request names on this step's page", () => {
    expect(sectionForRequest({ stepId: "step_a", section: "timers" }, "step_a", sections)).toBe("timers");
  });

  it("answers nothing for another step's request", () => {
    expect(sectionForRequest({ stepId: "step_b", section: "timers" }, "step_a", sections)).toBeUndefined();
  });

  it("answers nothing for a section this step's kind does not stand", () => {
    expect(sectionForRequest({ stepId: "step_a", section: "timers" }, "step_a", sectionsFor("terminal"))).toBeUndefined();
  });

  it("answers nothing with no request", () => {
    expect(sectionForRequest(undefined, "step_a", sections)).toBeUndefined();
  });
});

describe("fixOpensDeveloperView", () => {
  it("reopens the Developer view on a Fix that opens More under a key check", () => {
    expect(fixOpensDeveloperView("more", true)).toBe(true);
  });

  it("leaves it alone on a Fix for More with no key check", () => {
    expect(fixOpensDeveloperView("more", false)).toBe(false);
  });

  it("leaves it alone on a Fix for another section, under a key check", () => {
    expect(fixOpensDeveloperView("timers", true)).toBe(false);
  });

  it("leaves a plain close standing while no Fix comes", () => {
    expect(fixOpensDeveloperView(undefined, true)).toBe(false);
  });
});

describe("A page mounting on a request", () => {
  it("opens the section the request names", () => {
    const html = render({ stepId: "step_a", section: "timers" });

    expect(headerOf(html, "timers")).toContain('aria-expanded="true"');
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
  });

  it("opens More for a key check's request", () => {
    expect(headerOf(render({ stepId: "step_a", section: "more" }), "more")).toContain('aria-expanded="true"');
  });

  it("does nothing for a request naming another step", () => {
    const plain = render();

    expect(render({ stepId: "step_b", section: "timers" })).toBe(plain);
    expect(headerOf(plain, "timers")).toContain('aria-expanded="false"');
  });
});

describe("The page's request effect", () => {
  const source = readFileSync(new URL("../src/areas/studio/panels/StepPage.tsx", import.meta.url).pathname, "utf8");
  const effect = source.slice(source.indexOf("if (!requestHere) return;"), source.indexOf("[requestHere, requestedSection, keyChecked, sectionRequest, onSectionOpened]"));

  it("opens the section and clears the request, so a later visit does not reopen it", () => {
    expect(effect).toContain("setOpenSection(requestedSection)");
    expect(effect).toContain("onSectionOpened();");
  });

  it("writes the Developer view's element on a Fix, and only inside the request's effect", () => {
    expect(effect).toContain("fixOpensDeveloperView(requestedSection, keyChecked)");
    expect(effect).toContain("developerRef.current.open = true;");
    expect(source.match(/developerRef\.current\.open = true;/g)).toHaveLength(1);
    expect(source).toContain("ref={developerRef}");
  });

  it("stands above the early return for a missing step, so the hook order holds", () => {
    expect(source.indexOf("if (!requestHere) return;")).toBeLessThan(source.indexOf("if (!step) {"));
  });
});
