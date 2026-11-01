import type { FieldCheckZone } from "./fieldCheckZone.js";

/**
 * Where a Fix control's focus lands on the Fields tab (`studio-process-tabs`:
 * "A Fix control moves focus to the place", design.md D7). The tab mounts one
 * editor at a time, so one id per zone serves every field.
 */

/** The list of checks one zone of the field card prints. The unplaced checks
 * share the `asks` anchor. */
export const fieldCheckAnchorId = (zone: FieldCheckZone): string => `check-anchor-field-${zone}`;

/** The list of checks the open source's editor prints. */
export const SOURCE_CHECK_ANCHOR_ID = "check-anchor-source";

/** The zones the card prints inside More. */
const MORE_ZONES: ReadonlySet<FieldCheckZone> = new Set<FieldCheckZone>(["default", "validation", "columnMapping"]);

/** Whether a Fix on this zone opens More. */
export function fixOpensMore(zone: FieldCheckZone | undefined): boolean {
  return zone !== undefined && MORE_ZONES.has(zone);
}

/**
 * The ids a Fix on a field tries, in order: the zone's list, then the `asks`
 * list, where a check with no zone stands and where a `values` check stands on a
 * card with no Choices. The field's rail entry closes the list, so focus never
 * falls to the page body.
 */
export function fieldFixAnchors(zone: FieldCheckZone | undefined, railId: string): string[] {
  const asks = fieldCheckAnchorId("asks");
  return zone === undefined || zone === "asks" ? [asks, railId] : [fieldCheckAnchorId(zone), asks, railId];
}

/**
 * Whether a Fix's focus pass may run. The view must show, and the editor must
 * read the requested entity. The selection falls back to the first rail entry,
 * so a selected id alone does not say that.
 */
export function fixLandsNow(visible: boolean, requested: string | undefined, selected: string | undefined): boolean {
  return visible && requested !== undefined && requested === selected;
}

/** What `focusCheckAnchor` reads of an element. */
interface AnchorElement {
  closest: (selector: "details") => { open: boolean; parentElement: AnchorElement | null } | null;
  focus: () => void;
}

/**
 * Focuses the first id that stands in the page. A closed `<details>` keeps its
 * content out of focus, and a hand-closed More under a standing check stays
 * closed whatever its `open` prop says, so each one around the element opens
 * here first.
 */
export function focusCheckAnchor(ids: readonly string[], find: (id: string) => AnchorElement | null = (id) => document.getElementById(id)): void {
  for (const id of ids) {
    const element = find(id);
    if (element === null) continue;
    for (let fold = element.closest("details"); fold !== null; fold = fold.parentElement?.closest("details") ?? null) fold.open = true;
    element.focus();
    return;
  }
}
