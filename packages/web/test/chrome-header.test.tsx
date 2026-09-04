import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Chrome } from "../src/shell/Chrome.js";

// `__APP_VERSION__` is a Vite `define` global, real only in the built bundle.
// The account menu footer reads it, so a render under `bun test` needs a stand-in.
(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = "test";

/**
 * No test on `main` asserts on `.shell-header`/`.shell-tab` (D9), so this is
 * the guard the StyleX migration leaves behind: role `banner` is the native
 * `<header>` landmark, and the area name is the register tab's own text —
 * neither depends on a class name the compiler may hash.
 */
function renderChrome(): string {
  return renderToStaticMarkup(
    <Chrome
      area="app"
      roles={["system:author"]}
      session={{ displayName: "Ada Lovelace", actorId: "user_1" }}
      locale="en"
      onLocaleChange={() => {}}
      onLogout={() => {}}
      onGoToArea={() => {}}
      onGoToProfile={() => {}}
    >
      <div>content</div>
    </Chrome>,
  );
}

describe("Chrome's header", () => {
  it("renders a native <header> landmark, role banner", () => {
    expect(renderChrome()).toContain("<header");
  });

  it("carries the open area's name inside the header", () => {
    const html = renderChrome();
    const headerHtml = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(headerHtml).toContain("Tasks");
  });
});
