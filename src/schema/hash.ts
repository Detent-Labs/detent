/**
 * definitionHash: the canonical-JSON (JCS) hash of a ProcessBody.
 *
 * Instances pin this and rehydrate against exactly the body that hashes to it;
 * the publish pass will use the same function to freeze a version. Kept beside
 * definition.ts because the hash is part of the contract, not the engine.
 */

import { createHash } from "node:crypto";
import { canonicalize } from "./canonical-json.js";
import type { ProcessBody, ProcessContract } from "./definition.js";

/** sha256 (hex) of the canonical JSON of a ProcessBody. */
export function definitionHash(body: ProcessBody): string {
  return createHash("sha256").update(canonicalize(body)).digest("hex");
}

/**
 * sha256 (hex) of the canonical JSON of a ProcessContract — the child contract
 * signature a subprocess step pins via `contractRef`. latest-at-spawn resolves
 * the newest child version whose contract hashes to this value, so a contract
 * change starts a new signature and existing callers keep the matching child.
 */
export function contractHash(contract: ProcessContract): string {
  return createHash("sha256").update(canonicalize(contract)).digest("hex");
}
