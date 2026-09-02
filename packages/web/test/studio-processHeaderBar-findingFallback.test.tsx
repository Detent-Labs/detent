import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftContext, type DraftContextValue } from "../src/areas/studio/draft/store.js";
import type { ValidationResult } from "../src/areas/studio/draft/validation.js";
import type { PublishFinding, PublishResult } from "../src/areas/studio/api/types.js";
import { ProcessHeaderBar } from "../src/areas/studio/panels/ProcessHeaderBar.js";

/**
 * `instance-transition-action` task 4.3: a finding from an
 * `instance.transition` action names no data source, because an action is not
 * one. The finding line falls back to the finding's `loc`, so a reader still
 * learns which site raised it instead of reading a bare "Stale reference in :".
 *
 * A `bun:test` assertion rather than a browser-checks entry: the fallback is
 * text this component renders, which `renderToStaticMarkup` can read
 * (`development-toolchain`'s split rule). What stays in `docs/browser-checks.md`
 * is the generated config form's own precedence, which no assertion here sees.
 *
 * Renders `<DraftContext.Provider>` with a hand-built value, the shape
 * `studio-actionListEditor-registryBadge.test.tsx` established — never a live
 * `DraftProvider`, whose fetch effects never resolve under static rendering.
 */
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

const contextValue: DraftContextValue = {
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

function renderHeader(findings: PublishFinding[]): string {
  const publishResult: PublishResult = {
    processId: "proc_a",
    version: 3,
    definitionHash: "hash_a",
    status: "published",
    findings,
  };
  return renderToStaticMarkup(
    <DraftContext.Provider value={contextValue}>
      <ProcessHeaderBar
        revision={1}
        isDirty={false}
        lastSavedAt={undefined}
        publishResult={publishResult}
        conflict={false}
        actions={{ saving: false, publishing: false, error: null, pendingDialog: null, resolveDialog: () => {}, save: () => {}, discard: () => {}, publish: () => {}, reload: () => {} }}
        structureActive={true}
        processId="proc_a"
        canPublish={true}
        baseVersion={null}
        go={() => {}}
      />
    </DraftContext.Provider>,
  );
}

describe("ProcessHeaderBar's publish findings", () => {
  it("names the loc for an action finding, which carries no data source id", () => {
    const html = renderHeader([
      {
        loc: "workflow.steps[0].onEntry[0]",
        referenceKind: "path",
        reference: "path_issue",
        carriedByVersions: [],
        liveInstanceCountOutsideCarryingVersions: 0,
      },
    ]);

    expect(html).toContain("workflow.steps[0].onEntry[0]");
    expect(html).toContain("path_issue");
    expect(html).not.toContain("undefined");
  });

  it("still names the data source id for a data-source finding", () => {
    const html = renderHeader([
      {
        loc: "dataSources[0]",
        dataSourceId: "ds_devices",
        referenceKind: "field",
        reference: "field_label",
        carriedByVersions: [2],
        liveInstanceCountOutsideCarryingVersions: 4,
      },
    ]);

    expect(html).toContain("ds_devices");
    expect(html).not.toContain("dataSources[0]");
  });
});
