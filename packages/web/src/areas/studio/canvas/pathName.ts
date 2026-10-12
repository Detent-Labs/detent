import type { PathTrigger } from "workflow-engine/schema";
import { t } from "../catalog.js";

/** A path's accessible name. The guard is a slot rather than an appended
 * segment: every path either carries one or says it carries none. The
 * trigger slot takes the schema's own enum value, which this catalog leaves
 * untranslated on purpose.
 *
 * `guardText` is the readable guard the edge label already draws, and the
 * caller passes it because the operands it rests on resolve per step. A
 * reader would otherwise hear the CEL source, `data.amount > 1000`, while
 * the readable string sits beside it under `aria-hidden`. `edgeGuardLabel`
 * returns the source itself where nothing resolves, so the fallback holds.
 * The caller resolves both step labels, since they read the content locale. */
export function pathName(
  path: { label?: string; trigger?: PathTrigger; priority?: number },
  sourceLabel: string,
  targetLabel: string,
  guardText: string | undefined,
): string {
  const parts = [
    t("canvas.pathLabel")
      .replace("{label}", path.label ?? "")
      .replace("{source}", sourceLabel)
      .replace("{target}", targetLabel)
      .replace("{trigger}", path.trigger ?? t("canvas.pathLabelNoTrigger"))
      .replace("{guard}", guardText ?? t("canvas.pathLabelNoGuard")),
  ];
  if (path.trigger === "automatic" && path.priority !== undefined) {
    parts.push(t("canvas.pathLabelPriority").replace("{priority}", String(path.priority)));
  }
  return parts.join(", ");
}
