/**
 * `openspec/changes/graceful-shutdown`: SIGTERM and SIGINT must stop the
 * server in order — refuse new connections, drain in-flight requests, stop
 * the engine pollers, close the pool — instead of dropping every pooled
 * Postgres connection where it stands.
 *
 * The end-to-end tests spawn the real `import.meta.main` entrypoint, so they
 * inherit `DATABASE_URL` after `test/preload-db.ts` has already pointed it at
 * the `_test` database. `bun test` runs one file at a time, so nothing else
 * drives those tables while a child lives.
 *
 * Every server here takes an ephemeral port (`development-toolchain`: "A test
 * that spawns a server takes an ephemeral port and reaps its child"). Fixed
 * ports were the defect: a run that died abnormally left its child holding the
 * bind, and the next run failed with "Is port 48232 in use?" rather than with
 * whatever orphaned the child. An OS never assigns a port something holds, so
 * a stray cannot redden a later run.
 */
import { test, expect } from "bun:test";
import { startHttpServer } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { sql } from "../src/engine/store.js";

const DB = !!process.env.DATABASE_URL;

/** How long a child gets to report its port before the spawn counts as failed. */
const STARTUP_DEADLINE_MS = 20_000;

interface SpawnedServer {
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  /** The port the OS handed the child, read from its own startup log. */
  port: number;
  /**
   * The child's whole stdout, awaited to the stream's end.
   *
   * The pump below runs from the spawn, because finding the port means reading
   * while the child lives and a stream reads once. Each caller asserts on a
   * line the child writes as it exits, so this awaits the pump rather than
   * returning what has arrived so far.
   */
  stdout: () => Promise<string>;
}

/**
 * Runs the entrypoint on an OS-assigned port, and resolves once the child
 * reports the port it bound.
 *
 * That log line is the readiness signal: `startHttpServer` writes it after
 * `Bun.serve` returns, so a child that logged it is listening. The `/livez`
 * poll this replaced proved the same thing one round trip later.
 */
async function spawnServer(): Promise<SpawnedServer> {
  const proc = Bun.spawn(["bun", "run", "src/http/server.ts"], {
    env: { ...process.env, PORT: "0" },
    stdout: "pipe",
    stderr: "pipe",
  });

  let text = "";
  const pump = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of proc.stdout) text += decoder.decode(chunk);
  })();
  const stdout = async () => {
    await pump;
    return text;
  };

  const deadline = Date.now() + STARTUP_DEADLINE_MS;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`server exited during startup with code ${proc.exitCode}: ${await new Response(proc.stderr).text()}`);
    }
    const port = boundPort(text);
    if (port !== undefined) return { proc, port, stdout };
    await Bun.sleep(50);
  }
  proc.kill("SIGKILL");
  throw new Error(`server never logged a bound port within ${STARTUP_DEADLINE_MS}ms`);
}

/**
 * The port from `log.info("HTTP server listening", { port })`, or `undefined`
 * while that line has not arrived.
 *
 * `src/log.ts` writes one JSON object per line, so this parses lines rather
 * than matching a number out of the raw text. A line still arriving in two
 * chunks parses on the next poll instead of half-parsing on this one.
 */
function boundPort(out: string): number | undefined {
  for (const line of out.split("\n")) {
    if (!line.includes('"HTTP server listening"')) continue;
    try {
      const parsed = JSON.parse(line) as { msg?: string; port?: number };
      if (parsed.msg === "HTTP server listening" && typeof parsed.port === "number") return parsed.port;
    } catch {
      // A partial line. The next poll sees the whole one.
    }
  }
  return undefined;
}

/** The exit code, or a failure if the process outlives `ms`. */
async function exitedWithin(proc: Bun.Subprocess, ms: number): Promise<number | null> {
  const timeout = Bun.sleep(ms).then(() => "timeout" as const);
  const result = await Promise.race([proc.exited, timeout]);
  if (result === "timeout") {
    proc.kill("SIGKILL");
    throw new Error(`process did not exit within ${ms}ms of the signal`);
  }
  return result;
}

test.skipIf(!DB)("stop() drains an in-flight request before its promise resolves", async () => {
  const prevPort = process.env.PORT;
  // `startHttpServer` reads PORT, so "0" reaches `Bun.serve` and the OS picks.
  // The handle it returns carries the assignment, so nothing here parses a log.
  process.env.PORT = "0";
  let stop: (() => Promise<void>) | undefined;
  let port!: number;
  try {
    const server = await startHttpServer(createRegistry(), createDataSourceRegistry(), sql, devHeaderResolver);
    stop = server.stop;
    port = server.port;

    // No route is slow, and `startHttpServer` builds its own fetch, so the
    // request is held open from the client side instead: `handleCreateInstance`
    // awaits `req.json()` before it touches the database, so the connection
    // stays in flight until the last chunk of the body lands.
    const payload = JSON.stringify({ data: {} });
    let releaseBody!: () => void;
    const bodyReleased = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(payload.slice(0, 4)));
        await bodyReleased;
        controller.enqueue(encoder.encode(payload.slice(4)));
        controller.close();
      },
    });

    let requestDone = false;
    const inflight = fetch(`http://127.0.0.1:${port}/processes/proc_no_such_process/instances`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Actor-Id": "shutdown-drain-test" },
      body,
      duplex: "half",
    }).then(async (res) => {
      await res.text();
      requestDone = true;
    });

    // Let the headers and the first chunk reach the server.
    await Bun.sleep(200);

    let stopResolved = false;
    const stopping = stop().then(() => {
      stopResolved = true;
    });
    stop = undefined;

    await Bun.sleep(200);
    expect(requestDone).toBe(false);
    expect(stopResolved).toBe(false);

    releaseBody();
    await inflight;
    expect(requestDone).toBe(true);

    await stopping;
    expect(stopResolved).toBe(true);
  } finally {
    await stop?.();
    process.env.PORT = prevPort;
  }
});

test.skipIf(!DB)("SIGTERM exits the server process with code 0", async () => {
  const server = await spawnServer();
  try {
    server.proc.kill("SIGTERM");
    expect(await exitedWithin(server.proc, 20_000)).toBe(0);
    expect(await server.stdout()).toContain('"msg":"shutdown complete"');
  } finally {
    // SIGKILL, not SIGTERM: the graceful path is what the assertions above
    // just exercised, and a cleanup that waits would hang a failing run.
    // Killing an already-exited child is a no-op, so the happy path pays
    // nothing for this.
    server.proc.kill("SIGKILL");
  }
});

test.skipIf(!DB)("a second SIGTERM during shutdown starts no second sequence", async () => {
  const server = await spawnServer();
  try {
    server.proc.kill("SIGTERM");
    server.proc.kill("SIGTERM");
    expect(await exitedWithin(server.proc, 20_000)).toBe(0);

    const stdout = await server.stdout();
    expect(stdout.split('"msg":"shutdown started"')).toHaveLength(2); // one occurrence
    expect(stdout.split('"msg":"shutdown complete"')).toHaveLength(2);
  } finally {
    server.proc.kill("SIGKILL");
  }
});

test.skipIf(!DB)("SIGINT follows the same shutdown path as SIGTERM", async () => {
  const server = await spawnServer();
  try {
    server.proc.kill("SIGINT");
    expect(await exitedWithin(server.proc, 20_000)).toBe(0);

    const stdout = await server.stdout();
    expect(stdout).toContain('"signal":"SIGINT"');
    expect(stdout).toContain('"msg":"shutdown complete"');
  } finally {
    server.proc.kill("SIGKILL");
  }
});
