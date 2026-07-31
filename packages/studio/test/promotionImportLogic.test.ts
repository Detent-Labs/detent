import { describe, expect, it } from "bun:test";
import { collidingProcessId, parsePromotionFile } from "../src/screens/promotionImportLogic.js";
import { buildPromotionFile, promotionFilename } from "../src/screens/promotionExportLogic.js";
import type { ProcessRow } from "../src/screens/processListLogic.js";
import type { VersionSummary } from "../src/api/types.js";

const compiled = {
  key: "expense_approval",
  label: { en: "Expense approval", de: "Spesenfreigabe" },
  baseLocale: "en",
  workflow: { steps: [{ id: "step_a" }, { id: "step_cancelled" }] },
};

const version: VersionSummary = { version: 4, definitionHash: "hash_source", status: "published", publishedAt: "2026-07-31T00:00:00.000Z" };
const exported = JSON.stringify(buildPromotionFile("proc_x", version, compiled));

function ok(text: string) {
  const parsed = parsePromotionFile(text);
  if (!parsed.ok) throw new Error(`expected a parsed file, got: ${parsed.message}`);
  return parsed.preview;
}

describe("parsePromotionFile", () => {
  it("accepts a file this feature exported", () => {
    const preview = ok(exported);
    expect(preview.processId).toBe("proc_x");
    expect(preview.key).toBe("expense_approval");
    expect(preview.version).toBe(4);
    expect(preview.definitionHash).toBe("hash_source");
    expect(preview.body).toEqual(compiled);
  });

  it("rejects text that is not JSON", () => {
    const parsed = parsePromotionFile("{not json");
    expect(parsed.ok).toBe(false);
  });

  it("rejects JSON that is not an object", () => {
    expect(parsePromotionFile("[]").ok).toBe(false);
    expect(parsePromotionFile('"a string"').ok).toBe(false);
  });

  it("rejects a file with no processId", () => {
    expect(parsePromotionFile(JSON.stringify({ body: compiled })).ok).toBe(false);
    expect(parsePromotionFile(JSON.stringify({ processId: "", body: compiled })).ok).toBe(false);
    expect(parsePromotionFile(JSON.stringify({ processId: 7, body: compiled })).ok).toBe(false);
  });

  it("rejects a file with no body, or a body that is not an object", () => {
    expect(parsePromotionFile(JSON.stringify({ processId: "proc_x" })).ok).toBe(false);
    expect(parsePromotionFile(JSON.stringify({ processId: "proc_x", body: "compiled" })).ok).toBe(false);
    expect(parsePromotionFile(JSON.stringify({ processId: "proc_x", body: [] })).ok).toBe(false);
  });

  it("resolves a multi-locale label through the body's baseLocale", () => {
    expect(ok(exported).label).toBe("Expense approval");
    const german = JSON.stringify(buildPromotionFile("proc_x", version, { ...compiled, baseLocale: "de" }));
    expect(ok(german).label).toBe("Spesenfreigabe");
  });

  it("survives a body with no usable label or key rather than throwing", () => {
    const preview = ok(JSON.stringify({ processId: "proc_x", body: { baseLocale: "en" } }));
    expect(preview.label).toBeUndefined();
    expect(preview.key).toBe("");
  });

  it("round-trips an export back to the same processId and body", () => {
    const file = buildPromotionFile("proc_x", version, compiled);
    const preview = ok(JSON.stringify(file));
    expect(preview.processId).toBe(file.processId);
    expect(preview.body).toEqual(file.body as object);
    expect(promotionFilename(preview.body, version.version, preview.processId)).toBe("expense_approval-v4.json");
  });
});

describe("collidingProcessId", () => {
  const rows: ProcessRow[] = [
    { processId: "proc_other", published: { version: 1, definitionHash: "h1", key: "expense_approval", label: { en: "Other" }, baseLocale: "en" } },
    { processId: "proc_x", published: { version: 2, definitionHash: "h2", key: "expense_approval", label: { en: "Mine" }, baseLocale: "en" } },
    { processId: "proc_draft_only", draft: { revision: 1, baseVersion: null, updatedBy: "u", updatedAt: "2026-07-31T00:00:00.000Z" } },
  ];

  it("reports a different process already publishing under this key", () => {
    expect(collidingProcessId(ok(exported), rows)).toBe("proc_other");
  });

  it("stays silent for a re-promotion of the same process", () => {
    const onlySelf = rows.filter((r) => r.processId === "proc_x");
    expect(collidingProcessId(ok(exported), onlySelf)).toBeUndefined();
  });

  it("stays silent when the key is free in the target", () => {
    const free = JSON.stringify(buildPromotionFile("proc_x", version, { ...compiled, key: "loan_application" }));
    expect(collidingProcessId(ok(free), rows)).toBeUndefined();
  });

  it("stays silent when the incoming file carries no key", () => {
    const noKey = ok(JSON.stringify({ processId: "proc_new", body: { baseLocale: "en" } }));
    expect(collidingProcessId(noKey, rows)).toBeUndefined();
  });

  it("ignores a draft-only row, which publishes under no key at all", () => {
    expect(collidingProcessId(ok(exported), [rows[2]])).toBeUndefined();
  });
});
