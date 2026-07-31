/**
 * Vendor-neutral `notification.email` action handler: sends one plain-text
 * message over SMTP. `config` is static, publish-validated JSON — no instance
 * `data`, no DB lookup — exactly like `http.request`, whose file layout this
 * mirrors. Recipients are a literal address list, so this reaches a team or
 * manager mailbox, never the actor a step is assigned to.
 *
 * Connection details come from the environment, never from the process body,
 * following the DATABASE_URL / AUTH_JWT_SECRET convention.
 */

import { z } from "zod";
import { PermanentError } from "../engine/outbox.js";
import { durationMs } from "../engine/duration.js";
import type { HandlerContext, HandlerDef } from "../engine/registry.js";

export const NOTIFICATION_EMAIL_ACTION_TYPE = "notification.email";

/**
 * Applied when the action declares no `timeout` of its own. Set well under
 * CLAIM_LEASE_MS for the same reason HTTP_DEFAULT_TIMEOUT_MS is: this bound
 * fires first in the ordinary case, so the handler releases its own socket
 * rather than leaving the outbox's deadline to be the only thing that ends a
 * stalled session.
 */
export const SMTP_DEFAULT_TIMEOUT_MS = 5_000;

export const notificationEmailConfigSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string(),
  body: z.string(),
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
  env: SmtpEnv,
  messageId: string,
): string {
  const headers = [
    `From: ${env.from}`,
    `To: ${config.to.join(", ")}`,
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
 */
function buildMessageId(idempotencyKey: string, from: string): string {
  const domain = from.split("@")[1] ?? "localhost";
  return `<${idempotencyKey}@${domain}>`;
}

async function runSession(
  wire: SmtpWire,
  config: z.infer<typeof notificationEmailConfigSchema>,
  env: SmtpEnv,
  idempotencyKey: string,
  phase: { current: string },
): Promise<NotificationEmailResult> {
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

  // Every recipient is checked before DATA. Delivering to the accepted ones and
  // reporting the rest breaks under at-least-once: a 4xx rejection is
  // transient, the outbox retries the row, and every already-accepted address
  // receives the message twice. Aborting here means nothing was sent at all.
  for (const address of config.to) {
    phase.current = `RCPT TO ${address}`;
    wire.write(`RCPT TO:<${address}>\r\n`);
    requireOk(await wire.next(), `RCPT TO ${address}`);
  }

  phase.current = "DATA";
  wire.write("DATA\r\n");
  requireOk(await wire.next(), "DATA");

  const messageId = buildMessageId(idempotencyKey, env.from);
  // Built before the message goes out, so producing the result cannot raise
  // after the server has already accepted it.
  const result: NotificationEmailResult = { messageId, recipients: [...config.to] };

  phase.current = "message body";
  wire.write(`${buildMessage(config, env, messageId)}.\r\n`);
  requireOk(await wire.next(), "message body");

  // The 250 above is the point of no return. SMTP carries no idempotency
  // contract and most receivers ignore Message-ID, so a redelivery is a second
  // real message. QUIT is written without awaiting its reply for that reason:
  // nothing after this line can fail the delivery.
  wire.write("QUIT\r\n");
  return result;
}

/** EHLO's argument. A relay only logs it; SMTP_FROM's domain is the honest answer. */
function clientName(from: string): string {
  return from.split("@")[1] ?? "localhost";
}

async function notificationEmailHandler(ctx: HandlerContext): Promise<NotificationEmailResult> {
  const config = notificationEmailConfigSchema.parse(ctx.config);
  const env = readSmtpEnv();
  const wire = new SmtpWire();

  const timeoutMs = ctx.action.timeout ? durationMs(ctx.action.timeout) : SMTP_DEFAULT_TIMEOUT_MS;
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
    return await Promise.race([runSession(wire, config, env, ctx.idempotencyKey, phase), deadline]);
  } finally {
    clearTimeout(timeoutHandle);
    wire.close();
  }
}

export const notificationEmailHandlerDef: HandlerDef = {
  handler: notificationEmailHandler,
  configSchema: notificationEmailConfigSchema,
};
