/**
 * Regenerates the "Direct dependencies" table in THIRDPARTY.md. Names and
 * versions come from `bun.lock`; each license comes from the resolved
 * package's own `package.json`, so a stale install fails loudly.
 *
 * bun run scripts/thirdparty.ts           prints the table
 * bun run scripts/thirdparty.ts --write   rewrites the table in place
 * Run it in the devcontainer, after `bun install`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const list = (p: string) => { try { return readdirSync(join(ROOT, p)); } catch { return []; } };

// bun.lock is JSONC. Trailing commas are all that separate it from JSON.
const lock = JSON.parse(read("bun.lock").replace(/,(\s*[}\]])/g, "$1"));

// Every dependency a workspace manifest declares, minus the workspace `file:` links.
const direct = new Set<string>();
for (const ws of Object.values(lock.workspaces) as Record<string, Record<string, string>>[])
  for (const field of ["dependencies", "devDependencies", "peerDependencies"])
    for (const [name, range] of Object.entries(ws[field] ?? {}))
      if (!range.startsWith("file:")) direct.add(name);

function licenseOf(name: string, version: string): string {
  const store = `${name.replace("/", "+")}@${version}`;
  const dirs = list("node_modules/.bun")
    .filter((d) => d === store || d.startsWith(`${store}+`))
    .map((d) => `node_modules/.bun/${d}/node_modules/${name}`)
    .concat(`node_modules/${name}`)
    .concat(list("packages").map((w) => `packages/${w}/node_modules/${name}`));
  for (const dir of dirs) {
    try {
      const pkg = JSON.parse(read(`${dir}/package.json`));
      if (pkg.version === version) return pkg.license ?? "UNKNOWN";
    } catch {}
  }
  throw new Error(`no installed copy of ${name}@${version}; run bun install`);
}

// Match the entry id `<name>@<version>`, not the key: `@types/react` is not `react`.
const ids = (Object.values(lock.packages) as unknown[][]).map((e) => String(e[0]));
const rows = [...direct].sort().map((name) => {
  const versions = [...new Set(ids.filter((id) => id.startsWith(`${name}@`)))]
    .map((id) => id.slice(name.length + 1)).sort().reverse();
  const licenses = [...new Set(versions.map((v) => licenseOf(name, v)))];
  return `| \`${name}\` | ${versions.join(", ")} | ${licenses.join(", ")} |`;
});
const table = ["| Package | Version | License |", "|---|---|---|", ...rows].join("\n");

if (!process.argv.includes("--write")) console.log(table);
else {
  const re = /\| Package \| Version \| License \|\n\|---\|---\|---\|\n(?:\|[^\n]*\n)+/;
  const doc = read("THIRDPARTY.md");
  if (!re.test(doc)) throw new Error("THIRDPARTY.md: the dependency table is gone");
  writeFileSync(join(ROOT, "THIRDPARTY.md"), doc.replace(re, `${table}\n`));
}
