import { describe, expect, it } from "bun:test";
import { parseVersionInput, buildRunConfirmation, migrationBuckets } from "../src/areas/admin/screens/migrationsLogic.js";

describe("parseVersionInput", () => {
  it("parses a plain integer string", () => {
    expect(parseVersionInput("2")).toBe(2);
  });

  it("trims surrounding whitespace", () => {
    expect(parseVersionInput("  3  ")).toBe(3);
  });

  it("rejects an empty string", () => {
    expect(parseVersionInput("")).toBeUndefined();
    expect(parseVersionInput("   ")).toBeUndefined();
  });

  it("rejects a non-integer value", () => {
    expect(parseVersionInput("1.5")).toBeUndefined();
    expect(parseVersionInput("abc")).toBeUndefined();
  });
});

describe("buildRunConfirmation", () => {
  it("names the process and both versions", () => {
    const text = buildRunConfirmation("proc_expense", 1, 2, "en");
    expect(text).toContain("proc_expense");
    expect(text).toContain("version 1");
    expect(text).toContain("version 2");
  });
});

describe("migrationBuckets", () => {
  it("orders buckets migrated/skipped/conflicted/failed, including empty ones", () => {
    const buckets = migrationBuckets({ migrated: ["inst_1"], skipped: [], conflicted: [], failed: ["inst_2"] }, "en");
    expect(buckets.map((b) => b.key)).toEqual(["migrated", "skipped", "conflicted", "failed"]);
    expect(buckets[0]!.ids).toEqual(["inst_1"]);
    expect(buckets[1]!.ids).toEqual([]);
    expect(buckets[3]!.ids).toEqual(["inst_2"]);
  });
});
