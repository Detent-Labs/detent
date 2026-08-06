/**
 * The worker tick boundary (`src/engine/poll.ts`) and the shared per-item line
 * every worker drain writes. Both used to discard their error with no record,
 * so a worker failing forever had no outward symptom. Pure — no DATABASE_URL.
 */
import { test, expect, spyOn } from "bun:test";
import { pollForever, logSkippedItem } from "../src/engine/poll.js";
import { ConcurrencyConflict } from "../src/engine/transition.js";

/** Lines `log.error` wrote, parsed. `log` emits one JSON line per call. */
function errorLines(spy: { mock: { calls: unknown[][] } }): Record<string, unknown>[] {
  return spy.mock.calls.map((c) => JSON.parse(c[0] as string) as Record<string, unknown>);
}

test("a tick that throws logs an error line naming its worker, and the loop keeps going", async () => {
  // Wait on the LINE, not on the tick count and not on wall-clock time. The
  // catch that writes the line runs a microtask after the tick throws, so a
  // test that resolves inside the tick body observes n-1 lines and flakes.
  const seen: string[] = [];
  let thirdLine: () => void;
  const reached = new Promise<void>((r) => {
    thirdLine = r;
  });
  const errorSpy = spyOn(console, "error").mockImplementation((line: string) => {
    seen.push(line);
    if (seen.length >= 3) thirdLine(); // >=, so a burst cannot step past the signal and hang
  });

  let ticks = 0;
  const handle = pollForever(
    "test-worker",
    async () => {
      ticks++;
      throw new Error("tick blew up");
    },
    1,
  );
  await reached;
  handle.stop();
  errorSpy.mockRestore();

  const lines = seen.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.msg === "worker tick failed");
  // Three lines means three ticks ran, so the loop rescheduled after each throw.
  expect(lines).toHaveLength(3);
  expect(ticks).toBeGreaterThanOrEqual(3);
  expect(lines[0].level).toBe("error");
  expect(lines[0].worker).toBe("test-worker");
  expect(lines[0].error).toBe("tick blew up");
});

test("a stopped loop schedules no further tick", async () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  let ticks = 0;
  const handle = pollForever(
    "stopped-worker",
    async () => {
      ticks++;
      throw new Error("boom");
    },
    1,
  );
  await Bun.sleep(20);
  handle.stop();
  const after = ticks;
  await Bun.sleep(20);
  errorSpy.mockRestore();

  expect(ticks).toBe(after);
});

test("a skipped item logs an error line carrying the worker, the item and the message", () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  logSkippedItem("outbox", { idempotencyKey: "key_1" }, new Error("corrupt row"));
  const lines = errorLines(errorSpy).filter((l) => l.msg === "worker skipped a failing item");
  errorSpy.mockRestore();

  expect(lines).toHaveLength(1);
  expect(lines[0].level).toBe("error");
  expect(lines[0].worker).toBe("outbox");
  expect(lines[0].idempotencyKey).toBe("key_1");
  expect(lines[0].error).toBe("corrupt row");
});

test("a non-Error thrown value still reaches the line", () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  logSkippedItem("timers", { instanceId: "inst_1" }, "a bare string");
  const lines = errorLines(errorSpy).filter((l) => l.msg === "worker skipped a failing item");
  errorSpy.mockRestore();

  expect(lines).toHaveLength(1);
  expect(lines[0].error).toBe("a bare string");
});

// The violating input this rejects: an error-level line for a lost OCC race.
// Two workers reaching one instance together is what the OCC predicate is for,
// so it must not read as a fault an operator chases.
test("a ConcurrencyConflict logs below error level, not at error level", () => {
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  logSkippedItem("timers", { instanceId: "inst_1" }, new ConcurrencyConflict("inst_1", 4));
  const lines = errorLines(errorSpy);
  errorSpy.mockRestore();

  expect(lines.filter((l) => l.msg === "worker skipped a failing item")).toHaveLength(0);
});
