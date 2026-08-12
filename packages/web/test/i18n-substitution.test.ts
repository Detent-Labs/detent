/**
 * The two substitution helpers the admin and reporting catalogs need.
 *
 * A count-bearing sentence has one key per grammatical form, each holding the
 * whole sentence. The alternative — a count, a ternary over "instance is" and
 * "instances are", and a trailing clause — does not survive translation, since
 * German splits such a sentence differently.
 */
import { describe, expect, it } from "bun:test";
import { tCount, t as tReporting } from "../src/areas/reporting/catalog.js";
import { tFill, t as tAdmin } from "../src/areas/admin/catalog.js";

describe("tCount", () => {
  it("answers a different sentence for one and for several, in both locales", () => {
    for (const locale of ["en", "de"] as const) {
      const one = tCount(locale, "skipped.one", 1);
      const many = tCount(locale, "skipped.many", 2);
      expect(one, locale).not.toBe(many);
      expect(one, locale).toContain("1");
      expect(many, locale).toContain("2");
      expect(one, locale).not.toContain("{n}");
      expect(many, locale).not.toContain("{n}");
    }
  });

  it("reads differently in each locale", () => {
    expect(tCount("en", "skipped.one", 1)).not.toBe(tCount("de", "skipped.one", 1));
  });

  it("leaves a key with no placeholder untouched", () => {
    expect(tCount("en", "table.step", 3)).toBe(tReporting("en", "table.step"));
  });
});

describe("tFill", () => {
  it("fills every named placeholder", () => {
    const text = tFill("en", "migrations.runConfirm", { process: "proc_expense", from: 2, to: 3 });
    expect(text).toContain("proc_expense");
    expect(text).toContain("2");
    expect(text).toContain("3");
    expect(text).not.toContain("{process}");
    expect(text).not.toContain("{from}");
  });

  it("keeps the role name as the engine spells it, in either locale", () => {
    for (const locale of ["en", "de"] as const) {
      expect(tFill(locale, "role.body", { role: "system:datalists" }), locale).toContain("system:datalists");
    }
  });

  it("leaves an unfilled placeholder in place rather than blanking it", () => {
    // A visible `{to}` reads as a bug. An empty gap reads as finished text.
    expect(tFill("en", "migrations.runConfirm", { process: "p", from: 1 })).toContain("{to}");
  });

  it("leaves a key with no placeholder untouched", () => {
    expect(tFill("en", "users.title", { n: 4 })).toBe(tAdmin("en", "users.title"));
  });
});
