import type { ValidationResult } from "../draft/validation.js";
import { ChecksRail } from "./ChecksRail.js";

interface Props {
  validation: ValidationResult;
  canPublish: boolean;
  /** Pressing Checks opens the Checks tab. It expands no list in place, under
   * the area nav or on any tab (`studio-checks-rail`). */
  onOpenChecks: () => void;
}

/**
 * The studio's area nav carries one control while a draft stands open:
 * Checks (`studio-process-tabs`). Save, Discard draft and Publish stand in
 * the header bar instead, right-aligned ahead of its `⋮` menu trigger
 * (`ProcessHeaderBar.tsx`).
 *
 * Checks is the checks rail's collapsed summary. It carries the open issue
 * count and a dot reading the worst open issue, and its accessible name
 * states both in one sentence. It stands on every tab and in every state of
 * the surface, whatever the author has selected.
 */
export function DraftNavControls({ validation, canPublish, onOpenChecks }: Props) {
  return <ChecksRail validation={validation} canPublish={canPublish} collapsed onOpen={onOpenChecks} />;
}
