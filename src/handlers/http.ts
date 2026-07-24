/**
 * Generic, vendor-neutral `http.request` action handler: calls an authored URL
 * and returns a structured result for `Action.output` to write back. `config`
 * is static, publish-validated JSON — no instance `data`, no DB lookup. The
 * first fully stateless handler in the registry.
 */

import { z } from "zod";
import { PermanentError } from "../engine/outbox.js";
import { durationMs } from "../engine/duration.js";
import type { HandlerContext, HandlerDef } from "../engine/registry.js";

export const HTTP_ACTION_TYPE = "http.request";

/**
 * Reserved: the engine, not the author, sets this header's value
 * (`ctx.idempotencyKey`) on every request, so a cooperating target can dedupe
 * a retried delivery. Authoring it in `config.headers` is a publish error —
 * see the second `.refine` below — rather than an unresolvable precedence
 * conflict between the author's value and the engine's.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export const httpConfigSchema = z
  .object({
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
  })
  .refine((c) => !(c.method === "GET" && c.body !== undefined), {
    message: "a GET request cannot carry a body",
    path: ["body"],
  })
  .refine(
    (c) => !Object.keys(c.headers ?? {}).some((k) => k.toLowerCase() === IDEMPOTENCY_HEADER.toLowerCase()),
    {
      message: `"${IDEMPOTENCY_HEADER}" is set by the engine and must not be authored in config.headers`,
      path: ["headers"],
    },
  );

export type HttpActionResult = { status: number; headers: Record<string, string>; body: unknown };

const CONTENT_TYPE_HEADER = "Content-Type";

/** Merge engine-computed headers on top of the author's, per the design's precedence rules. */
function buildHeaders(config: z.infer<typeof httpConfigSchema>, idempotencyKey: string): Record<string, string> {
  const headers: Record<string, string> = { ...(config.headers ?? {}) };
  headers[IDEMPOTENCY_HEADER] = idempotencyKey;
  if (config.body !== undefined && !Object.keys(headers).some((k) => k.toLowerCase() === CONTENT_TYPE_HEADER.toLowerCase())) {
    headers[CONTENT_TYPE_HEADER] = "application/json";
  }
  return headers;
}

async function httpHandler(ctx: HandlerContext): Promise<HttpActionResult> {
  const config = httpConfigSchema.parse(ctx.config);
  const headers = buildHeaders(config, ctx.idempotencyKey);

  const controller = ctx.action.timeout ? new AbortController() : undefined;
  const timeoutHandle = ctx.action.timeout
    ? setTimeout(() => controller!.abort(), durationMs(ctx.action.timeout))
    : undefined;

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: config.method,
      headers,
      body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
      signal: controller?.signal,
    });
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }

  if (response.status === 429 || response.status >= 500) {
    throw new Error(`http.request transient failure: ${response.status} ${response.statusText}`);
  }
  // Only a genuine 2xx counts as success — anything else (1xx, 3xx, or the
  // remaining 4xx) is permanent. fetch() follows redirects by default and
  // never surfaces 1xx as a final status, so this branch is unreachable
  // today; it's here so the check reads the same as the spec ("any 2xx"),
  // not because either case is currently reachable.
  if (response.status < 200 || response.status >= 300) {
    throw new PermanentError(`http.request permanent failure: ${response.status} ${response.statusText}`);
  }

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  return { status: response.status, headers: responseHeaders, body };
}

export const httpHandlerDef: HandlerDef = {
  handler: httpHandler,
  configSchema: httpConfigSchema,
};
