/**
 * Liveness/readiness handlers. Framework-agnostic like `routes.ts`'s
 * handlers, but deliberately outside its `guarded`/`mapError` pipeline: a
 * database-ping failure needs a stable, deliberate 503, not `mapError`'s
 * generic-failure 500 (design.md "Why not mapError").
 */
import type { SQL } from "bun";
import { sql } from "../engine/store.js";
import type { HttpResult } from "./errors.js";

/** Runs `SELECT 1` against `db`, resolving `false` instead of throwing on any failure. */
export async function checkDbReady(db: SQL): Promise<boolean> {
  try {
    await db`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function handleLivez(): Promise<HttpResult> {
  return { status: 200, body: { status: "ok" } };
}

export async function handleReadyz(db: SQL = sql): Promise<HttpResult> {
  const ready = await checkDbReady(db);
  return ready ? { status: 200, body: { status: "ok" } } : { status: 503, body: { status: "unavailable" } };
}
