import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";

export type BoolOrExpr = boolean | DraftOf<Expression> | undefined;
export type OverrideMode = "boolean" | "cel";

export function isExpression(v: BoolOrExpr): v is DraftOf<Expression> {
  return typeof v === "object" && v !== null;
}

/**
 * Which arm a view override shows.
 *
 * The mode cannot be read off the value alone. A condition builder writes
 * `undefined` for as long as its only row is incomplete, and an override that
 * read `undefined` as "not an expression" would collapse to the checkbox on the
 * author's first click — taking the half-filled row with it.
 *
 * So `undefined` is the one ambiguous state, and there the author's last choice
 * decides. A value that is actually present speaks for itself, whatever was
 * chosen before: an Expression shows CEL, a boolean shows the checkbox.
 */
export function overrideMode(value: BoolOrExpr, chosen: OverrideMode | undefined): OverrideMode {
  if (isExpression(value)) return "cel";
  if (typeof value === "boolean") return "boolean";
  return chosen ?? "boolean";
}
