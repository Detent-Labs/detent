/**
 * `panels/SubprocessSpecEditor.tsx`: the process picker and the version
 * binding pair (`studio-guided-vocabulary`, tasks 1.8, 1.9).
 *
 * Read off the markup the editor renders, the way
 * `studio-fieldMatrixPanel-legend.test.tsx` reads its legend.
 */
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SubprocessSpecEditor } from "../src/areas/studio/panels/SubprocessSpecEditor.js";
import { studioCatalog } from "../src/i18n/catalogs/studio.js";
import type { ProcessSummary } from "../src/areas/studio/api/types.js";

const PROCESSES: ProcessSummary[] = [
  {
    processId: "proc_11111111-1111-4111-8111-111111111111",
    version: 3,
    definitionHash: "hash-a",
    key: "credit-check",
    label: { en: "Credit check", de: "Bonitätsprüfung" },
    baseLocale: "en",
  },
  {
    processId: "proc_22222222-2222-4222-8222-222222222222",
    version: 1,
    definitionHash: "hash-b",
    key: "vendor-onboarding",
    label: { en: "Vendor onboarding" },
    baseLocale: "en",
  },
];

function render(spec: Parameters<typeof SubprocessSpecEditor>[0]["value"], locale = "en"): string {
  return renderToStaticMarkup(
    <SubprocessSpecEditor
      value={spec}
      fields={[]}
      onChange={() => {}}
      processes={PROCESSES}
      contentLocale={locale}
    />,
  );
}

describe("the process picker", () => {
  it("prints one entry per process, each by its label", () => {
    const html = render(undefined);
    expect(html).toContain("Credit check");
    expect(html).toContain("Vendor onboarding");
    expect(html).toContain(studioCatalog.en["subprocess.selectProcess"]);
  });

  it("prints no raw proc_ id in any entry's own text", () => {
    const html = render({ processId: PROCESSES[0]!.processId as never });
    // The id is the option's value, which is what the draft stores. No entry
    // shows one to the author.
    for (const text of [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]!)) {
      expect(text).not.toContain("proc_");
    }
  });

  it("reads a process's label in the content locale", () => {
    expect(render(undefined, "de")).toContain("Bonitätsprüfung");
  });

  it("keeps a stored id the list does not carry, without printing it", () => {
    const html = render({ processId: "proc_absent" as never });
    expect(html).toContain(studioCatalog.en["subprocess.unknownProcess"]);
    expect(html).toContain('value="proc_absent"');
    expect(html).not.toContain(">proc_absent<");
  });
});

describe("the version binding pair", () => {
  it("carries both plain strings, and neither schema enum as its own word", () => {
    const html = render({ processId: PROCESSES[0]!.processId as never });
    expect(html).toContain(studioCatalog.en["subprocess.bindingPinned"]);
    expect(html).toContain(studioCatalog.en["subprocess.bindingLatest"]);
    expect(html).not.toContain(">pinned<");
    expect(html).not.toContain(">latest-at-spawn<");
  });

  it("states that a contract change holds the binding back, on the latest choice", () => {
    const pinned = render({ processId: PROCESSES[0]!.processId as never, versionBinding: "pinned" });
    expect(pinned).not.toContain(studioCatalog.en["subprocess.bindingNote"]);
    const latest = render({
      processId: PROCESSES[0]!.processId as never,
      versionBinding: "latest-at-spawn",
      contractRef: "ref",
    });
    expect(latest).toContain(studioCatalog.en["subprocess.bindingNote"]);
  });
});
