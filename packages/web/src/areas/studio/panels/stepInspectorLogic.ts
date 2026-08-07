/**
 * `StepsPanel`'s selection-driven open-section rule (studio-canvas:
 * "Selecting a path edge shows its source step's inspector... The selected
 * path's own row SHALL also highlight within the expanded paths section").
 * A path is not independently addressable — it only exists nested under its
 * step — so selecting one must open straight to the paths section. Any
 * other selection change (a plain node click, a deselect) starts collapsed:
 * the previous step's open section belongs to that step, not the new one.
 */
export function openSectionForSelection(selectedPathId: string | undefined): "paths" | undefined {
  return selectedPathId ? "paths" : undefined;
}
