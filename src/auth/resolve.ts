/**
 * Actor resolution: a pluggable extension point turning a raw credential into
 * a trusted `Actor`, for an untrusted boundary (the HTTP wrapper) to call
 * before invoking the Runtime API. The Runtime API's own `actor: Actor`
 * parameter is unchanged — it still means "already-trusted actor"; nothing
 * here alters that contract, it only supplies where one boundary gets its
 * value from.
 *
 * No concrete identity provider (password/JWT/OIDC) ships in core — a headless
 * engine is not itself an identity provider. Only the extension point and one
 * non-production dev resolver (below) live here.
 */
import type { Actor } from "../cel/eval.js";

export type ActorResolver = (credential: unknown) => Promise<Actor>;

/** A credential could not be resolved into a trusted Actor. */
export class ActorResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActorResolutionError";
  }
}

/** The shape the dev header-based resolver expects, extracted by the caller from request headers. */
export type DevHeaderCredential = {
  actorIdHeader: string | null | undefined;
  actorRolesHeader: string | null | undefined;
};

/**
 * Non-production resolver for local/dev/example use: trusts a pair of headers
 * (`X-Actor-Id` / `X-Actor-Roles`) and constructs an `Actor` directly. Makes
 * today's implicit "trust the caller" behavior explicit and swappable rather
 * than hardcoded — anything real (JWT/OIDC/session-based) is a deployment's
 * own resolver against this same `ActorResolver` extension point. Trusting
 * unsigned headers is NOT authentication; do not wire this into a deployment
 * a real user's data ever reaches.
 */
export const devHeaderResolver: ActorResolver = async (credential) => {
  const { actorIdHeader, actorRolesHeader } = credential as DevHeaderCredential;
  if (!actorIdHeader) throw new ActorResolutionError("missing X-Actor-Id header");
  const roles = actorRolesHeader ? actorRolesHeader.split(",").map((r) => r.trim()).filter(Boolean) : [];
  return { id: actorIdHeader, roles };
};
