/**
 * `openspec/changes/graceful-shutdown`: SIGTERM and SIGINT must stop the
 * server in order — refuse new connections, drain in-flight requests, stop
 * the engine pollers, close the pool — instead of dropping every pooled
 * Postgres connection where it stands.
 *
 * The end-to-end tests spawn the real `import.meta.main` entrypoint, so they
 * inherit `DATABASE_URL` after `test/preload-db.ts` has already pointed it at
 * the `_test` database. Each spawns on its own port: the 3000 default belongs
 * to `scripts/dev-up.sh`, and `bun test` runs one file at a time, so nothing
 * else drives those tables while a child lives.
 */
import { test, expect } from "bun:test";
import { startHttpServer } from "../src/http/server.js";
import { createRegistry, createDataSourceRegistry } from "../src/engine/registry.js";
import { devHeaderResolver } from "../src/auth/resolve.js";
import { sql } from "../src/engine/store.js";

const DB = !!process.env.DATABASE_URL;

/** Distinct from every other suite's ports, so a lingering bind cannot collide. */
const UNIT_PORT = 48231;
const SIGTERM_PORT = 48232;
const REPEAT_SIGNAL_PORT = 48233;
const SIGINT_PORT = 48234;

/** Runs the entrypoint on `port` and resolves once `/livez` answers. */
async function spawnServer(port: number): Promise<Bun.Subprocess<"ignore", "pipe", "pipe">> {
  const proc = Bun.spawn(["bun", "run", "src/http/server.ts"], {
    env: { ...process.env, PORT: String(port) },
    stdout: "pipe",
    stderr: "pipe",
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`server exited during startup with code ${proc.exitCode}: ${await new Response(proc.stderr).text()}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/livez`);
      if (res.ok) return proc;
    } catch {
      // Not listening yet.
    }
    await Bun.sleep(100);
  }
  proc.kill("SIGKILL");
  throw new Error(`server on port ${port} never answered /livez`);
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
  process.env.PORT = String(UNIT_PORT);
  let stop: (() => Promise<void>) | undefined;
  try {
    const server = await startHttpServer(createRegistry(), createDataSourceRegistry(), sql, devHeaderResolver);
    stop = server.stop;

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
    const inflight = fetch(`http://127.0.0.1:${UNIT_PORT}/processes/proc_no_such_process/instances`, {
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
  const proc = await spawnServer(SIGTERM_PORT);
  proc.kill("SIGTERM");
  expect(await exitedWithin(proc, 20_000)).toBe(0);

  const stdout = await new Response(proc.stdout).text();
  expect(stdout).toContain('"msg":"shutdown complete"');
});

test.skipIf(!DB)("a second SIGTERM during shutdown starts no second sequence", async () => {
  const proc = await spawnServer(REPEAT_SIGNAL_PORT);
  proc.kill("SIGTERM");
  proc.kill("SIGTERM");
  expect(await exitedWithin(proc, 20_000)).toBe(0);

  const stdout = await new Response(proc.stdout).text();
  expect(stdout.split('"msg":"shutdown started"')).toHaveLength(2); // one occurrence
  expect(stdout.split('"msg":"shutdown complete"')).toHaveLength(2);
});

test.skipIf(!DB)("SIGINT follows the same shutdown path as SIGTERM", async () => {
  const proc = await spawnServer(SIGINT_PORT);
  proc.kill("SIGINT");
  expect(await exitedWithin(proc, 20_000)).toBe(0);

  const stdout = await new Response(proc.stdout).text();
  expect(stdout).toContain('"signal":"SIGINT"');
  expect(stdout).toContain('"msg":"shutdown complete"');
});
