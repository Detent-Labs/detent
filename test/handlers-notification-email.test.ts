/**
 * notification.email action handler: pure unit tests against a locally started
 * Bun.listen fake SMTP server, no DATABASE_URL required. The handler's one
 * database read is address resolution, and `accountsDb` below stands in for the
 * pool — `local-user-accounts`' own suite covers the real query. Mirrors
 * handlers-http.test.ts's style — flat test(), no describe blocks. The one
 * exception is the end-to-end send, which needs a real SMTP endpoint and skips
 * without SMTP_HOST, the same way the DB-backed suites skip without
 * DATABASE_URL.
 */
import { test, expect } from "bun:test";
import type { SQL } from "bun";
import {
  notificationEmailHandlerDef,
  notificationEmailConfigSchema,
  NOTIFICATION_EMAIL_ACTION_TYPE,
  SMTP_DEFAULT_TIMEOUT_MS,
} from "../src/handlers/notification-email.js";
import { deliver, PermanentError, type ClaimedRow } from "../src/engine/outbox.js";
import { createRegistry, register, resolve, type HandlerContext, type OutboxActors } from "../src/engine/registry.js";
import { createDefaultRegistry } from "../src/engine/host.js";
import type { Action } from "../src/schema/definition.js";

type Account = { user_id: string; email: string; disabled?: boolean };

/**
 * Stands in for the shared pool, answering `emailsForUserIds`' single query
 * from a fixed account table. The id list arrives as the first interpolated
 * value, which is what `db.array(userIds, "TEXT")` produces here.
 */
function accountsDb(accounts: Account[]): SQL {
  const fn = (_strings: TemplateStringsArray, ...values: unknown[]) => {
    const ids = (values[0] as string[] | undefined) ?? [];
    return Promise.resolve(
      accounts.filter((a) => ids.includes(a.user_id) && !a.disabled).map(({ user_id, email }) => ({ user_id, email })),
    );
  };
  (fn as unknown as { array: (v: string[]) => string[] }).array = (v) => v;
  return fn as unknown as SQL;
}

/** The def is plain now: the database rides on each context below as `db`. */
const mailDef = notificationEmailHandlerDef;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT;
const SMTP_FROM = process.env.SMTP_FROM;
const MAILPIT_API = process.env.MAILPIT_API ?? (SMTP_HOST ? `http://${SMTP_HOST}:8025` : "");

const action = (config: Record<string, unknown>, timeout?: string): Action =>
  ({ id: "action_mail", type: NOTIFICATION_EMAIL_ACTION_TYPE, config, ...(timeout ? { timeout } : {}) }) as unknown as Action;

const ctxFor = (
  config: Record<string, unknown>,
  opts: { idempotencyKey?: string; timeout?: string; actors?: OutboxActors; db?: SQL } = {},
): HandlerContext => ({
  action: action(config, opts.timeout),
  config,
  idempotencyKey: opts.idempotencyKey ?? "idem_1",
  instanceId: "inst_1",
  ...(opts.actors ? { actors: opts.actors } : {}),
  // Empty by default: every literal-`to` case below resolves no actor, so the
  // account lookup short-circuits and never reaches this handle.
  db: opts.db ?? accountsDb([]),
});

const validConfig = { to: ["ops@example.test"], subject: "Task waiting", body: "Please review." };

/** An outbox row as the worker hands it to deliver(), which evaluates Action.output over the result. */
const rowFor = (config: Record<string, unknown>, output?: Record<string, { lang: "cel"; src: string }>): ClaimedRow => ({
  idempotency_key: "idem_row",
  instance_id: "inst_1",
  transition_seq: 1,
  action: { ...action(config), ...(output ? { output } : {}) } as Action,
  attempts: 0,
  event_id: null,
  field_version: 1,
  actors: null,
});

async function rejects(p: Promise<unknown>): Promise<unknown> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).toBeDefined();
  return err;
}

/** Run `fn` with SMTP_* set to `env`, restoring whatever the process had before. */
async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

type FakeOptions = {
  /** Replies keyed by command verb. A missing entry answers 250. */
  replies?: Record<string, string>;
  /** One reply per RCPT TO, in order. A missing entry answers 250. */
  rcptReplies?: string[];
  /** Close the connection immediately after replying to the message body. */
  dropAfterBody?: boolean;
  /** Accept the connection and then never send anything, not even a greeting. */
  silent?: boolean;
  /** Advertise STARTTLS in the EHLO response. */
  offerStartTls?: boolean;
};

type FakeServer = { port: number; commands: string[]; messages: string[]; stop: () => void };

/** A scriptable SMTP server on a random loopback port. One connection at a time. */
function fakeSmtp(opts: FakeOptions = {}): FakeServer {
  const commands: string[] = [];
  const messages: string[] = [];
  let buffer = "";
  let inData = false;
  let rcptIndex = 0;
  const replyFor = (verb: string, fallback = "250 ok\r\n") => opts.replies?.[verb] ?? fallback;

  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(socket) {
        if (!opts.silent) socket.write(replyFor("GREETING", "220 fake ESMTP\r\n"));
      },
      data(socket, chunk) {
        if (opts.silent) return;
        buffer += Buffer.from(chunk).toString("latin1");
        for (;;) {
          if (inData) {
            const end = buffer.indexOf("\r\n.\r\n");
            if (end < 0) return;
            messages.push(buffer.slice(0, end));
            buffer = buffer.slice(end + 5);
            inData = false;
            socket.write(replyFor("BODY", "250 queued\r\n"));
            if (opts.dropAfterBody) socket.end();
            continue;
          }
          const eol = buffer.indexOf("\r\n");
          if (eol < 0) return;
          const line = buffer.slice(0, eol);
          buffer = buffer.slice(eol + 2);
          commands.push(line);
          const verb = line.split(/[\s:]/)[0]!.toUpperCase();
          if (verb === "EHLO") {
            const ext = opts.offerStartTls ? "250-STARTTLS\r\n" : "";
            socket.write(replyFor("EHLO", `250-fake greets you\r\n${ext}250 SIZE 10240000\r\n`));
          } else if (verb === "RCPT") {
            socket.write(opts.rcptReplies?.[rcptIndex++] ?? "250 recipient ok\r\n");
          } else if (verb === "DATA") {
            const reply = replyFor("DATA", "354 send it\r\n");
            socket.write(reply);
            if (reply.startsWith("3")) inData = true;
          } else if (verb === "QUIT") {
            socket.write(replyFor("QUIT", "221 bye\r\n"));
            socket.end();
          } else {
            socket.write(replyFor(verb));
          }
        }
      },
    },
  });

  return { port: server.port, commands, messages, stop: () => server.stop(true) };
}

/** Point the handler at a fresh fake server for the duration of `fn`. */
async function withFake<T>(opts: FakeOptions, fn: (server: FakeServer) => Promise<T>, env: Record<string, string | undefined> = {}): Promise<T> {
  const server = fakeSmtp(opts);
  try {
    return await withEnv(
      {
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(server.port),
        SMTP_FROM: "engine@example.test",
        SMTP_USER: undefined,
        SMTP_PASSWORD: undefined,
        ...env,
      },
      () => fn(server),
    );
  } finally {
    server.stop();
  }
}

// --- default registration ---------------------------------------------------

test("createDefaultRegistry resolves notification.email", () => {
  expect(resolve(createDefaultRegistry(), NOTIFICATION_EMAIL_ACTION_TYPE)).toBeDefined();
});

test("a caller-supplied registry without the handler is unaffected", async () => {
  // The same row against a registry that never registered the type: it
  // dead-letters as unregistered, exactly as it would have before this change.
  const err = await rejects(deliver(rowFor(validConfig), createRegistry(), accountsDb([])));
  expect(err).toBeInstanceOf(PermanentError);
  expect((err as Error).message).toContain(NOTIFICATION_EMAIL_ACTION_TYPE);
});

// --- config schema ----------------------------------------------------------

test("a well-formed config passes the schema", () => {
  expect(notificationEmailConfigSchema.safeParse(validConfig).success).toBe(true);
});

test("a malformed recipient address is rejected", () => {
  const result = notificationEmailConfigSchema.safeParse({ ...validConfig, to: ["not-an-address"] });
  expect(result.success).toBe(false);
});

test("an empty recipient list is rejected", () => {
  const result = notificationEmailConfigSchema.safeParse({ ...validConfig, to: [] });
  expect(result.success).toBe(false);
});

test("a missing subject is rejected", () => {
  const result = notificationEmailConfigSchema.safeParse({ to: ["ops@example.test"], body: "text" });
  expect(result.success).toBe(false);
});

test("a config naming only actor recipients passes the schema", () => {
  const result = notificationEmailConfigSchema.safeParse({ toActors: ["candidate"], subject: "s", body: "b" });
  expect(result.success).toBe(true);
});

test("an unknown actor token is rejected", () => {
  const result = notificationEmailConfigSchema.safeParse({ ...validConfig, toActors: ["assignee"] });
  expect(result.success).toBe(false);
});

test("two empty recipient lists are rejected", () => {
  const result = notificationEmailConfigSchema.safeParse({ to: [], toActors: [], subject: "s", body: "b" });
  expect(result.success).toBe(false);
});

test("both recipient lists absent is rejected", () => {
  const result = notificationEmailConfigSchema.safeParse({ subject: "s", body: "b" });
  expect(result.success).toBe(false);
});

// --- environment misconfiguration is permanent ------------------------------

test("an unset SMTP_HOST dead-letters immediately", async () => {
  await withEnv({ SMTP_HOST: undefined, SMTP_FROM: "engine@example.test" }, async () => {
    const err = await rejects(mailDef.handler(ctxFor(validConfig)));
    expect(err).toBeInstanceOf(PermanentError);
    expect((err as Error).message).toContain("SMTP_HOST");
  });
});

test("an unset SMTP_FROM dead-letters before opening a socket", async () => {
  // Port 1 has nothing listening: a socket attempt would fail as transient, so
  // a PermanentError here proves the check ran before any connection.
  await withEnv({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", SMTP_FROM: undefined }, async () => {
    const err = await rejects(mailDef.handler(ctxFor(validConfig)));
    expect(err).toBeInstanceOf(PermanentError);
    expect((err as Error).message).toContain("SMTP_FROM");
  });
});

// --- failure classification -------------------------------------------------

test("a refused connection is transient", async () => {
  const closed = fakeSmtp();
  const port = closed.port;
  closed.stop();
  await withEnv({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), SMTP_FROM: "engine@example.test" }, async () => {
    const err = await rejects(mailDef.handler(ctxFor(validConfig)));
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
  });
});

test("a 5xx reply is permanent", async () => {
  await withFake({ replies: { MAIL: "550 sender rejected\r\n" } }, async () => {
    const err = await rejects(mailDef.handler(ctxFor(validConfig)));
    expect(err).toBeInstanceOf(PermanentError);
    expect((err as Error).message).toContain("sender rejected");
  });
});

test("a 4xx reply is transient", async () => {
  await withFake({ replies: { MAIL: "451 try later\r\n" } }, async () => {
    const err = await rejects(mailDef.handler(ctxFor(validConfig)));
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
    expect((err as Error).message).toContain("try later");
  });
});

test("a stalled session is aborted by the declared timeout, not the default", async () => {
  await withFake({ silent: true }, async () => {
    const started = performance.now();
    const err = await rejects(mailDef.handler(ctxFor(validConfig, { timeout: "PT1S" })));
    const elapsed = performance.now() - started;
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentError);
    // The declared second must be what fired. Asserting only "it eventually
    // failed" would pass just as green if ctx.action.timeout were ignored and
    // SMTP_DEFAULT_TIMEOUT_MS ran instead — four seconds later.
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(SMTP_DEFAULT_TIMEOUT_MS);
  });
});

test("an advertised STARTTLS is taken, and no credential precedes it", async () => {
  // What this covers is the handler's own decision logic: it issues STARTTLS
  // when the server advertises it, and sends nothing secret before the upgrade.
  // The handshake itself cannot complete here — the fake server answers 220 and
  // then speaks no TLS — so the session stalls and fails transiently. That is
  // the assertion: an unusable upgrade is a retry, never a plaintext fallback.
  await withFake(
    { offerStartTls: true },
    async (server) => {
      const err = await rejects(mailDef.handler(ctxFor(validConfig, { timeout: "PT1S" })));
      expect(err).not.toBeInstanceOf(PermanentError);
      expect(server.commands).toContain("STARTTLS");
      expect(server.commands.some((c) => c.startsWith("AUTH"))).toBe(false);
      expect(server.messages).toHaveLength(0);
      // The phase names the upgrade, so an operator is not left reading a bare
      // "the session timed out" when a certificate is what actually failed.
      expect((err as Error).message).toContain("TLS handshake");
    },
    { SMTP_USER: "someone", SMTP_PASSWORD: "sup3rsecret" },
  );
});

test("credentials without STARTTLS are refused permanently", async () => {
  await withFake(
    { offerStartTls: false },
    async (server) => {
      const err = await rejects(mailDef.handler(ctxFor(validConfig)));
      expect(err).toBeInstanceOf(PermanentError);
      expect((err as Error).message).toContain("STARTTLS");
      expect(server.commands.some((c) => c.startsWith("AUTH"))).toBe(false);
    },
    { SMTP_USER: "someone", SMTP_PASSWORD: "secret" },
  );
});

// --- all recipients accepted before DATA ------------------------------------

test("a permanently rejected recipient sends nothing to anybody", async () => {
  await withFake({ rcptReplies: ["250 ok\r\n", "550 no such mailbox\r\n"] }, async (server) => {
    const config = { ...validConfig, to: ["a@example.test", "b@example.test", "c@example.test"] };
    const err = await rejects(mailDef.handler(ctxFor(config)));
    expect(err).toBeInstanceOf(PermanentError);
    expect(server.commands.some((c) => c.toUpperCase().startsWith("DATA"))).toBe(false);
    expect(server.messages).toHaveLength(0);
    // The third recipient is never even offered: the session ends at the second.
    expect(server.commands.filter((c) => c.toUpperCase().startsWith("RCPT"))).toHaveLength(2);
  });
});

test("a temporarily rejected recipient retries without having sent anything", async () => {
  await withFake({ rcptReplies: ["250 ok\r\n", "450 mailbox busy\r\n"] }, async (server) => {
    const config = { ...validConfig, to: ["a@example.test", "b@example.test"] };
    const err = await rejects(mailDef.handler(ctxFor(config)));
    expect(err).not.toBeInstanceOf(PermanentError);
    expect(server.messages).toHaveLength(0);
  });
});

// --- the point of no return -------------------------------------------------

test("a connection dropped after the body was accepted still succeeds", async () => {
  await withFake({ dropAfterBody: true }, async (server) => {
    const result = await mailDef.handler(ctxFor(validConfig));
    expect((result as { recipients: string[] }).recipients).toEqual(validConfig.to);
    expect(server.messages).toHaveLength(1);
  });
});

// --- the result shape, through deliver() ------------------------------------
// deliver() is where Action.output meets the handler's return value. These go
// through it rather than calling the handler directly: the whole reason the
// result shape is declared is that evalOutput throws a plain — therefore
// transient — error when a mapping cannot read `result`, which would redeliver
// a message the server already accepted.

test("deliver evaluates an Action.output mapping over the handler's result", async () => {
  await withFake({}, async () => {
    const reg = createRegistry();
    register(reg, NOTIFICATION_EMAIL_ACTION_TYPE, mailDef);
    const row = rowFor(validConfig, { field_sent: { lang: "cel", src: "result.messageId" } });
    const patch = await deliver(row, reg, accountsDb([]));
    expect(patch).toEqual({ field_sent: "<idem_row@example.test>" });
  });
});

test("deliver succeeds with no Action.output mapping and writes no field", async () => {
  await withFake({}, async (server) => {
    const reg = createRegistry();
    register(reg, NOTIFICATION_EMAIL_ACTION_TYPE, mailDef);
    const patch = await deliver(rowFor(validConfig), reg, accountsDb(ACCOUNTS));
    expect(patch).toEqual({});
    expect(server.messages).toHaveLength(1);
  });
});

test("an output mapping that cannot read the result fails transiently, after the message is out", async () => {
  await withFake({}, async (server) => {
    const reg = createRegistry();
    register(reg, NOTIFICATION_EMAIL_ACTION_TYPE, mailDef);
    const row = rowFor(validConfig, { field_sent: { lang: "cel", src: "result.noSuchKey" } });
    const err = await rejects(deliver(row, reg, accountsDb([])));
    // Transient, so the outbox retries and the message goes out again. This is
    // the duplicate-mail hazard the declared result shape exists to keep an
    // author away from, demonstrated rather than only described.
    expect(err).not.toBeInstanceOf(PermanentError);
    expect(server.messages).toHaveLength(1);
  });
});

// --- message construction ---------------------------------------------------

test("the message carries the delivery's idempotency key as its Message-ID", async () => {
  await withFake({}, async (server) => {
    const result = await mailDef.handler(ctxFor(validConfig, { idempotencyKey: "idem_abc" }));
    expect(server.messages[0]).toContain("Message-ID: <idem_abc@example.test>");
    expect((result as { messageId: string }).messageId).toBe("<idem_abc@example.test>");
  });
});

test("a retried delivery sends the same Message-ID as the original", async () => {
  const first = await withFake({}, async (server) => {
    await mailDef.handler(ctxFor(validConfig, { idempotencyKey: "idem_same" }));
    return server.messages[0]!;
  });
  const second = await withFake({}, async (server) => {
    await mailDef.handler(ctxFor(validConfig, { idempotencyKey: "idem_same" }));
    return server.messages[0]!;
  });
  const idOf = (raw: string) => raw.split("\r\n").find((l) => l.startsWith("Message-ID:"));
  expect(idOf(first)).toBe(idOf(second));
});

test("recipients, subject, and sender arrive as authored", async () => {
  await withFake({}, async (server) => {
    const config = { to: ["a@example.test", "b@example.test"], subject: "Review needed", body: "Body text." };
    await mailDef.handler(ctxFor(config));
    const raw = server.messages[0]!;
    expect(raw).toContain("To: a@example.test, b@example.test");
    expect(raw).toContain("Subject: Review needed");
    expect(raw).toContain("From: engine@example.test");
    expect(server.commands).toContain("MAIL FROM:<engine@example.test>");
    expect(server.commands).toContain("RCPT TO:<b@example.test>");
  });
});

test("the body is base64-encoded, so a leading dot cannot end the message early", async () => {
  await withFake({}, async (server) => {
    const body = ".\r\nnot the end of the message";
    await mailDef.handler(ctxFor({ ...validConfig, body }));
    const raw = server.messages[0]!;
    const encoded = raw.slice(raw.indexOf("\r\n\r\n") + 4).replace(/\r\n/g, "");
    expect(Buffer.from(encoded, "base64").toString("utf-8")).toBe(body);
  });
});

test("an authored newline is normalized to CRLF inside the body", async () => {
  await withFake({}, async (server) => {
    await mailDef.handler(ctxFor({ ...validConfig, body: "Line one.\nLine two." }));
    const raw = server.messages[0]!;
    const encoded = raw.slice(raw.indexOf("\r\n\r\n") + 4).replace(/\r\n/g, "");
    // Base64 is faithful to a fault: a bare "\n" would arrive intact and render
    // as no break at all in some readers.
    expect(Buffer.from(encoded, "base64").toString("utf-8")).toBe("Line one.\r\nLine two.");
  });
});

test("a non-ASCII subject is RFC 2047 encoded", async () => {
  await withFake({}, async (server) => {
    await mailDef.handler(ctxFor({ ...validConfig, subject: "Rückfrage" }));
    const raw = server.messages[0]!;
    const header = raw.split("\r\n").find((l) => l.startsWith("Subject:"))!;
    expect(header).toStartWith("Subject: =?utf-8?B?");
    const encoded = header.slice("Subject: =?utf-8?B?".length, -2);
    expect(Buffer.from(encoded, "base64").toString("utf-8")).toBe("Rückfrage");
  });
});

// --- end-to-end against a real SMTP endpoint --------------------------------

test.skipIf(!SMTP_HOST)("a real message round-trips through the SMTP catcher", async () => {
  const idempotencyKey = `idem_e2e_${Bun.randomUUIDv7()}`;
  const config = {
    to: ["participant@example.test"],
    subject: "Ihre Aufgabe wartet",
    body: "Line one.\nLine two with an ümlaut.",
  };

  await withEnv({ SMTP_HOST, SMTP_PORT, SMTP_FROM }, async () => {
    const result = await mailDef.handler(ctxFor(config, { idempotencyKey }));
    expect((result as { recipients: string[] }).recipients).toEqual(config.to);
  });

  // Matched on Message-ID rather than through /api/v1/search, which indexes
  // addresses and subjects but not that header. The catcher keeps messages
  // across runs, so the match must be exact rather than "the newest one".
  const listed = await fetch(`${MAILPIT_API}/api/v1/messages?limit=200`);
  expect(listed.status).toBe(200);
  const inbox = (await listed.json()) as {
    messages: { ID: string; MessageID: string; Subject: string; To: { Address: string }[] }[];
  };
  const expectedMessageId = `${idempotencyKey}@${SMTP_FROM!.split("@")[1]}`;
  const summary = inbox.messages.filter((m) => m.MessageID === expectedMessageId);
  expect(summary).toHaveLength(1);

  expect(summary[0]!.Subject).toBe(config.subject);
  expect(summary[0]!.To[0]!.Address).toBe(config.to[0]);

  const full = await fetch(`${MAILPIT_API}/api/v1/message/${summary[0]!.ID}`);
  const message = (await full.json()) as { Text: string };
  expect(message.Text.trim()).toBe(config.body.replace(/\n/g, "\r\n").trim());
});

// --- recipients resolved from the frozen actor ids ---------------------------

const ACCOUNTS: Account[] = [
  { user_id: "user_alice", email: "alice@example.test" },
  { user_id: "user_bob", email: "bob@example.test" },
  { user_id: "user_carol", email: "carol@example.test" },
  { user_id: "user_dana", email: "dana@example.test", disabled: true },
  { user_id: "user_ops", email: "ops@example.test" },
];

/** Every RCPT TO address the fake server saw, in the order the handler sent them. */
const rcptAddresses = (server: FakeServer): string[] =>
  server.commands.filter((c) => c.toUpperCase().startsWith("RCPT")).map((c) => c.replace(/^RCPT TO:<(.*)>$/i, "$1"));

/** The handler bound to the fixed account table above. */
const resolvingDef = notificationEmailHandlerDef;

const actorConfig = (toActors: string[], to: string[] = []) => ({ to, toActors, subject: "s", body: "b" });

/** Every actor-resolution case below reads the fixed account table above. */
const ctxForAccounts = (
  config: Record<string, unknown>,
  opts: { idempotencyKey?: string; actors?: OutboxActors } = {},
): HandlerContext => ctxFor(config, { ...opts, db: accountsDb(ACCOUNTS) });

test("one candidate resolves to that candidate's address", async () => {
  await withFake({}, async (server) => {
    const result = await resolvingDef.handler(ctxForAccounts(actorConfig(["candidate"]), { actors: { candidates: ["user_alice"] } }));
    expect((result as { recipients: string[] }).recipients).toEqual(["alice@example.test"]);
    expect(rcptAddresses(server)).toEqual(["alice@example.test"]);
  });
});

test("several candidates all receive the message", async () => {
  await withFake({}, async () => {
    const actors = { candidates: ["user_alice", "user_bob", "user_carol"] };
    const result = await resolvingDef.handler(ctxForAccounts(actorConfig(["candidate"]), { actors }));
    expect((result as { recipients: string[] }).recipients).toEqual([
      "alice@example.test",
      "bob@example.test",
      "carol@example.test",
    ]);
  });
});

test("a literal address and a resolved address deduplicate", async () => {
  await withFake({}, async (server) => {
    const config = actorConfig(["candidate"], ["ops@example.test"]);
    const result = await resolvingDef.handler(ctxForAccounts(config, { actors: { candidates: ["user_ops", "user_alice"] } }));
    // `to` first, then the tokens' addresses in candidate order, each once.
    expect((result as { recipients: string[] }).recipients).toEqual(["ops@example.test", "alice@example.test"]);
    expect(rcptAddresses(server)).toEqual(["ops@example.test", "alice@example.test"]);
  });
});

test("a disabled account contributes no address", async () => {
  await withFake({}, async () => {
    const actors = { candidates: ["user_dana", "user_bob"] };
    const result = await resolvingDef.handler(ctxForAccounts(actorConfig(["candidate"]), { actors }));
    expect((result as { recipients: string[] }).recipients).toEqual(["bob@example.test"]);
  });
});

test("an actor id with no account contributes no address", async () => {
  await withFake({}, async () => {
    const actors = { candidates: ["user_ghost", "user_bob"] };
    const result = await resolvingDef.handler(ctxForAccounts(actorConfig(["candidate"]), { actors }));
    expect((result as { recipients: string[] }).recipients).toEqual(["bob@example.test"]);
  });
});

test("the claimant token reaches the actor holding the claim", async () => {
  await withFake({}, async () => {
    const actors = { candidates: ["user_alice", "user_bob"], claimant: "user_bob" };
    const result = await resolvingDef.handler(ctxForAccounts(actorConfig(["claimant"]), { actors }));
    expect((result as { recipients: string[] }).recipients).toEqual(["bob@example.test"]);
  });
});

test("the starter token reaches the actor that started the instance", async () => {
  await withFake({}, async () => {
    const actors = { candidates: [], starter: "user_carol" };
    const result = await resolvingDef.handler(ctxForAccounts(actorConfig(["starter"]), { actors }));
    expect((result as { recipients: string[] }).recipients).toEqual(["carol@example.test"]);
  });
});

test("no candidate resolves, so no session opens and the delivery succeeds", async () => {
  await withFake({}, async (server) => {
    const actors = { candidates: [] };
    const result = await resolvingDef.handler(ctxForAccounts(actorConfig(["candidate"]), { actors, idempotencyKey: "idem_none" }));
    expect((result as { recipients: string[] }).recipients).toEqual([]);
    // The Message-ID keeps its declared shape, so an Action.output mapping over
    // `result.messageId` still evaluates rather than throwing a transient error.
    expect((result as { messageId: string }).messageId).toBe("<idem_none@example.test>");
    // Nothing reached the server: no greeting was consumed, no command sent.
    expect(server.commands).toEqual([]);
  });
});

test("a row carrying no frozen actor ids resolves nothing", async () => {
  await withFake({}, async (server) => {
    const result = await resolvingDef.handler(ctxForAccounts(actorConfig(["candidate", "claimant", "starter"])));
    expect((result as { recipients: string[] }).recipients).toEqual([]);
    expect(server.commands).toEqual([]);
  });
});

test("a literal recipient still sends when a token resolves nothing", async () => {
  await withFake({}, async (server) => {
    const config = actorConfig(["candidate"], ["ops@example.test"]);
    const result = await resolvingDef.handler(ctxForAccounts(config, { actors: { candidates: [] } }));
    expect((result as { recipients: string[] }).recipients).toEqual(["ops@example.test"]);
    expect(rcptAddresses(server)).toEqual(["ops@example.test"]);
  });
});

test("the To header lists every resolved address", async () => {
  await withFake({}, async (server) => {
    const actors = { candidates: ["user_alice", "user_bob"] };
    await resolvingDef.handler(ctxForAccounts(actorConfig(["candidate"]), { actors }));
    expect(server.messages[0]).toContain("To: alice@example.test, bob@example.test");
  });
});
