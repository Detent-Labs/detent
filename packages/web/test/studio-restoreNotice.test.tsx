import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RestoreNotice } from "../src/areas/studio/panels/RestoreNotice.js";
import { t } from "../src/areas/studio/catalog.js";
import { en } from "../src/i18n/catalogs/studio.js";

/**
 * The notice that offers the work a 401 kept in the tab (`studio-app`: "A kept
 * draft gets a restore notice"). Static markup: no harness here can click, so
 * the two handlers stay unexercised and `ProcessSurface` owns what they do.
 */
const noop = () => {};
const html = renderToStaticMarkup(<RestoreNotice onRestore={noop} onDiscard={noop} />);

/** `renderToStaticMarkup` escapes text the way this does. */
const escaped = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("RestoreNotice", () => {
  it("announces itself as a status", () => {
    expect(html).toContain('role="status"');
  });

  it("prints the catalog message", () => {
    expect(html).toContain(escaped(t("restoreNotice.message")));
  });

  it("renders both buttons with their catalog labels", () => {
    const buttons = [...html.matchAll(/<button type="button" class="([^"]*)"[^>]*>([^<]*)<\/button>/g)];
    expect(buttons.map((b) => b[2])).toEqual([escaped(t("restoreNotice.restore")), escaped(t("restoreNotice.discard"))]);
    expect(buttons[0]![1]).toContain("btn-secondary");
    expect(buttons[0]![1]).not.toContain("btn-destructive");
    // The destructive outline rides on the secondary control (`btn-destructive-accent.test.ts`).
    expect(buttons[1]![1]).toContain("btn-secondary btn-destructive");
  });

  it("carries all four catalog strings, the replace prompt included", () => {
    for (const key of ["restoreNotice.message", "restoreNotice.restore", "restoreNotice.discard", "restoreNotice.replaceConfirm"] as const) {
      expect(en[key], key).toBeString();
      expect(t(key).length, key).toBeGreaterThan(0);
    }
  });
});
