/**
 * `src/auth/jwt.ts::jwtResolver` — pure crypto/HTTP, no DB. The JWKS branch
 * is exercised end-to-end against a real ephemeral HTTP server serving a
 * generated keypair's public JWK, matching how `jose`'s `createRemoteJWKSet`
 * actually fetches (no fetch mocking, since that would only prove the mock
 * shape, not the real fetch/JWKS-parse path).
 */
import { test, expect, describe } from "bun:test";
import { SignJWT, generateKeyPair, exportJWK } from "jose";
import { jwtResolver, LOCAL_ISSUER, type IssuerConfig } from "../src/auth/jwt.js";
import { ActorResolutionError } from "../src/auth/resolve.js";

const SECRET = "test-signing-secret-at-least-32-bytes-long";

function headers(authorization?: string): Headers {
  const h = new Headers();
  if (authorization !== undefined) h.set("Authorization", authorization);
  return h;
}

async function localToken(opts: { secret?: string; roles?: string[]; expired?: boolean; rolesClaim?: string } = {}): Promise<string> {
  const key = new TextEncoder().encode(opts.secret ?? SECRET);
  const claim = opts.rolesClaim ?? "roles";
  return new SignJWT({ [claim]: opts.roles ?? [] })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(LOCAL_ISSUER)
    .setSubject("user_1")
    .setIssuedAt()
    .setExpirationTime(opts.expired ? Math.floor(Date.now() / 1000) - 60 : "8h")
    .sign(key);
}

/**
 * Stands in for `isActiveUser`, so these stay the pure, DB-free tests the rest
 * of this file is. `test/auth-login.test.ts` proves the real lookup end to end,
 * through the resolver the server builds itself. `seen` records which subjects
 * the resolver actually asked about, which is how a test asserts that a branch
 * consulted no directory.
 */
function calls(answer: boolean): { seen: string[]; isActiveAccount: (userId: string) => Promise<boolean> } {
  const seen: string[] = [];
  return {
    seen,
    isActiveAccount: async (userId) => {
      seen.push(userId);
      return answer;
    },
  };
}

describe("local (bps) issuer", () => {
  test("a valid locally-signed token resolves to the expected Actor", async () => {
    const resolver = jwtResolver({ localSecret: SECRET });
    const token = await localToken({ roles: ["employee", "finance-approver"] });
    const actor = await resolver(headers(`Bearer ${token}`));
    expect(actor).toEqual({ id: "user_1", roles: ["employee", "finance-approver"] });
  });

  test("a missing Authorization header is rejected", async () => {
    const resolver = jwtResolver({ localSecret: SECRET });
    await expectRejects(() => resolver(headers()));
  });

  test("a malformed bearer value is rejected", async () => {
    const resolver = jwtResolver({ localSecret: SECRET });
    await expectRejects(() => resolver(headers("NotBearer abc")));
    await expectRejects(() => resolver(headers("Bearer not-a-jwt")));
  });

  test("an expired token is rejected", async () => {
    const resolver = jwtResolver({ localSecret: SECRET });
    const token = await localToken({ expired: true });
    await expectRejects(() => resolver(headers(`Bearer ${token}`)));
  });

  test("a wrongly-signed token is rejected", async () => {
    const resolver = jwtResolver({ localSecret: SECRET });
    const token = await localToken({ secret: "a-completely-different-secret-value" });
    await expectRejects(() => resolver(headers(`Bearer ${token}`)));
  });

  test("an unknown issuer is rejected", async () => {
    const resolver = jwtResolver({ localSecret: SECRET });
    const token = await new SignJWT({ roles: [] })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("some-other-issuer")
      .setSubject("user_1")
      .setExpirationTime("8h")
      .sign(new TextEncoder().encode(SECRET));
    await expectRejects(() => resolver(headers(`Bearer ${token}`)));
  });

  test("iss: bps is rejected when no local secret is configured", async () => {
    const resolver = jwtResolver({});
    const token = await localToken();
    await expectRejects(() => resolver(headers(`Bearer ${token}`)));
  });

  test("the configured roles claim populates Actor.roles", async () => {
    const resolver = jwtResolver({ localSecret: SECRET, localRolesClaim: "groups" });
    const token = await localToken({ rolesClaim: "groups", roles: ["employee"] });
    const actor = await resolver(headers(`Bearer ${token}`));
    expect(actor.roles).toEqual(["employee"]);
  });

  test("a token with no roles claim resolves to empty roles", async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(LOCAL_ISSUER)
      .setSubject("user_1")
      .setExpirationTime("8h")
      .sign(key);
    const resolver = jwtResolver({ localSecret: SECRET });
    const actor = await resolver(headers(`Bearer ${token}`));
    expect(actor.roles).toEqual([]);
  });
});

describe("JWKS-backed external issuer", () => {
  async function withJwksServer(fn: (issuer: IssuerConfig, privateKey: CryptoKey) => Promise<void>): Promise<void> {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    const server = Bun.serve({
      port: 0,
      fetch: () => Response.json({ keys: [{ ...jwk, alg: "RS256", use: "sig" }] }),
    });
    try {
      const issuer: IssuerConfig = {
        iss: "https://login.microsoftonline.com/tenant/v2.0",
        jwksUrl: `http://localhost:${server.port}/jwks`,
        audience: "api://bps",
        rolesClaim: "roles",
      };
      await fn(issuer, privateKey);
    } finally {
      server.stop(true);
    }
  }

  test("a JWKS-issued token resolves through the JWKS branch", async () => {
    await withJwksServer(async (issuer, privateKey) => {
      const token = await new SignJWT({ roles: ["employee"] })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(issuer.iss)
        .setSubject("oid-abc-123")
        .setAudience(issuer.audience)
        .setExpirationTime("8h")
        .sign(privateKey);

      const resolver = jwtResolver({ issuers: [issuer] });
      const actor = await resolver(headers(`Bearer ${token}`));
      expect(actor).toEqual({ id: "oid-abc-123", roles: ["employee"] });
    });
  });

  test("a token with the wrong audience is rejected", async () => {
    await withJwksServer(async (issuer, privateKey) => {
      const token = await new SignJWT({ roles: [] })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(issuer.iss)
        .setSubject("oid-abc-123")
        .setAudience("api://someone-else")
        .setExpirationTime("8h")
        .sign(privateKey);

      const resolver = jwtResolver({ issuers: [issuer] });
      await expectRejects(() => resolver(headers(`Bearer ${token}`)));
    });
  });

  test("local and external issuers are accepted in the same configuration", async () => {
    await withJwksServer(async (issuer, privateKey) => {
      const resolver = jwtResolver({ localSecret: SECRET, issuers: [issuer] });

      const localTok = await localToken({ roles: ["employee"] });
      expect(await resolver(headers(`Bearer ${localTok}`))).toEqual({ id: "user_1", roles: ["employee"] });

      const externalTok = await new SignJWT({ roles: ["finance-approver"] })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(issuer.iss)
        .setSubject("oid-xyz")
        .setAudience(issuer.audience)
        .setExpirationTime("8h")
        .sign(privateKey);
      expect(await resolver(headers(`Bearer ${externalTok}`))).toEqual({ id: "oid-xyz", roles: ["finance-approver"] });
    });
  });

  test("an externally issued token reads no directory entry", async () => {
    await withJwksServer(async (issuer, privateKey) => {
      const { seen, isActiveAccount } = calls(false);
      const token = await new SignJWT({ roles: ["employee"] })
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(issuer.iss)
        .setSubject("oid-abc-123")
        .setAudience(issuer.audience)
        .setExpirationTime("8h")
        .sign(privateKey);

      // The callback answers "not live" for everything. An external subject
      // must resolve anyway: that issuer owns revocation, and this engine holds
      // no row for it.
      const resolver = jwtResolver({ issuers: [issuer], isActiveAccount });
      expect(await resolver(headers(`Bearer ${token}`))).toEqual({ id: "oid-abc-123", roles: ["employee"] });
      expect(seen).toEqual([]);
    });
  });
});

describe("the account directory behind a locally issued token", () => {
  test("a live account resolves to the Actor it always did", async () => {
    const { seen, isActiveAccount } = calls(true);
    const resolver = jwtResolver({ localSecret: SECRET, isActiveAccount });
    const actor = await resolver(headers(`Bearer ${await localToken({ roles: ["employee"] })}`));
    expect(actor).toEqual({ id: "user_1", roles: ["employee"] });
    expect(seen).toEqual(["user_1"]); // asked about the token's `sub`, once
  });

  test("a disabled or deleted account is rejected", async () => {
    const { seen, isActiveAccount } = calls(false);
    const resolver = jwtResolver({ localSecret: SECRET, isActiveAccount });
    const token = await localToken();
    await expectRejects(() => resolver(headers(`Bearer ${token}`)));
    expect(seen).toEqual(["user_1"]);
  });

  test("the roles claim still comes from the token, not from the directory", async () => {
    // The read answers whether the account is live and nothing else. Reading
    // `roles` from that same row would make a grant reach a live session,
    // which `admin-user-management` requires it must not.
    const resolver = jwtResolver({ localSecret: SECRET, isActiveAccount: async () => true });
    const actor = await resolver(headers(`Bearer ${await localToken({ roles: ["stale-role"] })}`));
    expect(actor.roles).toEqual(["stale-role"]);
  });

  test("a resolver configured without the callback reads no directory", async () => {
    // The shape a unit test uses, and the shape any caller holding no database
    // uses. It must keep resolving exactly as it did before this change.
    const resolver = jwtResolver({ localSecret: SECRET });
    expect(await resolver(headers(`Bearer ${await localToken({ roles: ["employee"] })}`))).toEqual({ id: "user_1", roles: ["employee"] });
  });

  test("an unverifiable token is rejected before the directory is consulted", async () => {
    // A wrong signature must not become a directory probe: `jwtVerify` runs
    // first, so the callback never sees that subject.
    const { seen, isActiveAccount } = calls(true);
    const resolver = jwtResolver({ localSecret: SECRET, isActiveAccount });
    const token = await localToken({ secret: "a-different-secret-at-least-32-bytes!!" });
    await expectRejects(() => resolver(headers(`Bearer ${token}`)));
    expect(seen).toEqual([]);
  });
});

async function expectRejects(fn: () => Promise<unknown>): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(ActorResolutionError);
}
