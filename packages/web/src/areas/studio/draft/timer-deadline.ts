import type { Expression, Timer } from "workflow-engine/schema";
import type { DraftOf } from "./types";

type DraftExpression = DraftOf<Expression>;
type DraftTimer = DraftOf<Timer>;

/**
 * The patch a deadline input writes. The input reports `undefined` for empty
 * text. A deadline timer stays a deadline then, with an empty expression, so
 * the kind select and the input stay on screen (`studio-step-page`, "A timer
 * keeps the kind the author chose").
 */
export function deadlinePatch(deadline: DraftExpression | undefined): Pick<DraftTimer, "deadline"> {
  return { deadline: deadline ?? { lang: "cel", src: "" } };
}
