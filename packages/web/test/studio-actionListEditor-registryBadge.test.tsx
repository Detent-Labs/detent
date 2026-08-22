import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Action } from "workflow-engine/schema";
import type { DraftOf } from "../src/areas/studio/draft/types.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import { ActionListEditor } from "../src/areas/studio/panels/ActionListEditor.js";

/**
 * Task 6.9a: `ActionListEditor.tsx` narrows its per-action registry badge to
 * the held-back config-validation half (design.md's "Config validation
 * stays on the server, and the rail says so" decision). It shows the badge
 * for an action whose type resolved — resolution is not the reason it might
 * still be wrong. It shows a real registry issue instead, via `IssueList`,
 * for an action whose type did not resolve.
 *
 * `ActionListEditor` reads only `validation` off `useDraft()`, which reads
 * `useContext(DraftContext)` — never a live `DraftProvider`, whose own
 * registry/chaining-fetch effects resolve async and never fire under
 * `renderToStaticMarkup`. Rendering `<DraftContext.Provider value={...}>`
 * directly with a hand-built `DraftContextValue` supplies exactly the
 * `validation` shape each case needs, at the same level
 * `studio-checksRail.test.ts` tests `groupChecksBySource` — a hand-built
 * `ValidationResult`, not an integration of the fetch pipeline.
 *
 * Deliberately not `mock.module`: it replaces a module in the process-wide
 * registry for the rest of the `bun test` run, not just this file, and
 * `mock.restore()` does not undo it (confirmed) — a sibling file importing
 * the real `DraftProvider` from the same specifier afterward would get
 * whatever this file last registered instead.
 */

type DraftAction = DraftOf<Action>;

function baseValidation(overrides: Partial<ValidationResult>): ValidationResult {
  return {
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
    ...overrides,
  };
}

function contextValue(validation: ValidationResult): DraftContextValue {
  return {
    draft: {},
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
}

function renderRow(action: DraftAction, validation: ValidationResult): string {
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue(validation)}>
      <ActionListEditor label="On entry" actions={[action]} onChange={() => {}} fields={[]} registryTypes={[]} />
    </DraftContext.Provider>,
  );
}

describe("ActionListEditor's registry badge", () => {
  it("shows the config-held-back badge for an action whose type resolves", () => {
    const action: DraftAction = { id: "action_a" as never, type: "http.request", config: {} };
    const html = renderRow(action, baseValidation({ issues: [] }));

    expect(html).toContain("registry config");
    expect(html).toContain("badge-not-checked");
  });

  it("shows a registry issue, not the held-back badge, for an action whose type does not resolve", () => {
    const action: DraftAction = { id: "action_b" as never, type: "not.registered", config: {} };
    const html = renderRow(
      action,
      baseValidation({
        issues: [{ entityType: "action", entityId: "action_b", message: "action type 'not.registered' is not registered", source: "registry" }],
      }),
    );

    expect(html).not.toContain("registry config");
    expect(html).toContain("not registered");
  });
});
