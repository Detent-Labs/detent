/**
 * The one structural rule of this package, asserted rather than left to
 * review: an area never imports from another area. It imports only upward,
 * into `shell/`, `api/` or `i18n/`, or from a declared package dependency.
 *
 * This is what keeps four merged frontends from tangling into one. Shared code
 * moves up or stays duplicated on purpose; it never travels sideways.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { AREAS } from "../src/shell/areas.js";

const PKGS = new URL("../../", import.meta.url).pathname;

const SRC = new URL("../src/", import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const areaFiles = (area: string) => walk(join(SRC, "areas", area)).filter((f) => /\.tsx?$/.test(f));
const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);

describe("area boundaries", () => {
  it("no area imports from another area", () => {
    for (const area of AREAS) {
      let files: string[];
      try {
        files = areaFiles(area);
      } catch {
        continue; // not migrated into this package yet
      }
      const forbidden = AREAS.filter((a) => a !== area).map((a) => `areas/${a}/`);
      for (const file of files) {
        for (const spec of importsOf(file)) {
          const hit = forbidden.find((prefix) => spec.includes(prefix));
          expect(hit, `${file} imports ${spec}`).toBeUndefined();
        }
      }
    }
  });

  it("the app area does not reach the engine's runtime or database modules", () => {
    for (const file of areaFiles("app")) {
      for (const spec of importsOf(file)) {
        expect(spec.startsWith("workflow-engine/engine"), `${file} imports ${spec}`).toBe(false);
        expect(spec.startsWith("workflow-engine/src"), `${file} imports ${spec}`).toBe(false);
      }
    }
  });

  it("every studio LocalizedTextInput site sits beside a missingTranslationWarning call, or an exempting comment", () => {
    // `missingTranslationWarning` reads useDraft's contentLocale, which
    // exists only in the studio area, so this rule stays scoped there.
    // "Beside" is a line-window check, not an AST walk: it looks LOOKAROUND
    // lines either side of a site for the warning call, since a site's
    // warning render sometimes precedes it (an option row computes its
    // warning before the input) and sometimes follows it (a label field's
    // warning renders as the input's next sibling).
    const LOOKAROUND = 30;
    const EXEMPT = /translation-warning-exempt/;
    let sitesChecked = 0;
    for (const file of areaFiles("studio")) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("<LocalizedTextInput")) return;
        sitesChecked++;
        const window = lines.slice(Math.max(0, i - LOOKAROUND), Math.min(lines.length, i + LOOKAROUND + 1)).join("\n");
        const ok = window.includes("missingTranslationWarning(") || EXEMPT.test(window);
        expect(ok, `${file}:${i + 1} has no adjacent missingTranslationWarning call or exemption comment`).toBe(true);
      });
    }
    // studio-app's requirement enumerates seven kinds by hand: process
    // label, step label, step description, field label, field description,
    // field option label, and a note's text. Nine textual sites carried the
    // first six: process label and step label/description sit in
    // ProcessHeaderBar.tsx/StepsPanel.tsx, one each. field-catalog-redesign
    // split the field catalog's single recursive FieldRow into two
    // source-level components — FieldEditor for the selected top-level
    // field's tab set, SubFieldRow for a group's children — so field label,
    // field description and field option label each appear once in each
    // component's own source: six sites for three kinds. field-model-view-note
    // adds a note's text as the tenth site, in FormEditorScreen.tsx's
    // NoteEditorStrip. This confirms the rule actually finds every site
    // rather than silently checking zero.
    expect(sitesChecked).toBe(10);
  });
});

describe("one package, one build", () => {
  it("is the only workspace package that produces a browser bundle", () => {
    // The four it replaces are gone; `form-ui` is source-only and ships no
    // build script, so nothing else emits a bundle.
    const others = readdirSync(PKGS).filter((name) => name !== "web" && statSync(join(PKGS, name)).isDirectory());
    expect(others).toEqual(["form-ui"]);
    for (const name of others) {
      const manifest = JSON.parse(readFileSync(join(PKGS, name, "package.json"), "utf8")) as { scripts?: Record<string, string> };
      expect(manifest.scripts?.build, `${name} declares a build`).toBeUndefined();
    }
  });

  it("loads every area through a dynamic import, so each is its own chunk", () => {
    const app = readFileSync(join(SRC, "shell/App.tsx"), "utf8");
    for (const area of AREAS) {
      expect(app, `area ${area}`).toContain(`lazy(() => import("../areas/${area}/root.js")`);
    }
  });

  it("pins one dev port and refuses to slide to another", () => {
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url).pathname, "utf8");
    expect(config).toContain("port: 5173");
    expect(config).toContain("strictPort: true");
    expect(config).toContain("hmr");
    expect(config).toContain("PORT_VITE");
  });

  it("bakes in no origin of its own, so a reverse proxy stays possible", () => {
    const config = readFileSync(new URL("../vite.config.ts", import.meta.url).pathname, "utf8");
    // No `base` means Vite's default, "/", which is what root-relative needs.
    expect(config).not.toMatch(/base\s*:/);
  });
});
