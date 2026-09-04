/**
 * Which zone of the Fields view a check on the selected field belongs to,
 * read off the check's own `loc` (`EditorIssue.loc`). A check on the key
 * stands in "What this field asks", a check on an option in "Where values
 * come from", a check on a validation rule in "Validation".
 *
 * Answers `undefined` for a `loc` naming no zone this view draws. The caller
 * stands such a check at the top of the definition half, so no check goes
 * unshown for want of a matching zone (studio-app: "A field's checks stand at
 * the zone each one belongs to").
 *
 * Pure and view-free: the ids below are keys the view maps to its own
 * headings, not the headings themselves. Four zones the view draws take no id
 * here — "Used in", "Only ask this when" and "Ask for this" describe a view
 * entry, which anchors on its own step rather than on the selected field, and
 * a check on the whole catalog anchors on the process.
 */
export type FieldCheckZone = "asks" | "kind" | "values" | "default" | "validation" | "columnMapping";

/** The field-declaration key each zone owns. A key absent here names no zone,
 * which is the top-of-half fallback rather than a gap. */
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
 * `lastIndexOf` finds the anchor, so a check inside a group's child resolves
 * against the child. The anchor is also what keeps an unrelated `loc` out:
 * `workflow.steps[0].onEntry[0].config.x` carries no `fields` token, so
 * nothing is scanned and the answer is `undefined`.
 */
export function fieldCheckZone(loc: string): FieldCheckZone | undefined {
  const segments = loc
    .split(".")
    .map((s) => s.replace(/\[\d+\]$/, ""))
    .filter((s) => s.length > 0);

  const anchor = segments.lastIndexOf("fields");
  if (anchor === -1) return undefined;

  for (const segment of segments.slice(anchor + 1)) {
    const zone = ZONE_BY_KEY[segment];
    if (zone) return zone;
  }
  return undefined;
}
