/**
 * The `assignment`-missing picker's rule, kept out of React so it can be tested.
 *
 * A step with no assignment still works: the assignment-less floor in
 * `submitAndTransition` is starter-or-`system:admin`. That is not thereby an
 * invariant a self-service step must avoid, so this is a warning, never an
 * `EditorIssue`. Nothing here reaches the publish path.
 */

/** The warning to show under a step's assignment editor, or `undefined` for none. */
export function assignmentWarning(terminal: boolean | undefined, assignment: unknown): string | undefined {
  if (terminal === true || assignment !== undefined) return undefined;
  return "This step has no assignment. Only the starter or an admin can act on it, and it stays out of everyone's My-tasks inbox. Publishing still works.";
}
