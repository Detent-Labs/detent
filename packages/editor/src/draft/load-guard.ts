/**
 * Load-time safety check only — deliberately looser than the contract and
 * never asked to express a business invariant (design.md decision 3). Its
 * one job is to stop a malformed on-disk file from crashing the editor with
 * a property-access-on-undefined before the file becomes a Draft. Real
 * validation is draft/validate.ts, which parses through the actual
 * `authoredProcessBody` Zod schema.
 */
export interface LoadGuardIssue {
  path: string;
  message: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function checkDraftShape(value: unknown): LoadGuardIssue[] {
  const issues: LoadGuardIssue[] = [];

  if (!isPlainObject(value)) {
    issues.push({ path: "", message: "root is not a JSON object" });
    return issues;
  }

  const expectString = (key: string) => {
    if (key in value && value[key] !== undefined && typeof value[key] !== "string") {
      issues.push({ path: key, message: `'${key}' must be a string if present` });
    }
  };
  const expectArray = (key: string) => {
    if (key in value && value[key] !== undefined && !Array.isArray(value[key])) {
      issues.push({ path: key, message: `'${key}' must be an array if present` });
    }
  };
  const expectObject = (key: string) => {
    if (key in value && value[key] !== undefined && !isPlainObject(value[key])) {
      issues.push({ path: key, message: `'${key}' must be an object if present` });
    }
  };

  expectString("key");
  expectObject("label");
  expectObject("description");
  expectObject("contract");
  expectArray("fields");
  expectArray("dataSources");
  expectObject("workflow");

  return issues;
}
