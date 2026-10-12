/**
 * Generic, vendor-neutral `http.request` action handler: calls an authored URL
 * and returns a structured result for `Action.output` to write back. `config`
 * is static, publish-validated JSON — no instance `data`, no DB lookup. A
 * header value may name an environment variable instead of holding a value;
 * the handler reads it at delivery. The first fully stateless handler in the
 * registry.
 */

import { z } from "zod";
import { PermanentError } from "../engine/outbox.js";
import { durationMs } from "../engine/duration.js";
import type { HandlerContext, HandlerDef } from "../engine/registry.js";

export const HTTP_ACTION_TYPE = "http.request";

/**
 * Applied when the action declares no `timeout` of its own. Set well under
 * CLAIM_LEASE_MS so this bound fires first in the ordinary case, producing a
 * specific AbortError rather than the outbox's own less-specific deadline
 * rejection (see outbox.ts::drainOutbox and design.md's "Bound delivery with
 * the claim lease"). The outbox's race is the backstop that applies
 * regardless of what a handler does; this is the handler actually releasing
 * its socket.
 */
export const HTTP_DEFAULT_TIMEOUT_MS = 5_000;

/**
 * The response is persisted into `instance.data` via Action.output, so an
 * unbounded read is an unbounded write into jsonb. Sized generously for an
 * ordinary structured API response, not for a document/file transfer — an
 * `http.request` action is not a file-download primitive.
 */
export const HTTP_MAX_RESPONSE_BYTES = 1_048_576; // 1 MiB

/**
 * Reserved: the engine, not the author, sets this header's value
 * (`ctx.idempotencyKey`) on every request, so a cooperating target can dedupe
 * a retried delivery. Authoring it in `config.headers` is a publish error —
 * see the second `.refine` below — rather than an unresolvable precedence
 * conflict between the author's value and the engine's.
 */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

/**
 * `^[A-Z][A-Z0-9_]*$`, written as a loop. A regex literal here would also match
 * an ISO duration such as `PT1S`, and `test/duration.test.ts` allows one owner
 * of a duration-matching pattern: the schema.
 */
function isEnvName(s: string): boolean {
  if (s === "") return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const upper = c >= 65 && c <= 90;
    const digitOrUnderscore = (c >= 48 && c <= 57) || c === 95;
    if (!upper && !(i > 0 && digitOrUnderscore)) return false;
  }
  return true;
}

/**
 * A header value is a literal string or a reference to a process environment
 * variable. The reference keeps the credential out of the definition, the
 * draft and the outbox row: only the name is stored. A strict object, so an
 * unknown key or a second reference shape fails at publish.
 *
 * ponytail: an environment variable stands in for a secret store, with no
 * per-process scope. Ceiling: a listed name serves every author of the tenant
 * and every allowed host. Upgrade entry point: add a further union member here,
 * such as `{ secret: id }`, resolved against a store.
 */
const headerValueSchema = z.union([
  z.string(),
  z.strictObject({
    env: z.string().refine(isEnvName, { message: "an environment variable name is upper-case letters, digits and underscores, led by a letter" }),
  }),
]);

export const httpConfigSchema = z
  .object({
    url: z.string().url(),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    headers: z.record(z.string(), headerValueSchema).optional(),
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

/**
 * The deployment decides what an action may reach, not the process author.
 * Answers the reason a target is refused, or `undefined` when it passes.
 *
 * Both variables are read per call, never at module load: a test sets them per
 * case, and an operator's restart stays the only ceremony a policy change
 * needs. An entry is a host — a hostname with an optional port, the shape
 * `URL.host` carries (lower-case, default port dropped). Entries are trimmed
 * and matched without case, since an operator writes this list by hand and a
 * space after a comma would otherwise deny a host visibly present in it. Unset
 * or empty denies every target, the way an unset CORS_ALLOWED_ORIGINS permits
 * no origin.
 *
 * Exported so the next outbound caller (an HTTP-backed data source is parked
 * in docs/decisions.md) imports this rule instead of writing a second copy of
 * it under the same variable name.
 */
export function egressRefusal(url: string): string | undefined {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return `http.request cannot parse its target URL: ${url}`;
  }
  if (target.protocol !== "https:" && process.env.HTTP_ACTION_ALLOW_INSECURE !== "1") {
    return `http.request refuses a non-https target: ${target.protocol} (set HTTP_ACTION_ALLOW_INSECURE=1 to permit it)`;
  }
  const allowed = (process.env.HTTP_ACTION_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.includes(target.host.toLowerCase())) {
    return `http.request target host is not in HTTP_ACTION_ALLOWED_HOSTS: ${target.host}`;
  }
  return undefined;
}

/**
 * The RFC 9110 field-value set: tab, printable ASCII, Latin-1 high half
 * (`[\t\x20-\x7e\x80-\xff]`). A strict subset of what `fetch` accepts. The
 * strict set keeps a resolved value out of a transport message, since `fetch`
 * never raises on a value this accepts. A loop, not a regex, for the reason
 * `isEnvName` states.
 */
function isLegalHeaderValue(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 9 && !(c >= 0x20 && c <= 0x7e) && !(c >= 0x80 && c <= 0xff)) return false;
  }
  return true;
}

/**
 * Answers the value of one environment reference, or throws the permanent
 * refusal. The operator decides which variables an author can name:
 * `HTTP_SECRET_ENV_ALLOWLIST` is a comma-separated list, read per call like
 * `HTTP_ACTION_ALLOWED_HOSTS`. Entries are trimmed and compared case-sensitively.
 * Unset or empty refuses every reference. The tenant decides which entries
 * count. With no tenant (a deployment with one tenant) only an entry without a
 * colon counts. With a tenant (a deployment with many) only `tenant:NAME`
 * counts, split at the first colon, and an entry without a colon is ignored.
 * Each side ignores the other's form, so a mixed-up list refuses.
 *
 * A message names the header and the variable and never a value. The outbox
 * stores message text in `last_error`, which the admin area shows. The value
 * check runs here, before `fetch`, because the transport could raise a message
 * that quotes the offending header.
 */
function resolveEnvReference(header: string, name: string, tenant: string | undefined): string {
  const allowed = (process.env.HTTP_SECRET_ENV_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .flatMap((entry) => {
      const colon = entry.indexOf(":");
      if (!tenant) return colon === -1 ? [entry] : [];
      return colon !== -1 && entry.slice(0, colon) === tenant ? [entry.slice(colon + 1)] : [];
    });
  if (!allowed.includes(name)) {
    throw new PermanentError(`http.request header "${header}" references ${name}, which is not in HTTP_SECRET_ENV_ALLOWLIST`);
  }
  const value = process.env[name];
  if (value === undefined) {
    throw new PermanentError(`http.request header "${header}" references ${name}, which is not set`);
  }
  if (value.trim() === "") {
    throw new PermanentError(`http.request header "${header}" references ${name}, which is empty`);
  }
  if (!isLegalHeaderValue(value)) {
    throw new PermanentError(`http.request header "${header}" references ${name}, whose value is not a legal header value`);
  }
  return value;
}

const CONTENT_TYPE_HEADER = "Content-Type";

/**
 * Resolve each environment reference, then merge engine-computed headers on
 * top of the author's, per the design's precedence rules.
 */
function buildHeaders(config: z.infer<typeof httpConfigSchema>, idempotencyKey: string, tenant: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(config.headers ?? {})) {
    headers[name] = typeof value === "string" ? value : resolveEnvReference(name, value.env, tenant);
  }
  headers[IDEMPOTENCY_HEADER] = idempotencyKey;
  if (config.body !== undefined && !Object.keys(headers).some((k) => k.toLowerCase() === CONTENT_TYPE_HEADER.toLowerCase())) {
    headers[CONTENT_TYPE_HEADER] = "application/json";
  }
  return headers;
}

/**
 * Read a response body against a byte budget rather than trusting
 * response.json()/text() to buffer an arbitrary amount. A declared
 * `content-length` over the limit is refused before any read; an unlabelled
 * (e.g. chunked) body is refused as soon as the running total crosses it. Both
 * are permanent failures — a target that returns more than the cap will do so
 * again — so they must not consume a retry the way a transient failure does.
 */
async function readBoundedBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > HTTP_MAX_RESPONSE_BYTES) {
    throw new PermanentError(`http.request response exceeds size limit: content-length ${declared} > ${HTTP_MAX_RESPONSE_BYTES}`);
  }
  if (!response.body) return contentType.includes("application/json") ? undefined : "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > HTTP_MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new PermanentError(`http.request response exceeds size limit: ${HTTP_MAX_RESPONSE_BYTES} bytes`);
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  return contentType.includes("application/json") ? JSON.parse(text) : text;
}

async function httpHandler(ctx: HandlerContext): Promise<HttpActionResult> {
  const config = httpConfigSchema.parse(ctx.config);

  // Before the socket, not after: a refused target must reach no connection at
  // all. Permanent because a retry meets the same policy — only an operator
  // changing the environment makes the target reachable, and that needs a
  // restart, after which the admin dead-letter view's retry re-delivers.
  const refusal = egressRefusal(config.url);
  if (refusal) throw new PermanentError(refusal);

  // After the egress check: a refused target must never touch the environment.
  const headers = buildHeaders(config, ctx.idempotencyKey, ctx.tenant);

  // A timeout always applies — the action's declared value overrides the
  // engine default rather than deciding whether one exists at all, so the
  // default fetch is never unbounded. The AbortController is built
  // unconditionally for the same reason.
  const controller = new AbortController();
  const timeoutMs = ctx.action.timeout ? durationMs(ctx.action.timeout) : HTTP_DEFAULT_TIMEOUT_MS;
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers,
      body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
      signal: controller.signal,
      // The load-bearing half of the egress policy. Following a redirect would
      // check the first hop against the allowlist and no other hop, so an
      // allowlisted host answering 302 to 169.254.169.254 would reach it.
      redirect: "manual",
    });

    if (response.status === 429 || response.status >= 500) {
      throw new Error(`http.request transient failure: ${response.status} ${response.statusText}`);
    }
    // Only a genuine 2xx counts as success — anything else (1xx, 3xx, or the
    // remaining 4xx) is permanent. `redirect: "manual"` makes the 3xx case
    // real: Bun returns the target's own status and Location rather than a
    // filtered opaque response, so a redirect lands here and dead-letters with
    // its status in the message. fetch() never surfaces 1xx as a final status,
    // so that half of the bound stays unreachable; it's here so the check
    // reads the same as the spec ("any 2xx").
    if (response.status < 200 || response.status >= 300) {
      throw new PermanentError(`http.request permanent failure: ${response.status} ${response.statusText}`);
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    // The body read happens inside this try, with the abort still armed: a
    // target that sends headers and then stalls on the body is aborted just
    // like one that never sends headers at all — clearing the timer in a
    // `finally` around only the fetch() call would leave this read unbounded.
    const body = await readBoundedBody(response);

    return { status: response.status, headers: responseHeaders, body };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export const httpHandlerDef: HandlerDef = {
  handler: httpHandler,
  configSchema: httpConfigSchema,
};
