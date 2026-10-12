/**
 * `startTenancy`'s issuer check, and the issuer-to-tenant routing that follows
 * it. The control plane is a stand-in handle and the lookup is injected, so the
 * startup cases need no database. Only the on-premise case starts a real server.
 */
import { test, expect, afterEach } from "bun:test";
import type { SQL } from "bun";
import { SignJWT } from "jose";
import { sql } from "../src/engine/store.js";
import { startTenancy, startHttpServer, resolveAuthResolver } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { UnknownTenant } from "../src/tenancy/connections.js";
import type { IssuerConfig } from "../src/auth/jwt.js";
import type { TenantRecord } from "../src/tenancy/store.js";

const DB = !!process.env.DATABASE_URL;

/** Answers every statement with no rows, which is all `initControlPlane` needs. */
const control = (() => Promise.resolve([])) as unknown as SQL;

const record = (key: string): TenantRecord => ({ id: `tenant_${key}`, key, name: key, databaseUrl: `postgres://host/${key}` });

const issuer = (iss: string, tenant?: string): IssuerConfig => ({
  iss, jwksUrl: `${iss}jwks`, audience: "detent", rolesClaim: "roles", ...(tenant !== undefined ? { tenant } : {}),
});

/** `acme` and `globex` are listed. The connect seam returns a handle that remembers its url. */
function deps(listed: string[] = ["acme", "globex"]) {
  const records = listed.map(record);
  return {
    lookup: async (key: string) => records.find((r) => r.key === key),
    listAll: async () => records,
    connect: (url: string) => {
      const fn = () => Promise.resolve([]);
      (fn as unknown as { url: string }).url = url;
      return fn as unknown as SQL;
    },
  };
}

async function startError(issuers: IssuerConfig[]): Promise<string> {
  try {
    await startTenancy(issuers, control, deps());
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("startTenancy did not raise");
}

async function requestFrom(iss: string, claims: Record<string, unknown> = {}): Promise<Request> {
  const jwt = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuer(iss).setSubject("u").sign(new TextEncoder().encode("k".repeat(32)));
  return new Request("http://app.example/instances", { headers: { Authorization: `Bearer ${jwt}` } });
}

test("an issuer with no tenant fails startup and the message names its iss", async () => {
  const message = await startError([issuer("https://login.acme.example/", "acme"), issuer("https://orphan.example/")]);
  expect(message).toContain("https://orphan.example/");
  expect(message).toContain("AUTH_ISSUERS");
});

test("an issuer naming an unlisted tenant fails startup and the message names the issuer and the tenant", async () => {
  const message = await startError([issuer("https://login.initech.example/", "initech")]);
  expect(message).toContain("https://login.initech.example/");
  expect(message).toContain("initech");
});

test("listed tenants start, and several issuers may serve one tenant", async () => {
  const tenancy = await startTenancy(
    [issuer("https://login.acme.example/", "acme"), issuer("https://sso.acme.example/", "acme"), issuer("https://login.globex.example/", "globex")],
    control,
    deps(),
  );
  const urlOf = async (req: Request) => (await tenancy.resolveTenantDb(req) as unknown as { url: string }).url;
  expect(await urlOf(await requestFrom("https://login.acme.example/"))).toBe("postgres://host/acme");
  expect(await urlOf(await requestFrom("https://sso.acme.example/"))).toBe("postgres://host/acme");
  expect(await urlOf(await requestFrom("https://login.globex.example/"))).toBe("postgres://host/globex");
});

test("an external token claiming another tenant still reaches its issuer's tenant", async () => {
  const tenancy = await startTenancy([issuer("https://login.acme.example/", "acme")], control, deps());
  const req = await requestFrom("https://login.acme.example/", { tenant: "globex" });
  expect(tenancy.tenantOf(req)).toBe("acme");
  expect(((await tenancy.resolveTenantDb(req)) as unknown as { url: string }).url).toBe("postgres://host/acme");
});

test("a token from an unlisted issuer reaches no tenant", async () => {
  const tenancy = await startTenancy([issuer("https://login.acme.example/", "acme")], control, deps());
  const req = await requestFrom("https://stranger.example/", { tenant: "acme" });
  expect(tenancy.tenantOf(req)).toBeUndefined();
  await expect(tenancy.resolveTenantDb(req)).rejects.toBeInstanceOf(UnknownTenant);
});

let stopServer: (() => Promise<void>) | undefined;
afterEach(async () => {
  await stopServer?.();
  stopServer = undefined;
});

test.skipIf(!DB)("an on-premise start ignores the tenant field", async () => {
  const prev = { PORT: process.env.PORT, TENANT_CONTROL_PLANE_URL: process.env.TENANT_CONTROL_PLANE_URL, AUTH_ISSUERS: process.env.AUTH_ISSUERS };
  const issuers = JSON.stringify([{ ...issuer("https://login.acme.example/", "no-such-tenant") }]);
  process.env.PORT = "0";
  delete process.env.TENANT_CONTROL_PLANE_URL;
  process.env.AUTH_ISSUERS = issuers;
  try {
    const resolver = resolveAuthResolver({ AUTH_ISSUERS: issuers });
    const server = await startHttpServer(createRegistry(), createDataSourceRegistry(), sql, resolver);
    stopServer = server.stop;
    // No token: the JWT resolver refuses, and the answer proves the server runs against DATABASE_URL.
    const res = await fetch(`http://127.0.0.1:${server.port}/processes`);
    expect(res.status).toBe(401);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
