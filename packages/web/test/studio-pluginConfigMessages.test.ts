import { describe, expect, it } from "bun:test";
import { validateField } from "../src/areas/studio/panels/shared/PluginEnvelopeEditor.js";
import type { ConfigFieldDescriptor } from "../src/areas/studio/api/types.js";

/**
 * `ui-string-overrides`: a plugin config message is one whole catalog sentence
 * with its number or list filled in. Each case also asserts no `{` is left.
 */

const field = (extra: Partial<ConfigFieldDescriptor>): ConfigFieldDescriptor => ({
  key: "f",
  kind: "string",
  required: false,
  ...extra,
});

function message(descriptor: ConfigFieldDescriptor, value: unknown): string | undefined {
  const text = validateField(descriptor, value);
  if (text !== undefined) expect(text).not.toContain("{");
  return text;
}

describe("validateField messages", () => {
  it("states a minimum length", () => {
    expect(message(field({ minLength: 3 }), "ab")).toBe("Enter at least 3 characters.");
  });

  it("states a maximum length", () => {
    expect(message(field({ maxLength: 2 }), "abc")).toBe("Enter at most 2 characters.");
  });

  it("states a minimum number", () => {
    expect(message(field({ kind: "number", min: 5 }), 4)).toBe("Enter 5 or more.");
  });

  it("states a maximum number", () => {
    expect(message(field({ kind: "number", max: 5 }), 6)).toBe("Enter 5 or less.");
  });

  it("states a minimum item count", () => {
    expect(message(field({ kind: "string-array", minItems: 2 }), ["a"])).toBe("Add at least 2 item(s).");
  });

  it("states a maximum item count", () => {
    expect(message(field({ kind: "string-array", maxItems: 1 }), ["a", "b"])).toBe("Keep at most 1 item(s).");
  });

  it("rejects an email address, as a string and in a list", () => {
    expect(message(field({ format: "email" }), "nobody")).toBe("Enter a valid email address.");
    expect(message(field({ kind: "string-array", format: "email" }), ["a@b.co", "nobody"])).toBe("Enter a valid email address.");
  });

  it("lists the allowed values, and keeps a dollar sign in one literal", () => {
    expect(message(field({ kind: "string-array", enumValues: ["a", "b"] }), ["c"])).toBe("Choose from: a, b");
    expect(message(field({ kind: "string-array", enumValues: ["$&", "b"] }), ["c"])).toBe("Choose from: $&, b");
  });

  it("says nothing for a value that holds", () => {
    expect(message(field({ minLength: 3, maxLength: 5 }), "abcd")).toBeUndefined();
  });
});
