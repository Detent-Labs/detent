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

test("the public override read is documented, and its two admin siblings are not", () => {
  // A route any caller can reach without a token belongs in one list or the
  // other. Omitting it would read as an oversight rather than as a decision.
  expect(documentedPaths).toContain("/ui-strings");
  expect(documentedPaths).not.toContain("/admin/ui-strings");
});

test("the public override read declares that it needs no role and no token", () => {
  const entry = DOC.slice(DOC.indexOf("  /ui-strings:"), DOC.indexOf("  /metrics:"));
  expect(entry).toContain("Needs no role and no token.");
  // An empty `security` array is how this document says "no bearer token here",
  // the same way /livez, /readyz and /auth/login say it.
  expect(entry).toContain("security: []");
});

test("the self-scoped account routes are documented, each needing a token and no role", () => {
  // Any session reaches these two, and they administer nobody, so the `admin/*`
  // exclusion does not cover them.
  expect(documentedPaths).toContain("/account/me");
  const entry = DOC.slice(DOC.indexOf("  /account/me:"), DOC.indexOf("  /livez:"));
  expect(entry).toContain("get:");
  expect(entry).toContain("patch:");
  // Two statements of the auth requirement, one per method. Neither carries the
  // `security: []` that says "no token here" — the document's default
  // `bearerAuth` applies to both.
  expect([...entry.matchAll(/Needs a token and no role/g)]).toHaveLength(2);
  expect(entry).not.toContain("security: []");
});

test("neither account route claims a 404", () => {
  // A resolvable actor the engine holds no local account for reads as
  // federated, not as missing, so the read answers 200 and the write 403.
  const entry = DOC.slice(DOC.indexOf("  /account/me:"), DOC.indexOf("  /livez:"));
  expect(entry).not.toContain('"404"');
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
