import type { InstanceView } from "../api/types.js";

/**
 * The actor holding the claim on the instance's current step, or null. The
 * view's `assignment` is the persisted state: a transition writes a fresh,
 * unclaimed one, and a step with no assignment omits it.
 */
export function claimantOf(view: InstanceView): string | null {
  return view.assignment?.claimedBy ?? null;
}
