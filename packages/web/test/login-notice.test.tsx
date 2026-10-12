import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginScreen } from "../src/shell/LoginScreen.js";

function render(notice?: string): string {
  return renderToStaticMarkup(<LoginScreen locale="en" onLoggedIn={() => {}} notice={notice} />);
}

describe("LoginScreen's notice", () => {
  it("renders the notice as a status line between the title and the first field", () => {
    const html = render("Your session ended in another tab.");
    expect(html).toMatch(/<p\b[^>]*\brole="status"[^>]*>Your session ended in another tab\.<\/p>/);
    expect(html.indexOf("</h1>")).toBeLessThan(html.indexOf('role="status"'));
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf("<label"));
  });

  it("renders no status line without a notice", () => {
    expect(render()).not.toContain('role="status"');
  });
});
