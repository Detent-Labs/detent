import { authoredProcessBody } from "workflow-engine/schema";
import type { Draft } from "./types";

export interface DraftValidationIssue {
  path: (string | number)[];
  message: string;
}

export interface DraftValidationResult {
  valid: boolean;
  issues: DraftValidationIssue[];
}

/**
 * The Draft has no independent notion of "valid" (design.md decision 3):
 * this assembles it into `AuthoredProcessBody` shape and asks the real,
 * imported schema, collecting every located issue rather than stopping at
 * the first — `ZodError.issues` already accumulates across the whole parse,
 * so a plain `safeParse` is enough.
 */
export function validateDraft(draft: Draft): DraftValidationResult {
  const result = authoredProcessBody.safeParse(draft);
  if (result.success) {
    return { valid: true, issues: [] };
  }
  return {
    valid: false,
    issues: result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
  };
}
