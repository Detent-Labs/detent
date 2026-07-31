/**
 * src/log.ts: JSON line shape per level, stream routing (error -> stderr,
 * info/warn -> stdout), and LOG_LEVEL gating. No DB, runs unconditionally.
 */
import { test, expect, spyOn } from "bun:test";
import { log } from "../src/log.js";

test("log.info emits one JSON line on console.log with ts, level, msg, and context", () => {
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  try {
    log.info("something happened", { instanceId: "inst_1" });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("something happened");
    expect(parsed.instanceId).toBe("inst_1");
    expect(typeof parsed.ts).toBe("string");
    expect(new Date(parsed.ts).toISOString()).toBe(parsed.ts);
  } finally {
    logSpy.mockRestore();
  }
});

test("log.warn emits on console.log, not console.error", () => {
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    log.warn("careful");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(parsed.level).toBe("warn");
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
});

test("log.error emits on console.error, not console.log", () => {
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = spyOn(console, "error").mockImplementation(() => {});
  try {
    log.error("broke");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(parsed.level).toBe("error");
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
});

test("a call with no context still emits ts/level/msg only", () => {
  const logSpy = spyOn(console, "log").mockImplementation(() => {});
  try {
    log.info("bare");
    const parsed = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(Object.keys(parsed).sort()).toEqual(["level", "msg", "ts"]);
  } finally {
    logSpy.mockRestore();
  }
});

// LOG_LEVEL gating: module-level state read once at import, so each case
// spawns a fresh subprocess with the env var set before Bun evaluates the
// module — a runtime toggle on the already-imported `log` cannot exercise
// this path.
async function loggedLevels(envLevel: string | undefined, calls: Array<"info" | "warn" | "error">): Promise<string[]> {
  const script = `
    const { log } = await import("./src/log.ts");
    const seen = [];
    console.log = (line) => seen.push(JSON.parse(line).level);
    console.error = (line) => seen.push(JSON.parse(line).level);
    for (const c of ${JSON.stringify(calls)}) log[c]("x");
    process.stdout.write(JSON.stringify(seen));
  `;
  const env = { ...process.env };
  if (envLevel === undefined) delete env.LOG_LEVEL;
  else env.LOG_LEVEL = envLevel;
  const proc = Bun.spawn(["bun", "-e", script], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe", env });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(out.trim() || "[]");
}

test("LOG_LEVEL=warn suppresses an info call but not a warn call", async () => {
  expect(await loggedLevels("warn", ["info"])).toEqual([]);
  expect(await loggedLevels("warn", ["warn"])).toEqual(["warn"]);
});

test("LOG_LEVEL=error suppresses warn but not error", async () => {
  expect(await loggedLevels("error", ["warn"])).toEqual([]);
  expect(await loggedLevels("error", ["error"])).toEqual(["error"]);
});

test("an unset LOG_LEVEL defaults to info: info passes, nothing below it exists to suppress", async () => {
  expect(await loggedLevels(undefined, ["info"])).toEqual(["info"]);
});
