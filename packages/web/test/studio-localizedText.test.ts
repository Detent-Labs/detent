import { describe, expect, it } from "bun:test";
import {
  collectUsedLocales,
  fieldLocaleGaps,
  localeGapCount,
  missingTranslationWarning,
  resolveAddLocaleAttempt,
} from "../src/areas/studio/draft/localized-text.js";
import type { Draft } from "../src/areas/studio/draft/types.js";

/**
 * The gate two call sites share: the content-locale switcher's "add a locale"
 * button, and the process header's baseLocale control, which moves the edited
 * content locale only for a value that parses. `packages/web` has no
 * interactive DOM test environment (static rendering fires no event), so this
 * pure function is where that branch is testable at all.
 */
describe("resolveAddLocaleAttempt", () => {
  it("accepts a well-formed locale code", () => {
    expect(resolveAddLocaleAttempt("de")).toEqual({ ok: true, locale: "de" });
  });

  it("accepts a region-qualified locale code", () => {
    expect(resolveAddLocaleAttempt("de-AT")).toEqual({ ok: true, locale: "de-AT" });
  });

  // The state the baseLocale input passes through on the way to "de". Moving
  // the content locale here would write a `label.d` entry on the next
  // keystroke in any text field, and `collectUsedLocales` would then offer
  // "d" in the switcher for good.
  it("rejects a part-typed code", () => {
    expect(resolveAddLocaleAttempt("d")).toEqual({ ok: false });
  });

  it("rejects an empty value", () => {
    expect(resolveAddLocaleAttempt("")).toEqual({ ok: false });
  });

  it("rejects a malformed region suffix", () => {
    expect(resolveAddLocaleAttempt("de-at")).toEqual({ ok: false });
  });
});

/**
 * One draft covering every position `forEachLocalizedEntry` walks, so a
 * position dropped from that walk shows up as a changed count here rather
 * than as a warning nobody draws.
 *
 * Five entries carry `en` and lack `de`. A sixth (`option b`) carries `de`
 * alone, and must not count: `runValidation` already reports a missing
 * base-locale entry, and counting it here would report one unfilled entry
 * twice under two names.
 */
const gapDraft = (): Draft =>
  ({
    key: "p",
    baseLocale: "en",
    label: { en: "P", de: "P" },
    description: { en: "Process description" },
    fields: [
      {
        id: "field_amount",
        key: "amount",
        type: "number",
        label: { en: "Amount" },
        description: { en: "How much", de: "Wie viel" },
      },
      {
        id: "field_group",
        key: "group",
        type: "group",
        label: { en: "Group", de: "Gruppe" },
        fields: [{ id: "field_nested", key: "nested", type: "string", label: { en: "Nested" } }],
      },
      {
        id: "field_choice",
        key: "choice",
        type: "string",
        label: { en: "Choice", de: "Auswahl" },
        options: [
          { value: "a", label: { en: "A" } },
          { value: "b", label: { de: "B" } },
        ],
      },
    ],
    workflow: {
      initialStep: "step_a",
      steps: [
        {
          id: "step_a",
          key: "a",
          type: "task",
          label: { en: "A" },
          description: { en: "Step A", de: "Schritt A" },
        },
      ],
    },
  }) as unknown as Draft;

describe("collectUsedLocales", () => {
  it("collects every locale key in the draft, sorted", () => {
    expect(collectUsedLocales(gapDraft())).toEqual(["de", "en"]);
  });

  it("reaches a locale used only on a nested group sub-field", () => {
    const draft = gapDraft();
    (draft.fields![1]!.fields![0]! as { label: Record<string, string> }).label = { en: "Nested", fr: "Imbriqué" };

    expect(collectUsedLocales(draft)).toEqual(["de", "en", "fr"]);
  });

  it("offers the base locale of a draft with no content at all", () => {
    expect(collectUsedLocales({ baseLocale: "de" } as Draft)).toEqual(["de"]);
  });

  it("falls back to en for a draft declaring no base locale", () => {
    expect(collectUsedLocales({} as Draft)).toEqual(["en"]);
  });

  it("reaches a locale only a note's text declares", () => {
    const draft = {
      baseLocale: "en",
      label: { en: "P" },
      workflow: {
        steps: [{ id: "step_a", label: { en: "A" }, view: { fields: [{ kind: "note", text: { en: "Note", fr: "Note-fr" } }] } }],
      },
    } as unknown as Draft;
    expect(collectUsedLocales(draft)).toEqual(["en", "fr"]);
  });
});

describe("localeGapCount", () => {
  it("counts every entry carrying the base locale but not the target", () => {
    expect(localeGapCount(gapDraft(), "de")).toBe(5);
  });

  it("does not count an entry that lacks the base locale itself", () => {
    // `option b` carries `de` alone. Dropping the `de` entry leaves it with
    // no locale at all, and the count must not move either way.
    const draft = gapDraft();
    (draft.fields![2]!.options![1]! as { label: Record<string, string> }).label = {};

    expect(localeGapCount(draft, "de")).toBe(5);
  });

  it("never counts the base locale against itself", () => {
    expect(localeGapCount(gapDraft(), "en")).toBe(0);
  });

  it("counts nothing for a locale that is filled in everywhere", () => {
    const draft = gapDraft();
    (draft as { description: Record<string, string> }).description = { en: "P", de: "P" };
    (draft.workflow!.steps![0]! as { label: Record<string, string> }).label = { en: "A", de: "A" };
    (draft.fields![0]! as { label: Record<string, string> }).label = { en: "Amount", de: "Betrag" };
    (draft.fields![1]!.fields![0]! as { label: Record<string, string> }).label = { en: "Nested", de: "Verschachtelt" };
    (draft.fields![2]!.options![0]! as { label: Record<string, string> }).label = { en: "A", de: "A" };

    expect(localeGapCount(draft, "de")).toBe(0);
  });

  it("treats a draft with no declared base locale as en", () => {
    const draft = gapDraft();
    delete (draft as { baseLocale?: string }).baseLocale;

    expect(localeGapCount(draft, "de")).toBe(5);
    expect(localeGapCount(draft, "en")).toBe(0);
  });

  it("counts an untranslated note's text", () => {
    const draft = {
      baseLocale: "en",
      label: { en: "P", fr: "P" },
      workflow: {
        steps: [
          { id: "step_a", label: { en: "A", fr: "A" }, view: { fields: [{ kind: "note", text: { en: "Note" } }] } },
        ],
      },
    } as unknown as Draft;
    expect(localeGapCount(draft, "fr")).toBe(1);
  });
});

describe("fieldLocaleGaps", () => {
  it("counts a translated label alongside an untranslated option label", () => {
    // field_choice: label {en, de} (no gap), option a {en} only (1 gap),
    // option b {de} only — lacks the base locale, so it does not count.
    expect(fieldLocaleGaps(gapDraft().fields![2]!, "de", "en")).toBe(1);
  });

  it("counts nothing for a fully translated field", () => {
    // field_group: label {en, de}, no description, no options.
    expect(fieldLocaleGaps(gapDraft().fields![1]!, "de", "en")).toBe(0);
  });

  it("does not count an option lacking the base-locale value", () => {
    const draft = gapDraft();
    (draft.fields![2]!.options![1]! as { label: Record<string, string> }).label = {};
    expect(fieldLocaleGaps(draft.fields![2]!, "de", "en")).toBe(1);
  });

  it("returns 0 while the base locale is the one being edited", () => {
    expect(fieldLocaleGaps(gapDraft().fields![0]!, "en", "en")).toBe(0);
  });

  it("excludes a group field's own children from its count", () => {
    const draft = gapDraft();
    // field_nested (field_group's child) carries {en} alone — a gap on its
    // own row, which the group's own count must not also carry.
    expect(fieldLocaleGaps(draft.fields![1]!, "de", "en")).toBe(0);
  });
});

describe("missingTranslationWarning", () => {
  it("warns for an entry carrying the base locale but not the current one", () => {
    expect(missingTranslationWarning({ en: "Amount" }, "de", "en")).toBe(
      "No de translation yet. Publishing still works; a reader of de sees the en text.",
    );
  });

  it("draws nothing when the current locale is filled in", () => {
    expect(missingTranslationWarning({ en: "Amount", de: "Betrag" }, "de", "en")).toBeUndefined();
  });

  // The rejected input: `runValidation` already reports this entry as a
  // missing base-locale EditorIssue. A second message under the same input
  // would name one unfilled entry twice.
  it("draws nothing for an entry that lacks the base locale", () => {
    expect(missingTranslationWarning({ de: "Betrag" }, "fr", "en")).toBeUndefined();
    expect(missingTranslationWarning(undefined, "de", "en")).toBeUndefined();
    expect(missingTranslationWarning({}, "de", "en")).toBeUndefined();
  });

  it("draws nothing while the base locale is the one being edited", () => {
    expect(missingTranslationWarning({ en: "Amount" }, "en", "en")).toBeUndefined();
  });

  it("treats an empty string as no translation, not as a translation", () => {
    expect(missingTranslationWarning({ en: "Amount", de: "" }, "de", "en")).toBe(
      "No de translation yet. Publishing still works; a reader of de sees the en text.",
    );
    expect(missingTranslationWarning({ en: "" }, "de", "en")).toBeUndefined();
  });

  // `Draft` is `DraftOf<AuthoredProcessBody>`, so `draft.baseLocale` reaches
  // every call site as `string | undefined`.
  it("falls back to en for an absent base locale", () => {
    expect(missingTranslationWarning({ en: "Amount" }, "de", undefined)).toBe(
      "No de translation yet. Publishing still works; a reader of de sees the en text.",
    );
    expect(missingTranslationWarning({ en: "Amount" }, "en", undefined)).toBeUndefined();
  });
});
