/**
 * `areas/app/screens/startedLogic.ts`: the started-cases view model.
 *
 * Components stay untested, per the repo's existing convention
 * (`admin-migrationsLogic.test.ts`, `inboxLogic.test.ts`).
 */
import { describe, expect, it } from "bun:test";
import { startedOnLabel, statusKey, statusTone } from "../src/areas/app/screens/startedLogic.js";
import { appCatalog } from "../src/i18n/catalogs/app.js";
import type { InstanceSummary } from "../src/areas/app/api/types.js";

const STATUSES = ["running", "completed", "cancelled", "faulted"] as const;

const item = (over: Partial<InstanceSummary> = {}): InstanceSummary =>
  ({
    instanceId: "inst_1",
    processId: "proc_1",
    version: 1,
    status: "running",
    currentStepId: "step_a",
    transitionSeq: 0,
    createdAt: "2026-08-12T10:30:00.000Z",
    processLabel: { en: "Expense" },
    stepLabel: { en: "Review" },
    processBaseLocale: "en",
    ...over,
  }) as InstanceSummary;

describe("statusKey", () => {
  it("names a catalog key the app catalog actually declares, for every status", () => {
    for (const status of STATUSES) {
      const key = statusKey(status);
      expect(appCatalog.en[key], status).toBeDefined();
      expect(appCatalog.de[key], status).toBeDefined();
    }
  });

  it("gives each status its own key, so no two read alike", () => {
    const keys = STATUSES.map(statusKey);
    expect(new Set(keys).size).toBe(STATUSES.length);
  });
});

describe("statusTone", () => {
  it("marks a running case open and a completed one settled", () => {
    expect(statusTone("running")).toBe("open");
    expect(statusTone("completed")).toBe("settled");
  });

  it("separates a case closed without finishing from one that faulted", () => {
    // Both are finished, and only one is a failure. One tone for both would
    // read a cancelled case as a fault.
    expect(statusTone("cancelled")).toBe("dormant");
    expect(statusTone("faulted")).toBe("refusal");
  });

  it("uses four tones and no fifth, which design-language.md fixes", () => {
    expect(new Set(STATUSES.map(statusTone)).size).toBe(4);
  });
});

describe("startedOnLabel", () => {
  it("prints the creation date in the reader's locale", () => {
    const en = startedOnLabel(item(), "en");
    const de = startedOnLabel(item(), "de");
    expect(en.length).toBeGreaterThan(0);
    expect(de.length).toBeGreaterThan(0);
    expect(de).not.toBe(en);
  });

  it("answers an empty string for an unparseable instant, rather than Invalid Date", () => {
    expect(startedOnLabel(item({ createdAt: "not-a-date" }), "en")).toBe("");
  });
});
