/**
 * docs/openapi.yaml documents the customer-facing surface and names the
 * internal-only prefixes it deliberately leaves out. This asserts the second
 * half: a role-gated surface that exists only to back a frontend this repo
 * ships must not appear as a documented path, and must be named in the
 * exclusion note so a reader can tell its absence is a decision.
 *
 * Text-level, not a YAML parse: the document declares no dependency on a YAML
 * parser and the assertion does not need one.
 */
import { test, expect } from "bun:test";

const DOC = await Bun.file(new URL("../docs/openapi.yaml", import.meta.url)).text();

const EXCLUDED = ["admin", "drafts", "migration-plans", "reporting"] as const;

/** Path keys are the two-space-indented `  /foo/...:` entries under `paths:`. */
const documentedPaths = [...DOC.matchAll(/^ {2}(\/[^\s:]*):/gm)].map((m) => m[1]!);

test("the document declares at least the customer-facing paths", () => {
  expect(documentedPaths).toContain("/auth/login");
  expect(documentedPaths.length).toBeGreaterThan(10);
});

test("no internal-only prefix appears as a documented path", () => {
  for (const prefix of EXCLUDED) {
    const offenders = documentedPaths.filter((p) => p.startsWith(`/${prefix}/`) || p === `/${prefix}`);
    expect(offenders).toEqual([]);
  }
});

test("every internal-only prefix is named in the exclusion note", () => {
  for (const prefix of EXCLUDED) {
    expect(DOC).toContain(`\`${prefix}/*\``);
  }
  expect(DOC).toContain("`registry`");
});
