/**
 * src/schema/strip-compiled.ts: the inverse of compileProcessBody's cancel-sink
 * injection. The round trip over `examples/` is the guard that keeps the two in
 * step — an eighth compile-pass addition fails these, which is the point.
 * Pure schema work; no DB, so nothing skips.
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { authoredProcessBody, type ProcessBody } from "../src/schema/definition.js";
import { compileProcessBody } from "../src/schema/compile.js";
import { stripCompiledContent } from "../src/schema/strip-compiled.js";

const EXAMPLES = [
  "expense-approval.json",
  "subprocess-credit-check-child.json",
  "subprocess-loan-parent.json",
  "purchase-requisition.json",
];

function readExample(name: string): ProcessBody {
  const raw = JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf-8"));
  return (raw.definition ?? raw) as ProcessBody;
}

describe("stripCompiledContent", () => {
  for (const name of EXAMPLES) {
    test(`round-trips ${name}`, () => {
      const authored = readExample(name);
      expect(stripCompiledContent(compileProcessBody(authored))).toEqual(authoredProcessBody.parse(authored));
    });
  }

  test("removes the reserved outcome from a contracted process", () => {
    // The only example carrying a contract, so the only one exercising the
    // outcome half of the inverse.
    const compiled = compileProcessBody(readExample("subprocess-credit-check-child.json"));
    expect(compiled.contract?.outcomes).toContain("cancelled");
    expect(stripCompiledContent(compiled).contract?.outcomes).not.toContain("cancelled");
  });

  test("a stripped body is accepted by authoredProcessBody", () => {
    // What makes a seeded draft editable: the compiled body is rejected outright.
    const compiled = compileProcessBody(readExample("subprocess-credit-check-child.json"));
    expect(authoredProcessBody.safeParse(compiled).success).toBe(false);
    expect(authoredProcessBody.safeParse(stripCompiledContent(compiled)).success).toBe(true);
  });

  test("leaves an already-authored body alone", () => {
    const authored = authoredProcessBody.parse(readExample("expense-approval.json"));
    expect(stripCompiledContent(authored)).toEqual(authored);
  });

  test("does not mutate its input", () => {
    const compiled = compileProcessBody(readExample("subprocess-credit-check-child.json"));
    const before = JSON.stringify(compiled);
    stripCompiledContent(compiled);
    expect(JSON.stringify(compiled)).toBe(before);
  });
});
