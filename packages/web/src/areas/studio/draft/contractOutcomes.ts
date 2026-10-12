/**
 * The outcome list after adding `text`. The text is stored trimmed, because a
 * parent guard compares `child.outcome` to the stored string exactly. A text
 * that trims to nothing, or that the list already holds, returns the same list.
 */
export function appendOutcome(outcomes: readonly string[], text: string): readonly string[] {
  const outcome = text.trim();
  if (outcome === "" || outcomes.includes(outcome)) return outcomes;
  return [...outcomes, outcome];
}
