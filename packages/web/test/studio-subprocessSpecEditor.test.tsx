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
      childInputs={{ status: "idle", fields: [] }}
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

const CHILD = PROCESSES[0]!.processId;
const CHILD_FIELDS = [
  { id: "fld_amount", key: "amount", label: "Amount" },
  { id: "fld_applicant", key: "applicant", label: "Applicant" },
];
const PARENT_FIELDS = [{ id: "fld_parent_only", key: "parent_only", type: "string" }] as never;

function renderWith(
  spec: Parameters<typeof SubprocessSpecEditor>[0]["value"],
  childInputs: Parameters<typeof SubprocessSpecEditor>[0]["childInputs"],
): string {
  return renderToStaticMarkup(
    <SubprocessSpecEditor
      value={spec}
      fields={PARENT_FIELDS}
      childInputs={childInputs}
      onChange={() => {}}
      processes={PROCESSES}
      contentLocale="en"
    />,
  );
}

const PINNED = {
  processId: CHILD as never,
  versionBinding: "pinned" as const,
  pinnedVersion: 2,
  inputMapping: {},
  outputMapping: {},
};
const CEL = (src: string) => ({ lang: "cel" as const, src });

describe("a step with no spec", () => {
  it("shows the process select alone", () => {
    const html = renderWith(undefined, { status: "idle", fields: [] });
    expect(html).toContain(studioCatalog.en["subprocess.processLabel"]);
    expect(html).not.toContain(studioCatalog.en["subprocess.bindingLegend"]);
    expect(html).not.toContain(studioCatalog.en["subprocess.pinnedVersionLabel"]);
    expect(html).not.toContain("inputMapping");
    expect(html).not.toContain("outputMapping");
    expect(html).not.toContain(studioCatalog.en["subprocess.addInputMapping"]);
  });
});

describe("the inputMapping editor", () => {
  const addInput = studioCatalog.en["subprocess.addInputMapping"];
  const addDisabled = (html: string) =>
    new RegExp(`<button[^>]*disabled=""[^>]*>${addInput.replace(/\W/g, "\\$&")}</button>`).test(html);

  it("offers the child's input field keys and none of the parent's", () => {
    const html = renderWith(
      { ...PINNED, inputMapping: { fld_amount: CEL("data.x") } as never },
      { status: "ready", fields: CHILD_FIELDS },
    );
    expect(html).toContain('<option value="fld_amount" selected="">amount</option>');
    expect(html).toContain('<option value="fld_applicant">applicant</option>');
    const inputFieldset = html.slice(html.indexOf("inputMapping"), html.indexOf("outputMapping"));
    expect(inputFieldset).not.toContain("parent_only");
  });

  it("keeps the parent's fields as the outputMapping targets", () => {
    const html = renderWith(
      { ...PINNED, outputMapping: { fld_parent_only: CEL("child.data.x") } as never },
      { status: "ready", fields: CHILD_FIELDS },
    );
    expect(html.slice(html.indexOf("outputMapping"))).toContain(">parent_only</option>");
  });

  it("enables + add when the child is ready and lists a free field", () => {
    expect(addDisabled(renderWith(PINNED, { status: "ready", fields: CHILD_FIELDS }))).toBe(false);
  });

  it("disables + add and prints the loading note while the read runs", () => {
    const html = renderWith(PINNED, { status: "loading", fields: [] });
    expect(addDisabled(html)).toBe(true);
    expect(html).toContain(studioCatalog.en["subprocess.childInputsLoading"]);
  });

  it("disables + add and prints the failed note after a failed read", () => {
    const html = renderWith({ ...PINNED, inputMapping: { fld_amount: CEL("data.x") } as never }, { status: "failed", fields: [] });
    expect(addDisabled(html)).toBe(true);
    expect(html).toContain(studioCatalog.en["subprocess.childInputsFailed"]);
    // The stored row stays, as an unlisted option.
    expect(html).toContain(`fld_amount ${studioCatalog.en["mapping.unlistedKey"]}`);
  });

  it("prints the no-input-fields note for a ready child that lists none", () => {
    const html = renderWith(PINNED, { status: "ready", fields: [] });
    expect(addDisabled(html)).toBe(true);
    expect(html).toContain(studioCatalog.en["subprocess.childInputsNone"]);
  });

  it("disables + add once every child field has a row", () => {
    const mapping = { fld_amount: CEL("a"), fld_applicant: CEL("b") } as never;
    const html = renderWith({ ...PINNED, inputMapping: mapping }, { status: "ready", fields: CHILD_FIELDS });
    expect(addDisabled(html)).toBe(true);
    expect(html).not.toContain(studioCatalog.en["subprocess.childInputsNone"]);
  });

  it("marks a stored key the child no longer lists", () => {
    const html = renderWith(
      { ...PINNED, inputMapping: { fld_gone: CEL("data.x") } as never },
      { status: "ready", fields: CHILD_FIELDS },
    );
    expect(html).toContain(`fld_gone ${studioCatalog.en["mapping.unlistedKey"]}`);
    expect(html).toContain('<option value="fld_gone" selected="">');
  });

  it("prints no note while the child is idle or ready with fields", () => {
    for (const childInputs of [{ status: "idle" as const, fields: [] }, { status: "ready" as const, fields: CHILD_FIELDS }]) {
      const html = renderWith(PINNED, childInputs);
      expect(html).not.toContain(studioCatalog.en["subprocess.childInputsLoading"]);
      expect(html).not.toContain(studioCatalog.en["subprocess.childInputsFailed"]);
      expect(html).not.toContain(studioCatalog.en["subprocess.childInputsNone"]);
    }
  });
});
