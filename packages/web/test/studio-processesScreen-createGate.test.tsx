import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ProcessesScreen } from "../src/areas/studio/screens/ProcessesScreen.js";

/**
 * studio-app spec, "A new process mints a prefixed id client-side in one write":
 * the `/processes` screen offers the create-new-process action only to an
 * actor holding `system:create`. Presentational only — the authoritative
 * check sits on `PUT /drafts/:processId` (process-drafts).
 *
 * A static render never fires `load()`'s effect (same idiom as
 * `studio-processHeaderBar-publishGate.test.tsx`: no live data provider, no
 * fetch resolves), so this exercises exactly the synchronous, props-driven
 * gate `canCreate` computes — nothing about the async row list.
 */
function renderScreen(roles: readonly string[]): string {
  return renderToStaticMarkup(
    <ProcessesScreen token="tok" roles={roles} navigate={() => {}} onUnauthorized={() => {}} />,
  );
}

describe("The create-new-process action's role gate", () => {
  it("hides the create action for an actor holding system:developer but not system:create", () => {
    const html = renderScreen(["system:developer"]);

    expect(html).not.toContain("+ New process");
  });

  it("offers the create action for an actor holding system:create", () => {
    const html = renderScreen(["system:developer", "system:create"]);

    expect(html).toContain("+ New process");
  });

  it("still renders the Import-a-promoted-version control regardless of system:create", () => {
    expect(renderScreen(["system:developer"])).toContain("Import a promoted version");
    expect(renderScreen(["system:developer", "system:create"])).toContain("Import a promoted version");
  });
});

/**
 * studio-app spec, "The import control is one secondary button": the label is
 * a secondary button, and the native file input it opens stays hidden.
 */
describe("The import control", () => {
  it("is a button with class btn-secondary", () => {
    const html = renderScreen(["system:developer"]);

    expect(html).toMatch(/<button type="button" class="btn btn-secondary">(?:(?!<\/button>).)*Import a promoted version<\/button>/);
  });

  it("opens a file input that carries hidden", () => {
    const input = renderScreen(["system:developer"]).match(/<input[^>]*id="promotion-import"[^>]*>/)?.[0];

    expect(input).toBeDefined();
    expect(input).toMatch(/\shidden(=""|\s|>)/);
    expect(input).toContain('type="file"');
  });
});
