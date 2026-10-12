import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginScreen } from "../src/shell/LoginScreen.js";

function render(notice?: string): string {
  return renderToStaticMarkup(<LoginScreen locale="en" onLoggedIn={() => {}} notice={notice} />);
}

describe("LoginScreen's notice", () => {
  it("renders the notice in the status region between the title and the first field", () => {
    const html = render("Your session ended in another tab.");
    expect(html).toMatch(/<div\b[^>]*\brole="status"[^>]*><p\b[^>]*>Your session ended in another tab\.<\/p><\/div>/);
    expect(html.indexOf("</h1>")).toBeLessThan(html.indexOf('role="status"'));
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf("<label"));
  });

  it("keeps the status region mounted and empty without a notice", () => {
    const html = render();
    // No whitespace or child node: `:empty` collapses the region only while it holds none.
    expect(html).toMatch(/<div\b[^>]*\brole="status"[^>]*><\/div>/);
    expect(html).not.toContain("Your session ended");
  });
});
