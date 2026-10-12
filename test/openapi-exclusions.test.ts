/**
 * docs/openapi.yaml documents the customer-facing surface and names the
 * internal-only prefixes it deliberately leaves out. This asserts both halves.
 * The document lists every route the spec requires, under its path and method.
 * A role-gated surface that exists only to back a frontend this repo ships must
 * not appear as a documented path, and must be named in the exclusion note so a
 * reader can tell its absence is a decision.
 *
 * Text-level, not a YAML parse: the document declares no dependency on a YAML
 * parser and the assertion does not need one.
 */
import { test, expect } from "bun:test";

const DOC = await Bun.file(new URL("../docs/openapi.yaml", import.meta.url)).text();

const EXCLUDED = ["admin", "drafts", "migration-plans", "reporting", "templates"] as const;

/** Path keys are the two-space-indented `  /foo/...:` entries under `paths:`. */
const documentedPaths = [...DOC.matchAll(/^ {2}(\/[^\s:]*):/gm)].map((m) => m[1]!);

/** `:name` and `{name}` segments both become `{}`, so the spec and the document compare. */
const normalise = (path: string) => path.replace(/:\w+|\{\w+\}/g, "{}");

/** Path key (normalised) to its method keys: the four-space-indented `    get:` lines under it. */
const documentedMethods = new Map<string, Set<string>>();
{
  let current: Set<string> | undefined;
  for (const line of DOC.split("\n")) {
    const path = /^ {2}(\/[^\s:]*):/.exec(line);
    if (path) {
      current = documentedMethods.get(normalise(path[1]!)) ?? new Set<string>();
      documentedMethods.set(normalise(path[1]!), current);
      continue;
    }
    const method = /^ {4}(get|put|post|delete|patch):/.exec(line);
    if (method && current) current.add(method[1]!.toUpperCase());
  }
}

test("every route the spec requires is documented under its path and method", async () => {
  const spec = await Bun.file(new URL("../openspec/specs/http-api-documentation/spec.md", import.meta.url)).text();
  const start = spec.indexOf("It SHALL describe every route");
  const end = spec.indexOf("It SHALL NOT", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const required = [...spec.slice(start, end).matchAll(/`(GET|PUT|POST|DELETE|PATCH)\s+(\/[^`\s]*)`/g)].map(
    (m) => `${m[1]} ${normalise(m[2]!)}`,
  );
  // A paragraph that yields no pair would make the check below vacuous.
  expect(required.length).toBeGreaterThan(0);
  const missing = required.filter((route) => {
    const [method, path] = route.split(" ") as [string, string];
    return !documentedMethods.get(path)?.has(method);
  });
  expect(missing).toEqual([]);
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

test("the draft save and the three visibility writes are documented", () => {
  // All four sit inside the instance lifecycle the document advertises. No
  // screen in `packages/web` calls the three visibility writes, which is how
  // they stayed out of the document while every screen-backed route went in.
  expect(documentedPaths).toContain("/instances/{instanceId}/draft");
  expect(documentedPaths).toContain("/instances/{instanceId}/visibility/grant");
  expect(documentedPaths).toContain("/instances/{instanceId}/visibility/revoke");
  expect(documentedPaths).toContain("/instances/{instanceId}/visibility/restore");
});

test("neither studio version read is documented, while the list route stays", () => {
  // Whole-path comparisons, not a prefix: `/processes/{processId}/versions` is
  // documented and an integration needs it, so a prefix check would flag it.
  expect(documentedPaths).not.toContain("/processes/{processId}/versions/{version}");
  expect(documentedPaths).not.toContain("/processes/{processId}/versions/{version}/orphan-keys");
  expect(documentedPaths).toContain("/processes/{processId}/versions");
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
