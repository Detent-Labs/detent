import type { LocaleCode } from "workflow-engine/schema";
import type { SubmissionIssue } from "./types.js";

/**
 * Localized message catalog for `SubmissionIssue.kind`, keyed the way
 * `packages/app/src/errors.ts::describeError` keys transport errors — one
 * message per failure, owned by `form-ui` rather than duplicated in each
 * consumer (design.md: "form-ui owns the issue-message catalog, not its
 * consumers"). The seven kinds below are every kind `submitAndTransition`
 * (`src/runtime/api.ts::SubmissionIssue`) can produce as of this writing; a
 * kind added there later falls back to its raw discriminator here (see
 * `issueMessage`) rather than crashing or rendering nothing.
 */

type MessageFn = (issue: SubmissionIssue) => string;
type Catalog = Record<string, MessageFn>;

const CONSTRAINT_LABEL: Record<string, { en: string; de: string }> = {
  min: { en: "too small", de: "zu klein" },
  max: { en: "too large", de: "zu groß" },
  minLength: { en: "too short", de: "zu kurz" },
  maxLength: { en: "too long", de: "zu lang" },
  pattern: { en: "in the wrong format", de: "im falschen Format" },
};

function constraintMessage(issue: SubmissionIssue, locale: "en" | "de"): string {
  const key = typeof issue.constraint === "string" ? issue.constraint : undefined;
  const label = key ? CONSTRAINT_LABEL[key]?.[locale] : undefined;
  if (locale === "de") return label ? `Dieser Wert ist ${label}.` : "Dieser Wert erfüllt eine Regel nicht.";
  return label ? `This value is ${label}.` : "This value doesn't meet a requirement.";
}

function typeMismatchMessage(issue: SubmissionIssue, locale: "en" | "de"): string {
  const expected = typeof issue.expected === "string" ? issue.expected : undefined;
  if (locale === "de") return expected ? `Dieser Wert hat den falschen Typ (erwartet: ${expected}).` : "Dieser Wert hat den falschen Typ.";
  return expected ? `This value has the wrong type (expected ${expected}).` : "This value has the wrong type.";
}

const en: Catalog = {
  "unknown-field": () => "This field isn't part of the form.",
  "readonly-field": () => "This field can't be edited.",
  "type-mismatch": (issue) => typeMismatchMessage(issue, "en"),
  "invalid-option": () => "Choose one of the listed options.",
  constraint: (issue) => constraintMessage(issue, "en"),
  "rule-failed": () => "This value isn't valid.",
  "required-missing": () => "This field is required.",
};

const de: Catalog = {
  "unknown-field": () => "Dieses Feld ist nicht Teil des Formulars.",
  "readonly-field": () => "Dieses Feld kann nicht bearbeitet werden.",
  "type-mismatch": (issue) => typeMismatchMessage(issue, "de"),
  "invalid-option": () => "Wählen Sie eine der aufgeführten Optionen.",
  constraint: (issue) => constraintMessage(issue, "de"),
  "rule-failed": () => "Dieser Wert ist ungültig.",
  "required-missing": () => "Dieses Feld ist erforderlich.",
};

const catalogs: Record<string, Catalog> = { en, de };

/**
 * `issue.kind` resolved to a localized sentence, falling back through
 * `locale` -> `baseLocale` -> the raw `kind` — so a kind with no catalog
 * entry degrades to today's behavior (the discriminator text) rather than
 * rendering nothing or throwing.
 */
export function issueMessage(issue: SubmissionIssue, locale: LocaleCode, baseLocale: LocaleCode = locale): string {
  const fn = catalogs[locale]?.[issue.kind] ?? catalogs[baseLocale]?.[issue.kind] ?? catalogs.en[issue.kind];
  return fn ? fn(issue) : issue.kind;
}
