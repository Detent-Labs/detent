/**
 * Deterministic idempotency key for an outbox row: UUIDv5 of
 * `instanceId | transitionSeq | actionId`. Same coordinates -> same key, so a
 * replayed transition conflicts on the outbox PK instead of duplicating, and a
 * consumer can dedupe redelivery on the key. UUIDv5 (sha1) via node:crypto — no
 * dependency.
 */

import { createHash } from "node:crypto";

// Frozen namespace UUID for outbox keys (a fixed random v4; changing it would
// re-key every future row, so it is a constant).
const NAMESPACE = "1b671a64-40d5-491e-99b0-da01ff1f3341";

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function uuidv5(name: string, namespace: string): string {
  const hash = createHash("sha1").update(uuidBytes(namespace)).update(name, "utf8").digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function idempotencyKey(instanceId: string, transitionSeq: number, actionId: string): string {
  return uuidv5(`${instanceId}|${transitionSeq}|${actionId}`, NAMESPACE);
}
