import { describe, expect, it } from "bun:test";
import { applyChoiceName, nextChoiceValue } from "../src/areas/studio/draft/choiceValue.js";
import type { DraftField } from "../src/areas/studio/draft/fields.js";
import { collectOptionValues } from "../src/areas/studio/draft/publishedFields.js";

const none: ReadonlySet<string> = new Set();

function field(options: { value: string; label: string }[], rest: Partial<DraftField> = {}): DraftField {
  return {
    id: "field_status",
    key: "status",
    label: { en: "Status" },
    type: "string",
    options: options.map((o) => ({ value: o.value, label: { en: o.label } })),
    ...rest,
  } as DraftField;
}

describe("nextChoiceValue", () => {
  it("derives the value from the first name an empty value meets", () => {
    expect(nextChoiceValue("", { en: "" }, { en: "In review" }, "en", none)).toBe("in_review");
  });

  it("moves a value the prior name derived", () => {
    expect(nextChoiceValue("in_review", { en: "In review" }, { en: "Under review" }, "en", none)).toBe("under_review");
  });

  it("keeps a hand-set value", () => {
    expect(nextChoiceValue("rv", { en: "In review" }, { en: "Under review" }, "en", none)).toBeUndefined();
  });

  it("steps past a sibling's value", () => {
    expect(nextChoiceValue("", { en: "" }, { en: "Yes" }, "en", new Set(["yes"]))).toBe("yes_2");
  });

  it("keeps following when the value took a dedupe suffix", () => {
    expect(nextChoiceValue("yes_2", { en: "Yes" }, { en: "Maybe" }, "en", new Set(["yes"]))).toBe("maybe");
  });

  it("reads the base locale, not the edited one", () => {
    expect(nextChoiceValue("", { en: "" }, { en: "Open", de: "Offen" }, "en", none)).toBe("open");
  });

  it("holds a locked non-empty value even while it equals the prior derivation", () => {
    expect(nextChoiceValue("open", { en: "Open" }, { en: "Opened" }, "en", none, true)).toBeUndefined();
  });

  it("derives an empty value although locked", () => {
    expect(nextChoiceValue("", { en: "" }, { en: "Open" }, "en", none, true)).toBe("open");
  });
});

describe("applyChoiceName", () => {
  it("names a new choice and sets its value from the first keystroke", () => {
    const f = field([{ value: "", label: "" }]);
    applyChoiceName(f, 0, { en: "I" }, "en", false);
    applyChoiceName(f, 0, { en: "In review" }, "en", false);
    expect(f.options![0]).toEqual({ value: "in_review", label: { en: "In review" } });
  });

  it("renames a derived value", () => {
    const f = field([{ value: "in_review", label: "In review" }]);
    applyChoiceName(f, 0, { en: "Under review" }, "en", false);
    expect(f.options![0]!.value).toBe("under_review");
  });

  it("gives two choices named Yes the values yes and yes_2", () => {
    const f = field([
      { value: "yes", label: "Yes" },
      { value: "", label: "" },
    ]);
    applyChoiceName(f, 1, { en: "Yes" }, "en", false);
    expect(f.options!.map((o) => o.value)).toEqual(["yes", "yes_2"]);
  });

  it("keeps a locked choice's value and its default through a rename", () => {
    const f = field([{ value: "open", label: "Open" }], { default: "open" });
    applyChoiceName(f, 0, { en: "Opened" }, "en", true);
    expect(f.options![0]).toEqual({ value: "open", label: { en: "Opened" } });
    expect(f.default).toBe("open");
  });

  it("follows a choice added after the publish while a published sibling stays", () => {
    const published = collectOptionValues({ fields: [{ id: "field_status", options: [{ value: "open" }] }] }).get("field_status")!;
    const f = field([
      { value: "open", label: "Open" },
      { value: "", label: "" },
    ]);
    const lockedAt = (i: number) => f.options![i]!.value !== "" && published.has(f.options![i]!.value!);
    applyChoiceName(f, 0, { en: "Opened" }, "en", lockedAt(0));
    applyChoiceName(f, 1, { en: "In review" }, "en", lockedAt(1));
    applyChoiceName(f, 1, { en: "Under review" }, "en", lockedAt(1));
    expect(f.options!.map((o) => o.value)).toEqual(["open", "under_review"]);
  });

  it("carries the field's default along with a moved value", () => {
    const f = field([{ value: "in_review", label: "In review" }], { default: "in_review" });
    applyChoiceName(f, 0, { en: "Under review" }, "en", false);
    expect(f.default).toBe("under_review");
  });

  it("leaves a default that names another choice", () => {
    const f = field(
      [
        { value: "open", label: "Open" },
        { value: "in_review", label: "In review" },
      ],
      { default: "open" },
    );
    applyChoiceName(f, 1, { en: "Under review" }, "en", false);
    expect(f.default).toBe("open");
  });

  it("rewrites the matching member of a list default", () => {
    const f = field(
      [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      { type: "list", default: ["a", "b"] },
    );
    applyChoiceName(f, 1, { en: "Bee" }, "en", false);
    expect(f.default).toEqual(["a", "bee"]);
  });

  it("leaves an expression default", () => {
    const f = field([{ value: "a", label: "A" }], { default: { lang: "cel", src: "'a'" } });
    applyChoiceName(f, 0, { en: "Alpha" }, "en", false);
    expect(f.default).toEqual({ lang: "cel", src: "'a'" });
  });

  it("writes the name alone for a hand-set value", () => {
    const f = field([{ value: "rv", label: "In review" }], { default: "rv" });
    applyChoiceName(f, 0, { en: "Under review" }, "en", false);
    expect(f.options![0]).toEqual({ value: "rv", label: { en: "Under review" } });
    expect(f.default).toBe("rv");
  });
});

describe("collectOptionValues", () => {
  it("maps each field id to its choice values, groups' nested fields included", () => {
    const map = collectOptionValues({
      fields: [
        { id: "field_a", options: [{ value: "x" }, { value: "y" }] },
        { id: "field_g", type: "group", fields: [{ id: "field_b", options: [{ value: "z" }] }, { id: "field_c" }] },
      ],
    });
    expect([...map.keys()].sort()).toEqual(["field_a", "field_b"]);
    expect([...map.get("field_a")!]).toEqual(["x", "y"]);
    expect([...map.get("field_b")!]).toEqual(["z"]);
  });

  it("answers an empty map for a body with no catalog", () => {
    expect(collectOptionValues(null).size).toBe(0);
    expect(collectOptionValues({}).size).toBe(0);
  });
});
