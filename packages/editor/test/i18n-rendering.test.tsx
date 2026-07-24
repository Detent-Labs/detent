import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NotCheckedBadge } from "../src/panels/shared/IssueList";

/**
 * Uses `react-dom/server`'s `renderToStaticMarkup` rather than a DOM-testing library — it needs
 * no `window`/`document` (unlike `@testing-library/react`, which isn't a dependency here and
 * would be new machinery for one small check), matching this package's existing convention of
 * testing plain logic without a DOM.
 */

describe("NotCheckedBadge", () => {
  it("composes the caller-supplied label with the translated 'not checked' suffix", () => {
    const html = renderToStaticMarkup(<NotCheckedBadge label="cross-process" />);
    expect(html).toContain("cross-process");
    expect(html).toContain("not checked");
  });
});
