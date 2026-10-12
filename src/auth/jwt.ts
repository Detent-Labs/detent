/**
 * Production-capable `ActorResolver`: reads `Authorization: Bearer <jwt>`,
 * dispatches on the token's `iss` claim to a verifier, and maps claims to
 * `Actor`. `iss: "bps"` verifies against the local signing key
 * (`AUTH_JWT_SECRET`, HS256); any other configured issuer verifies against
 * that issuer's JWKS via `jose`'s remote JWKS (fetched once per URL, then
 * cached and re-fetched by `jose` itself on a key-not-found miss). Both
 * branches produce the same `Actor { id, roles }`, so local and IdP-issued
 * identities are indistinguishable downstream and accepted simultaneously.
 *
 * The local branch also asks the account directory whether that subject is
 * still live, when configured with an `isActiveAccount` callback. That is what
 * makes an operator's disable end an open session on the next request.
 */
import type { SQL } from "bun";
import { decodeJwt, jwtVerify, createRemoteJWKSet } from "jose";
import { ActorResolutionError, type ActorResolver } from "./resolve.js";

export const LOCAL_ISSUER = "bps";

/**
 * The tenant a request belongs to, or `undefined` for a single-tenant
 * deployment. Read BEFORE verification, because it decides which database the
 * request runs against, and the verification that follows is what proves it: a
 * `tenant` claim sits inside the signed payload, so an edited one fails the
 * signature and the request is refused before it reads anything.
 *
 * A locally-issued token carries the claim, since `LOCAL_ISSUER` is one
 * constant every deployment shares and so cannot name a tenant. An externally
 * issued token resolves through `tenantsByIssuer`: the tenant is the one its
 * issuer's `AUTH_ISSUERS` entry names. An issuer the map lacks, or no map,
 * answers `undefined`. A `tenant` claim inside an external token is never read,
 * so that token cannot move itself to another tenant.
 */
export function tenantKeyOf(credential: unknown, byIssuer?: ReadonlyMap<string, string>): string | undefined {
  const authorization = (credential as Headers).get?.("Authorization");
  if (!authorization || !authorization.startsWith(BEARER_PREFIX)) return undefined;
  const token = authorization.slice(BEARER_PREFIX.length).trim();
  if (!token) return undefined;
  try {
    const payload = decodeJwt(token) as { iss?: unknown; tenant?: unknown };
    if (payload.iss === LOCAL_ISSUER) return typeof payload.tenant === "string" ? payload.tenant : undefined;
    return typeof payload.iss === "string" ? byIssuer?.get(payload.iss) : undefined;
  } catch {
    return undefined;
  }
}

/** `iss` to tenant for every issuer entry that names one. */
export function tenantsByIssuer(issuers: readonly IssuerConfig[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const i of issuers) if (i.tenant !== undefined) map.set(i.iss, i.tenant);
  return map;
}
const BEARER_PREFIX = "Bearer ";

/** The local branch signs and verifies with one shared secret: HS256 only. */
const LOCAL_ALGORITHMS = ["HS256"];

/** An external issuer signs with a private key; no HMAC algorithm is accepted. */
const EXTERNAL_ALGORITHMS = [
  "RS256", "RS384", "RS512",
  "PS256", "PS384", "PS512",
  "ES256", "ES384", "ES512",
  "EdDSA", "Ed25519",
];

/** One `AUTH_ISSUERS` entry: an externally-issued token verified via JWKS. */
export interface IssuerConfig {
  iss: string;
  jwksUrl: string;
  audience: string;
  rolesClaim: string;
  /** The tenant this issuer's tokens belong to. Required in SaaS mode, ignored otherwise. */
  tenant?: string;
}

export interface JwtResolverConfig {
  /** `AUTH_JWT_SECRET`. Omitted: the `"bps"` issuer verifies nothing. */
  localSecret?: string;
  /** Roles claim on a locally-issued token. `login.ts` embeds `roles` directly. */
  localRolesClaim?: string;
  /** `AUTH_ISSUERS`, parsed. */
  issuers?: IssuerConfig[];
  /**
   * Answers whether the local account directory still holds `userId` as a live
   * account. Called on every LOCALLY issued token, after the signature
   * verifies, so an operator's disable ends that account's open session on its
   * next request rather than at its token's `exp`. A deleted account answers
   * the same as a disabled one.
   *
   * A callback rather than a database handle, so this file keeps holding no
   * SQL. `resolveAuthResolver` (`src/http/server.ts`) supplies the real one.
   * Omitted, this resolver reads no directory — the shape a unit test uses,
   * and the shape any caller holding no database uses.
   *
   * Never called for an externally issued token: that issuer owns revocation,
   * and this engine holds no row for its subjects.
   */
  isActiveAccount?: (userId: string, db: SQL) => Promise<boolean>;
}

function claimToRoles(payload: Record<string, unknown>, rolesClaim: string): string[] {
  const value = payload[rolesClaim];
  return Array.isArray(value) ? value.filter((r): r is string => typeof r === "string") : [];
}

function toActor(payload: Record<string, unknown>, rolesClaim: string): { id: string; roles: string[] } {
  if (typeof payload.sub !== "string" || !payload.sub) throw new ActorResolutionError("token carries no subject claim");
  return { id: payload.sub, roles: claimToRoles(payload, rolesClaim) };
}

export function jwtResolver(config: JwtResolverConfig): ActorResolver {
  const localKey = config.localSecret ? new TextEncoder().encode(config.localSecret) : undefined;
  const localRolesClaim = config.localRolesClaim ?? "roles";
  const jwksSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

  return async (credential, db) => {
    const headers = credential as Headers;
    const authorization = headers.get("Authorization");
    if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
      throw new ActorResolutionError("missing or malformed Authorization header");
    }
    const token = authorization.slice(BEARER_PREFIX.length).trim();
    if (!token) throw new ActorResolutionError("missing bearer token");

    let iss: string | undefined;
    try {
      ({ iss } = decodeJwt(token));
    } catch {
      throw new ActorResolutionError("malformed token");
    }

    try {
      if (iss === LOCAL_ISSUER) {
        if (!localKey) throw new ActorResolutionError(`unconfigured issuer: ${iss}`);
        const { payload } = await jwtVerify(token, localKey, { issuer: LOCAL_ISSUER, algorithms: LOCAL_ALGORITHMS });
        const actor = toActor(payload, localRolesClaim);
        // Only `Actor.id` comes from this read. `roles` stays the token's own
        // claim, so a grant still reaches the actor at their next login and not
        // before — see the admin-user-management spec, "A role change does not
        // reach an already-issued token".
        if (config.isActiveAccount && !(await config.isActiveAccount(actor.id, db))) {
          throw new ActorResolutionError("account is disabled or no longer exists");
        }
        return actor;
      }
      const issuerConfig = config.issuers?.find((i) => i.iss === iss);
      if (!issuerConfig) throw new ActorResolutionError(`unconfigured issuer: ${iss ?? "(none)"}`);
      let jwks = jwksSets.get(issuerConfig.jwksUrl);
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(issuerConfig.jwksUrl));
        jwksSets.set(issuerConfig.jwksUrl, jwks);
      }
      const { payload } = await jwtVerify(token, jwks, {
        issuer: issuerConfig.iss,
        audience: issuerConfig.audience,
        algorithms: EXTERNAL_ALGORITHMS,
        requiredClaims: ["exp"],
      });
      return toActor(payload, issuerConfig.rolesClaim);
    } catch (err) {
      if (err instanceof ActorResolutionError) throw err;
      throw new ActorResolutionError(err instanceof Error ? err.message : "token verification failed");
    }
  };
}
