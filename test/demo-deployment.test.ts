/**
 * `openspec/changes/deploy-demo-on-podman`, D6: lint rules over the demo's
 * deployment definition in `deploy/demo/`. Each rule is a function from file
 * text to messages; each has a mutated copy of the text that breaks it.
 *
 * No database, so no `skipIf`.
 */
import { test, expect } from "bun:test";

const read = (p: string) => Bun.file(new URL(`../deploy/demo/${p}`, import.meta.url)).text();

const ENV = await read("engine.env.example");
const UNITS = {
  "detent-db.container": await read("detent-db.container"),
  "detent-engine.container": await read("detent-engine.container"),
  "detent-caddy.container": await read("detent-caddy.container"),
  "detent-demo.pod": await read("detent-demo.pod"),
};
const DB = UNITS["detent-db.container"];
const POD = UNITS["detent-demo.pod"];
const CADDY = await read("Caddyfile");
const RESET = await read("reset.sh");
const TIMER = await read("systemd/detent-demo-reset.timer");

const EXPECTED_ENV = {
  DATABASE_URL: "postgres://postgres:<generated>@localhost:5432/workflow_engine",
  AUTH_JWT_SECRET: "<generated>",
  TRUST_PROXY: "1",
  MAX_ATTACHMENT_BYTES: "1048576",
  LOG_LEVEL: "info",
};
const FORBIDDEN_ENV = ["HTTP_ACTION_ALLOWED_HOSTS", "SMTP_", "CORS_ALLOWED_ORIGINS", "ALLOW_INSECURE_DEV_AUTH"];

function checkEnv(text: string): string[] {
  const problems: string[] = [];
  const lines = text.split("\n").filter((l) => l !== "" && !l.startsWith("#"));
  const got: Record<string, string> = {};
  for (const l of lines) {
    const i = l.indexOf("=");
    const k = l.slice(0, i);
    if (!FORBIDDEN_ENV.some((f) => k.startsWith(f))) got[k] = l.slice(i + 1);
  }
  if (JSON.stringify(got) !== JSON.stringify(EXPECTED_ENV)) {
    problems.push("the template does not hold exactly the D3 variables and values");
  }
  for (const k of FORBIDDEN_ENV) {
    if (text.split("\n").some((l) => !l.startsWith("#") && l.startsWith(k))) {
      problems.push(`the template sets ${k}`);
    }
  }
  return problems;
}

function checkNoLatest(units: Record<string, string>): string[] {
  return Object.entries(units)
    .filter(([, t]) => /^Image=.*(:latest$|\/[^/:]+$)/m.test(t))
    .map(([n]) => `${n} names a latest or untagged image`);
}

function section(text: string, name: string): string {
  const m = new RegExp(`^\\[${name}\\]\\n([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, "m").exec(text);
  return m?.[1] ?? "";
}

function checkContainerUnit(name: string, text: string): string[] {
  const problems: string[] = [];
  const want = name.replace(/\.container$/, "");
  if (!new RegExp(`^ContainerName=${want}$`, "m").test(section(text, "Container"))) {
    problems.push(`${name} sets no ContainerName=${want}`);
  }
  const service = section(text, "Service");
  if (!/^Restart=on-failure$/m.test(service)) problems.push(`${name} sets no Restart=on-failure in [Service]`);
  if (!/^RestartSec=5$/m.test(service)) problems.push(`${name} sets no RestartSec=5 in [Service]`);
  return problems;
}

const checkPod = (t: string) => (/^WantedBy=default\.target$/m.test(t) ? [] : ["the pod has no WantedBy=default.target"]);
const checkDbMount = (t: string) => (/^Volume=\S+:\/var\/lib\/postgresql$/m.test(t) ? [] : ["the database does not mount /var/lib/postgresql"]);
const checkCaddy = (t: string) => [
  ...(/^detent\.org\b.*\{/m.test(t) ? [] : ["the Caddyfile does not name detent.org"]),
  ...(/reverse_proxy localhost:3000\b/.test(t) ? [] : ["the Caddyfile does not proxy to localhost:3000"]),
];
const checkReset = (t: string) => [
  ...(/-e SEED_ALLOW=1 detent-engine/.test(t) ? [] : ["reset.sh does not set SEED_ALLOW=1"]),
  ...(/pg_isready -h localhost\b.*\n[\s\S]*dropdb/.test(t) ? [] : ["reset.sh does not wait for pg_isready over TCP before dropdb"]),
  ...(/^set -eu$/m.test(t) ? [] : ["reset.sh does not start with set -eu"]),
];
const checkTimer = (t: string) => (/^OnCalendar=\*-\*-\* /m.test(t) ? [] : ["the timer does not run daily"]);

test("the shipped template, units, Caddyfile, reset script and timer satisfy every rule", () => {
  expect(checkEnv(ENV)).toEqual([]);
  expect(checkNoLatest(UNITS)).toEqual([]);
  for (const [n, t] of Object.entries(UNITS)) {
    if (n.endsWith(".container")) expect(checkContainerUnit(n, t)).toEqual([]);
  }
  expect(checkPod(POD)).toEqual([]);
  expect(checkDbMount(DB)).toEqual([]);
  expect(checkCaddy(CADDY)).toEqual([]);
  expect(checkReset(RESET)).toEqual([]);
  expect(checkTimer(TIMER)).toEqual([]);
});

test("a template holding a real secret value is rejected", () => {
  const broken = ENV.replace("AUTH_JWT_SECRET=<generated>", "AUTH_JWT_SECRET=abc123");
  expect(checkEnv(broken)).toContain("the template does not hold exactly the D3 variables and values");
});

test("a template that sets a forbidden variable is rejected", () => {
  for (const k of FORBIDDEN_ENV) {
    expect(checkEnv(`${ENV}${k}=x\n`)).toContain(`the template sets ${k}`);
  }
});

test("a template with a changed upload bound is rejected", () => {
  expect(checkEnv(ENV.replace("1048576", "5242880"))).not.toEqual([]);
});

test("a latest or untagged image is rejected", () => {
  const latest = { ...UNITS, "detent-db.container": DB.replace("postgres:18", "postgres:latest") };
  expect(checkNoLatest(latest)).toEqual(["detent-db.container names a latest or untagged image"]);
  const untagged = { ...UNITS, "detent-db.container": DB.replace("postgres:18", "postgres") };
  expect(checkNoLatest(untagged)).toEqual(["detent-db.container names a latest or untagged image"]);
});

test("a container unit without ContainerName, Restart or RestartSec is rejected", () => {
  expect(checkContainerUnit("detent-db.container", DB.replace(/^ContainerName=.*\n/m, ""))).toEqual([
    "detent-db.container sets no ContainerName=detent-db",
  ]);
  expect(checkContainerUnit("detent-db.container", DB.replace("detent-db\n", "other\n"))).toEqual([
    "detent-db.container sets no ContainerName=detent-db",
  ]);
  expect(checkContainerUnit("detent-db.container", DB.replace(/^Restart=.*\n/m, ""))).toEqual([
    "detent-db.container sets no Restart=on-failure in [Service]",
  ]);
  expect(checkContainerUnit("detent-db.container", DB.replace("RestartSec=5", "RestartSec=1"))).toEqual([
    "detent-db.container sets no RestartSec=5 in [Service]",
  ]);
});

test("a pod without WantedBy=default.target is rejected", () => {
  expect(checkPod(POD.replace("default.target", "multi-user.target"))).not.toEqual([]);
});

test("a database mounted elsewhere is rejected", () => {
  expect(checkDbMount(DB.replace(":/var/lib/postgresql", ":/var/lib/postgresql/data"))).not.toEqual([]);
});

test("a Caddyfile for another host or port is rejected", () => {
  expect(checkCaddy(CADDY.replace("detent.org", "example.org"))).toEqual(["the Caddyfile does not name detent.org"]);
  expect(checkCaddy(CADDY.replace("3000", "8080"))).toEqual(["the Caddyfile does not proxy to localhost:3000"]);
});

test("a reset script that does not seed with SEED_ALLOW=1 is rejected", () => {
  expect(checkReset(RESET.replace("SEED_ALLOW=1", "SEED=1"))).toEqual(["reset.sh does not set SEED_ALLOW=1"]);
});

test("a reset script without the TCP pg_isready wait before dropdb is rejected", () => {
  const msg = ["reset.sh does not wait for pg_isready over TCP before dropdb"];
  expect(checkReset(RESET.replace("pg_isready -h localhost", "pg_isready"))).toEqual(msg);
  expect(checkReset(RESET.replace(/pg_isready/g, "true"))).toEqual(msg);
});

test("the setup, reset and deploy scripts start with set -eu", async () => {
  const setup = await read("setup.sh");
  const deploy = await Bun.file(new URL("../scripts/deploy-demo.sh", import.meta.url)).text();
  for (const t of [setup, RESET, deploy]) expect(/^set -eu$/m.test(t)).toBe(true);
  expect(checkReset(RESET.replace("set -eu", "set -e"))).toEqual(["reset.sh does not start with set -eu"]);
});

test("a timer that does not run daily is rejected", () => {
  expect(checkTimer(TIMER.replace("*-*-* 03:00:00", "Mon *-*-* 03:00:00"))).not.toEqual([]);
});
