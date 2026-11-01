import { tailAfterField, tokenize } from "../draft/issues.js";

/**
 * Which section of the field card a check on the selected field belongs to,
 * read off the check's own `loc` (`EditorIssue.loc`). The card maps the six
 * zones onto its sections (design.md D5): `asks` stands beside the name
 * line, `kind` under Kind, `values` under Choices, and `default`,
 * `validation` and `columnMapping` inside More, which opens for them.
 *
 * Answers `undefined` for a `loc` naming no zone. The card stands such a check
 * at its top, so no check goes unshown for want of a matching section
 * (studio-app: "A field's checks stand at the zone each one belongs to").
 *
 * Pure and view-free: the ids below are keys the card maps to its own
 * sections, not the headings themselves. Asked on describes view entries,
 * which anchor on their own step rather than on the selected field, and a
 * check on the whole catalog anchors on the process.
 */
export type FieldCheckZone = "asks" | "kind" | "values" | "default" | "validation" | "columnMapping";

/** The field-declaration key each zone owns. A key absent here names no zone,
 * which is the card's top fallback rather than a gap. */
const ZONE_BY_KEY: Record<string, FieldCheckZone> = {
  key: "asks",
  label: "asks",
  description: "asks",
  type: "kind",
  format: "kind",
  control: "kind",
  technical: "kind",
  options: "values",
  dataSource: "values",
  default: "default",
  validation: "validation",
  columnMapping: "columnMapping",
};

/**
 * Reads the segments after the `fields` anchor, shallowest first, and answers
 * the first zone one of them owns. Shallowest first, because the segment
 * nearest the field names what the check is about: `fields[0].options[2]
 * .label` is a check on an option, not on a label, and reading from the far
 * end would call it one.
 *
 * The walk follows the `fields` chain, so a check inside a group's child
 * resolves against the child, and a column key `fields` stays a column key. The
 * chain is also what keeps an unrelated `loc` out:
 * `workflow.steps[0].onEntry[0].config.x` carries no `fields` token, so
 * nothing is scanned and the answer is `undefined`.
 */
export function fieldCheckZone(loc: string): FieldCheckZone | undefined {
  for (const segment of segmentsAfterAnchor(loc)) {
    const zone = ZONE_BY_KEY[segment];
    if (zone) return zone;
  }
  return undefined;
}

/**
 * Whether a check's `loc` names the field's own key, read off the same anchor
 * `fieldCheckZone` reads. The card opens More and its Developer view while
 * such a check stands, so the key input shows beside the check.
 */
export function namesFieldKey(loc: string): boolean {
  return segmentsAfterAnchor(loc)[0] === "key";
}

/**
 * Whether a check's `loc` names the field's own `technical` marker. Its zone
 * is `kind`, so it prints under Kind, and the card opens More, where the
 * Technical checkbox stands.
 */
export function namesFieldTechnical(loc: string): boolean {
  return segmentsAfterAnchor(loc)[0] === "technical";
}

/**
 * Whether a check's `loc` names the field's own data source. A removed source's
 * check opens More, where the field's source select stands.
 */
export function namesFieldSource(loc: string): boolean {
  return segmentsAfterAnchor(loc)[0] === "dataSource";
}

/** The `loc` segments past the field it names, index suffixes dropped, or none
 * for a `loc` with no `fields` token. */
function segmentsAfterAnchor(loc: string): string[] {
  return tailAfterField(tokenize(loc));
}
