import type { InstanceRecordElement } from "./types.js";

/** One line per record row, not the full raw payload. The admin instance screen adds its own `detail` on top, the only place that renders it. */
export function describeRecordElement(el: InstanceRecordElement): { at: string; summary: string } {
  if (el.kind === "transition") {
    const e = el.entry;
    return { at: e.at, summary: `transition — ${e.cause}${e.pathId ? ` via ${e.pathId}` : ""} — ${e.fromStepId ?? "(start)"} → ${e.toStepId}` };
  }
  return { at: el.event.at, summary: `event — ${el.event.kind}` };
}
