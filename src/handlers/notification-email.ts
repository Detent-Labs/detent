/**
 * Vendor-neutral `notification.email` action handler: sends plain-text mail
 * over SMTP, one message per batch of at most SMTP_MAX_RECIPIENTS_PER_SESSION
 * recipients. Subject and body are static, publish-validated JSON — no
 * instance `data`, no lookup of the instance — exactly like `http.request`,
 * whose file layout this mirrors.
 *
 * Recipients are the one part this resolves rather than copies. `to` carries
 * literal addresses. `toActors` names roles — `candidate`, `claimant`,
 * `starter` — which map onto the actor ids the engine froze onto the outbox row
 * at enqueue (`HandlerContext.actors`), and which this turns into addresses via
 * `auth_users`. That reaches the actor holding a step, which a literal list
 * cannot.
 *
 * The account lookup reads `ctx.db`, the handle the delivery itself carries.
 * No new module is needed for it: `assignment-strategies.ts` exists only
 * because `registry.ts` is a leaf three modules default a parameter to, and
 * this file is no such leaf.
 *
 * Connection details come from the environment, never from the process body,
 * following the DATABASE_URL / AUTH_JWT_SECRET convention.
 */

import { z } from "zod";
import { emailAddressSchema, emailsForUserIds } from "../auth/users.js";
import { durationMs } from "../engine/duration.js";
import { PermanentError } from "../engine/outbox.js";
import type { HandlerContext, HandlerDef, OutboxActors } from "../engine/registry.js";
import { log } from "../log.js";

export const NOTIFICATION_EMAIL_ACTION_TYPE = "notification.email";

/**
 * Applied when the action declares no `timeout` of its own. Set well under
 * CLAIM_LEASE_MS for the same reason HTTP_DEFAULT_TIMEOUT_MS is: this bound
 * fires first in the ordinary case, so the handler releases its own socket
 * rather than leaving the outbox's deadline to be the only thing that ends a
 * stalled session.
 */
export const SMTP_DEFAULT_TIMEOUT_MS = 5_000;

/**
 * The most recipients one SMTP session carries. RFC 5321 §4.5.3.1.10 obliges a
 * server to accept 100, so a smaller number gains nothing and a larger one fails
 * on a conforming relay. A longer list sends in consecutive batches of this size.
 */
export const SMTP_MAX_RECIPIENTS_PER_SESSION = 100;

/** The three roles `toActors` may name, each mapping onto state the instance already carries. */
export const NOTIFICATION_ACTOR_TOKENS = ["candidate", "claimant", "starter"] as const;

export type NotificationActorToken = (typeof NOTIFICATION_ACTOR_TOKENS)[number];

/**
 * `to` no longer carries `.min(1)`: an action may name its recipients by role
 * alone. The object-level rule below replaces that bound and covers the case
 * `.min(1)` could not — both lists empty. It runs at publish through
 * `checkActionRegistry`, like every other config rule here.
 */
export const notificationEmailConfigSchema = z
  .object({
    to: z.array(emailAddressSchema).default([]),
    toActors: z.array(z.enum(NOTIFICATION_ACTOR_TOKENS)).default([]),
    subject: z.string(),
    body: z.string(),
  })
  .refine((c) => c.to.length + c.toActors.length > 0, {
    message: "notification.email: name at least one recipient in `to` or `toActors`",
    path: ["to"],
  });

/**
 * The `result` namespace an Action.output mapping reads. A stable shape matters
 * more here than for a webhook: evalOutput throws a plain Error when an entry
 * cannot read `result`, a plain Error is transient, and a redelivery sends a
 * second real message.
 */
export type NotificationEmailResult = { messageId: string; recipients: string[] };

type Reply = { code: number; text: string };

type SmtpEnv = { host: string; port: number; user?: string; password?: string; from: string };

/**
 * Read the environment at dispatch time, not at module load, so a deployment
 * that sets SMTP_* after import still works and a test can vary it per case.
 * A missing host or sender is a deployment misconfiguration no retry repairs.
 * No sender is substituted for an unset SMTP_FROM: a synthesized address fails
 * SPF at a real relay, turning a clear config error into a 5xx mid-delivery.
 */
function readSmtpEnv(): SmtpEnv {
  const host = process.env.SMTP_HOST;
  if (!host) throw new PermanentError("notification.email: SMTP_HOST is not configured");
  const from = process.env.SMTP_FROM;
  if (!from) throw new PermanentError("notification.email: SMTP_FROM is not configured");
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port <= 0) {
    throw new PermanentError(`notification.email: SMTP_PORT is not a port number: ${process.env.SMTP_PORT}`);
  }
  return { host, port, user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD, from };
}

/**
 * A 2xx/3xx reply continues the session (3xx covers DATA's 354). Everything
 * else ends it, split the way the outbox reads a thrown error: 5xx is
 * permanent — an unknown mailbox does not become known on the next attempt —
 * and 4xx is transient. The server's own reply text rides along, so an
 * operator sees which command it refused.
 */
function requireOk(reply: Reply, what: string): Reply {
  if (reply.code >= 200 && reply.code < 400) return reply;
  if (reply.code >= 500) throw new PermanentError(`notification.email ${what} rejected: ${reply.code} ${reply.text}`);
  throw new Error(`notification.email ${what} deferred: ${reply.code} ${reply.text}`);
}

/**
 * Owns the socket and turns Bun's callback-driven reads into awaited replies.
 * The socket is mutable because STARTTLS replaces it: upgradeTLS returns a new
 * TLS socket, and everything after the handshake writes to that one.
 */
class SmtpWire {
  private buffer = "";
  private ready: Reply[] = [];
  private waiter: { resolve: (r: Reply) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;
  // Structural rather than `Socket<T>`: Bun.connect hands back a
  // `Socket<undefined>` and upgradeTLS a `Socket<unknown>`, and the wire needs
  // neither generic — only these two methods.
  private socket: { write(data: string): unknown; end(): unknown } | null = null;

  /** Handlers for both the plain and the upgraded socket — the wire is the same either way. */
  readonly handlers = {
    data: (_s: unknown, chunk: Uint8Array) => this.onData(chunk),
    error: (_s: unknown, err: Error) => this.fail(err),
    close: () => this.fail(new Error("notification.email: the SMTP server closed the connection")),
  };

  attach(socket: { write(data: string): unknown; end(): unknown }): void {
    this.socket = socket;
  }

  write(line: string): void {
    this.socket?.write(line);
  }

  close(): void {
    try {
      this.socket?.end();
    } catch {
      // The session is over either way; a failing close cannot change its outcome.
    }
  }

  /** Resolve with the next complete reply, or reject with whatever ended the connection. */
  next(): Promise<Reply> {
    const queued = this.ready.shift();
    if (queued) return Promise.resolve(queued);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise<Reply>((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }

  private onData(chunk: Uint8Array): void {
    // SMTP replies are ASCII, so decoding per chunk cannot split a character.
    this.buffer += Buffer.from(chunk).toString("latin1");
    for (;;) {
      const end = completeReplyEnd(this.buffer);
      if (end < 0) break;
      const raw = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end);
      this.push(parseReply(raw));
    }
  }

  private push(reply: Reply): void {
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      waiter.resolve(reply);
      return;
    }
    this.ready.push(reply);
  }

  private fail(err: Error): void {
    this.failure ??= err;
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      waiter.reject(this.failure);
    }
  }
}

/**
 * Index just past the end of the first complete reply in `buf`, or -1. A reply
 * ends on the first line whose fourth character is a space; a hyphen there
 * marks a continuation line (RFC 5321 §4.2.1).
 */
function completeReplyEnd(buf: string): number {
  let start = 0;
  for (;;) {
    const eol = buf.indexOf("\r\n", start);
    if (eol < 0) return -1;
    const line = buf.slice(start, eol);
    if (line.length === 3 || line[3] === " ") return eol + 2;
    start = eol + 2;
  }
}

function parseReply(raw: string): Reply {
  const lines = raw.split("\r\n").filter((l) => l.length > 0);
  const last = lines[lines.length - 1] ?? "";
  return { code: Number(last.slice(0, 3)), text: lines.map((l) => l.slice(4)).join(" ").trim() };
}

/** RFC 2047 encoding, applied only when the subject leaves printable ASCII. */
function encodeSubject(subject: string): string {
  if (!/[^\x20-\x7e]/.test(subject)) return subject;
  return `=?utf-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

/**
 * Base64 sidesteps two wire hazards at once: the dot-stuffing rule for a line
 * starting with `.`, and the 998-octet line limit. An author writing a long
 * paragraph or a leading dot cannot corrupt the message.
 *
 * Bare newlines are normalized to CRLF first: RFC 5322 line endings survive
 * base64 verbatim, so an authored "\n" would otherwise reach the reader's
 * client as one, which some render as a single run-on line.
 */
function encodeBody(body: string): string {
  const b64 = Buffer.from(body.replace(/\r?\n/g, "\r\n"), "utf-8").toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join("\r\n");
}

function buildMessage(
  config: z.infer<typeof notificationEmailConfigSchema>,
  recipients: string[],
  env: SmtpEnv,
  messageId: string,
): string {
  const headers = [
    `From: ${env.from}`,
    `To: ${recipients.join(", ")}`,
    `Subject: ${encodeSubject(config.subject)}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${encodeBody(config.body)}\r\n`;
}

/**
 * The Message-ID carries the delivery's idempotency key, so a cooperating mail
 * system can dedupe a redelivered message — the counterpart of
 * `http.request`'s Idempotency-Key header. Its domain comes from SMTP_FROM.
 *
 * A list that needs several batches passes each batch's one-based number, which
 * follows the key after a hyphen. The same batch keeps the same identifier on
 * every try of the delivery. A single batch passes none and keeps the plain form.
 */
function buildMessageId(idempotencyKey: string, from: string, batchNumber?: number): string {
  const domain = from.split("@")[1] ?? "localhost";
  const suffix = batchNumber === undefined ? "" : `-${batchNumber}`;
  return `<${idempotencyKey}${suffix}@${domain}>`;
}

/** One SMTP session: the whole conversation for one batch, ending with the point of no return. */
async function runSession(
  wire: SmtpWire,
  config: z.infer<typeof notificationEmailConfigSchema>,
  recipients: string[],
  env: SmtpEnv,
  messageId: string,
  phase: { current: string },
): Promise<void> {
  phase.current = "connect";
  const socket = await Bun.connect({ hostname: env.host, port: env.port, socket: wire.handlers });
  wire.attach(socket);
  phase.current = "greeting";
  requireOk(await wire.next(), "greeting");

  phase.current = "EHLO";
  wire.write(`EHLO ${clientName(env.from)}\r\n`);
  let ehlo = requireOk(await wire.next(), "EHLO");

  if (/\bSTARTTLS\b/i.test(ehlo.text)) {
    phase.current = "STARTTLS";
    wire.write("STARTTLS\r\n");
    requireOk(await wire.next(), "STARTTLS");
    const [, tlsSocket] = socket.upgradeTLS({ tls: { serverName: env.host }, socket: wire.handlers });
    wire.attach(tlsSocket);
    // Named separately from "STARTTLS": a stall here is the TLS handshake, not
    // the command. Without the distinction an operator reads only "the session
    // timed out" and has no reason to suspect the certificate or the upgrade.
    phase.current = "TLS handshake";
    wire.write(`EHLO ${clientName(env.from)}\r\n`);
    ehlo = requireOk(await wire.next(), "EHLO after STARTTLS");
  } else if (env.user) {
    // A relay that offers no STARTTLS does not start offering it on a retry,
    // so this is permanent. The password is never sent in the clear.
    throw new PermanentError(
      "notification.email: SMTP_USER is set but the server advertises no STARTTLS; refusing to authenticate in the clear",
    );
  }

  if (env.user) {
    phase.current = "AUTH";
    const credential = Buffer.from(`\0${env.user}\0${env.password ?? ""}`, "utf-8").toString("base64");
    wire.write(`AUTH PLAIN ${credential}\r\n`);
    requireOk(await wire.next(), "AUTH");
  }

  phase.current = "MAIL FROM";
  wire.write(`MAIL FROM:<${env.from}>\r\n`);
  requireOk(await wire.next(), "MAIL FROM");

  // Every recipient of the batch is checked before DATA. Delivering to the
  // accepted ones and reporting the rest breaks under at-least-once: a 4xx
  // rejection is transient, the outbox retries the row, and every
  // already-accepted address receives the message twice. Aborting here means
  // nothing of this batch was sent at all.
  for (const address of recipients) {
    phase.current = `RCPT TO ${address}`;
    wire.write(`RCPT TO:<${address}>\r\n`);
    requireOk(await wire.next(), `RCPT TO ${address}`);
  }

  phase.current = "DATA";
  wire.write("DATA\r\n");
  requireOk(await wire.next(), "DATA");

  phase.current = "message body";
  wire.write(`${buildMessage(config, recipients, env, messageId)}.\r\n`);
  requireOk(await wire.next(), "message body");

  // The 250 above is the point of no return. SMTP carries no idempotency
  // contract and most receivers ignore Message-ID, so a redelivery is a second
  // real message. QUIT is written without awaiting its reply for that reason:
  // nothing after this line can fail the batch.
  wire.write("QUIT\r\n");
}

/**
 * Sends one batch in a session of its own. `timeoutMs` bounds this session
 * alone, so a long list over a slow relay is bounded per batch and the outbox's
 * claim lease stays the bound on the delivery as a whole.
 */
async function deliverBatch(
  config: z.infer<typeof notificationEmailConfigSchema>,
  batch: string[],
  env: SmtpEnv,
  messageId: string,
  timeoutMs: number,
): Promise<void> {
  const wire = new SmtpWire();
  // The session step that was waiting when the bound fired. A bare "the session
  // timed out" leaves an operator without the one fact that localizes the fault.
  const phase = { current: "connect" };
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      // Release the socket rather than waiting for the outbox's claim lease.
      wire.close();
      reject(new Error(`notification.email: the SMTP session exceeded ${timeoutMs}ms during ${phase.current}`));
    }, timeoutMs);
  });

  try {
    await Promise.race([runSession(wire, config, batch, env, messageId, phase), deadline]);
  } finally {
    clearTimeout(timeoutHandle);
    wire.close();
  }
}

/** EHLO's argument. A relay only logs it; SMTP_FROM's domain is the honest answer. */
function clientName(from: string): string {
  return from.split("@")[1] ?? "localhost";
}

/**
 * The actor ids a token names, in the order the message will list them.
 * `candidate` yields every candidate: they are all eligible to do the work, so
 * picking one would need a selection rule this engine does not have.
 *
 * ponytail: the candidate list is unbounded, and it sends in batches of
 * SMTP_MAX_RECIPIENTS_PER_SESSION, one session after another. The batch size is
 * fixed at the RFC 5321 minimum. N recipients take ceil(N / 100) sequential
 * sessions inside the outbox's claim lease, and a lease that runs out retries
 * the row and resends the batches already delivered. Candidates come from a
 * publish-validated strategy, and the two shipped ones produce a configured list
 * or one manager. If a strategy ever resolves a directory group of thousands,
 * make the batch size configurable for a relay that allows more, or enqueue one
 * outbox row per batch.
 */
function actorIdsFor(tokens: NotificationActorToken[], actors: OutboxActors | undefined): string[] {
  const ids: string[] = [];
  for (const token of tokens) {
    if (token === "candidate") ids.push(...(actors?.candidates ?? []));
    else if (token === "claimant" && actors?.claimant) ids.push(actors.claimant);
    else if (token === "starter" && actors?.starter) ids.push(actors.starter);
  }
  return ids;
}

/**
 * The addresses this delivery sends to: `to` verbatim first, then the addresses
 * the tokens resolved, in candidate order. Each address appears once — an
 * author naming a mailbox literally AND by role must not send it two copies.
 *
 * An id matching no account, or one whose account is disabled, contributes
 * nothing. `emailsForUserIds` drops both, so the Map lookup below misses.
 *
 * A stored address that `emailAddressSchema` refuses contributes nothing either:
 * a line break or an angle bracket would reach an SMTP command, and a typo draws
 * a 5xx that drops the mail for its whole batch. One warning per dropped account
 * names the instance, the action and the account id. The address text stays out
 * of the log, since it may hold line breaks.
 */
async function resolveRecipients(
  config: z.infer<typeof notificationEmailConfigSchema>,
  ctx: HandlerContext,
): Promise<string[]> {
  const ids = actorIdsFor(config.toActors, ctx.actors);
  const byId = await emailsForUserIds(ids, ctx.db);
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (address: string | undefined): void => {
    if (address && !seen.has(address)) {
      seen.add(address);
      out.push(address);
    }
  };
  for (const address of config.to) add(address);
  for (const userId of new Set(ids)) {
    const address = byId.get(userId);
    if (address === undefined) continue;
    if (emailAddressSchema.safeParse(address).success) add(address);
    else {
      log.warn("notification.email dropped a stored address that is no valid address", {
        instanceId: ctx.instanceId,
        actionId: ctx.action.id,
        userId,
      });
    }
  }
  return out;
}

async function notificationEmailHandler(ctx: HandlerContext): Promise<NotificationEmailResult> {
  const config = notificationEmailConfigSchema.parse(ctx.config);
  const env = readSmtpEnv();
  const recipients = await resolveRecipients(config, ctx);

  // No recipient resolved: send nothing and succeed. A step that resolved to no
  // candidate already records an `assignment.unresolved` event. When every
  // resolved account held an invalid address, the per-account drop warnings keep
  // that visible. Dead-lettering here would report the same fact a second time
  // and park a row an operator then discards by hand. The warning keeps the
  // condition visible without that chore. The Message-ID is still built, so `result` keeps its declared shape
  // for an Action.output mapping.
  if (recipients.length === 0) {
    log.warn("notification.email resolved no recipient", {
      instanceId: ctx.instanceId,
      actionId: ctx.action.id,
      idempotencyKey: ctx.idempotencyKey,
    });
    return { messageId: buildMessageId(ctx.idempotencyKey, env.from), recipients: [] };
  }

  const timeoutMs = ctx.action.timeout ? durationMs(ctx.action.timeout) : SMTP_DEFAULT_TIMEOUT_MS;

  // Consecutive batches in list order, one message each. A single batch keeps the
  // plain Message-ID; several number every batch from one, the first included.
  const batches: string[][] = [];
  for (let i = 0; i < recipients.length; i += SMTP_MAX_RECIPIENTS_PER_SESSION) {
    batches.push(recipients.slice(i, i + SMTP_MAX_RECIPIENTS_PER_SESSION));
  }
  const messageIds = batches.map((_, i) =>
    buildMessageId(ctx.idempotencyKey, env.from, batches.length > 1 ? i + 1 : undefined),
  );
  // Built before any message goes out, so producing the result cannot raise
  // after a server has already accepted one.
  const result: NotificationEmailResult = { messageId: messageIds[0]!, recipients };

  // Sequential, and a failure in any batch fails the delivery. Earlier batches
  // stay sent; the retry repeats them under the same Message-IDs.
  for (const [i, batch] of batches.entries()) {
    await deliverBatch(config, batch, env, messageIds[i]!, timeoutMs);
  }
  return result;
}

/**
 * A plain def, not a factory. The database arrives on every invocation as
 * `ctx.db`, so one registry serves every tenant: a handle bound when the
 * registry was built would resolve every tenant's addresses against one
 * account directory. Stage 24 replaced the factory this file briefly carried.
 */
export const notificationEmailHandlerDef: HandlerDef = {
  handler: notificationEmailHandler,
  configSchema: notificationEmailConfigSchema,
};
