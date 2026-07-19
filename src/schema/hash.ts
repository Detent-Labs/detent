/**
 * definitionHash: the canonical-JSON (JCS) hash of a ProcessBody.
 *
 * Instances pin this and rehydrate against exactly the body that hashes to it;
 * the publish pass will use the same function to freeze a version. Kept beside
 * definition.ts because the hash is part of the contract, not the engine.
 */

import { createHash } from "node:crypto";
import type { ProcessBody } from "./definition.js";

/**
 * Canonical JSON per RFC 8785 (JCS): object keys sorted lexicographically,
 * arrays in order, no insignificant whitespace. A ProcessBody carries only
 * strings, integers, booleans, null, arrays and objects — for which JSON's own
 * number/string forms already match JCS.
 * ponytail: full RFC-8785 number canonicalization (exponent/precision) only
 * matters if a non-integer number ever enters a ProcessBody; add it then.
 */
function canonicalize(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

/** sha256 (hex) of the canonical JSON of a ProcessBody. */
export function definitionHash(body: ProcessBody): string {
  return createHash("sha256").update(canonicalize(body)).digest("hex");
}
