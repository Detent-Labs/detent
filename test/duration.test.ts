import { test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { durationMs, addDuration, instantFromValue, armStepTimers } from "../src/engine/duration.js";
import { parseIsoDuration, MAX_TIMER_DURATION_MS } from "../src/schema/definition.js";
import type { Instance, ProcessBody, Step } from "../src/schema/definition.js";

/** The exact shape of `toISOString()` for a 4-digit year, which minFireAt sorts on. */
const ISO_FIXED_WIDTH = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** The largest duration the magnitude bound admits, and the smallest it does not. */
const MAX_DURATION = `PT${(MAX_TIMER_DURATION_MS / 1000).toFixed(3)}S`;
const OVER_BOUND = `PT${(MAX_TIMER_DURATION_MS / 1000 + 1).toFixed(3)}S`;

/** The entry-instant ceiling MAX_TIMER_DURATION_MS is derived against. */
const ENTRY_CEILING = "9000-01-01T00:00:00.000Z";

/**
 * accepted     — inside the grammar and the timer bound.
 * malformed    — outside the grammar: parseIsoDuration and durationMs both reject it.
 * out-of-range — inside the grammar, over the timer magnitude bound.
 */
type Verdict = "accepted" | "malformed" | "out-of-range";

/**
 * The one list of duration cases. The contract's `parseIsoDuration` and the engine's
 * `durationMs` are checked against it in the SAME assertion, so a grammar change to
 * either that is not mirrored in the other fails here. Two independent tables would
 * let them drift apart while both stayed green, and validation accepting what arming
 * rejects is the defect this suite exists to prevent.
 */
const CASES: { d: string; verdict: Verdict; ms?: number }[] = [
  // Every fixed unit, alone and combined.
  { d: "PT0S", verdict: "accepted", ms: 0 },
  { d: "PT30S", verdict: "accepted", ms: 30_000 },
  { d: "PT1.5S", verdict: "accepted", ms: 1_500 },
  { d: "PT1M", verdict: "accepted", ms: 60_000 }, // M after T = minutes
  { d: "PT90M", verdict: "accepted", ms: 5_400_000 },
  { d: "PT2H", verdict: "accepted", ms: 7_200_000 },
  { d: "P1D", verdict: "accepted", ms: 86_400_000 },
  { d: "P7D", verdict: "accepted", ms: 604_800_000 },
  { d: "P1W", verdict: "accepted", ms: 604_800_000 },
  { d: "P2WT12H", verdict: "accepted", ms: (14 * 86400 + 12 * 3600) * 1000 },
  { d: "P1DT2H30M", verdict: "accepted", ms: (86400 + 2 * 3600 + 30 * 60) * 1000 },
  { d: "P1DT2H3M4S", verdict: "accepted", ms: (86400 + 2 * 3600 + 3 * 60 + 4) * 1000 },
  { d: MAX_DURATION, verdict: "accepted", ms: MAX_TIMER_DURATION_MS },
  // Calendar units are rejected deliberately: ambiguous without a date library.
  { d: "P1Y", verdict: "malformed" },
  { d: "P3M", verdict: "malformed" },
  { d: "P1M", verdict: "malformed" }, // month (M before T), not minutes
  { d: "P1YT1H", verdict: "malformed" },
  // Designators carrying no component denote nothing.
  { d: "P", verdict: "malformed" },
  { d: "PT", verdict: "malformed" },
  { d: "", verdict: "malformed" },
  // Outside the grammar in every other way.
  { d: "1 day", verdict: "malformed" },
  { d: "garbage", verdict: "malformed" },
  { d: "1D", verdict: "malformed" }, // missing leading P
  { d: "p1d", verdict: "malformed" }, // lowercase
  { d: " P1D", verdict: "malformed" },
  { d: "P1D ", verdict: "malformed" },
  { d: "P-1D", verdict: "malformed" },
  { d: "P1.5D", verdict: "malformed" }, // only seconds may be fractional
  { d: "PT1H30", verdict: "malformed" }, // unit-less trailing number
  { d: "P1DP1D", verdict: "malformed" },
  { d: "T1H", verdict: "malformed" },
  // A time designator with no time component. Every unit inside the T group is
  // optional, so a bare trailing T matched before the lookahead was added.
  { d: "P1DT", verdict: "malformed" },
  { d: "P1WT", verdict: "malformed" },
  { d: "PT1H30MT", verdict: "malformed" },
  // Grammar-valid, but a fireAt computed from it can leave the four-digit-year window.
  { d: "P9999999D", verdict: "out-of-range" },
  { d: "P3000000D", verdict: "out-of-range" },
  { d: "P2912243D", verdict: "out-of-range" },
  { d: OVER_BOUND, verdict: "out-of-range" }, // the bound itself, one millisecond over
];

test("the contract's parser and durationMs accept exactly the same grammar", () => {
  // Both verdicts per case in one comparison. Neither applies the magnitude bound —
  // that is the publish check's job — so an `out-of-range` case is grammar-valid to
  // both, and ANY disagreement here is drift, shown as a diff naming the duration.
  const observed = CASES.map(({ d }) => {
    let engine = true;
    try {
      durationMs(d);
    } catch {
      engine = false;
    }
    return { d, schema: parseIsoDuration(d) !== null, engine };
  });
  expect(observed).toEqual(
    CASES.map(({ d, verdict }) => ({ d, schema: verdict !== "malformed", engine: verdict !== "malformed" })),
  );
});

test("durationMs returns the millisecond value of every accepted duration", () => {
  const accepted = CASES.filter((c) => c.verdict === "accepted");
  expect(accepted.map((c) => [c.d, durationMs(c.d)])).toEqual(accepted.map((c) => [c.d, c.ms!]));
});

test("durationMs throws on an unsupported value rather than arming a wrong instant", () => {
  // Unreachable for a validated body — the refinement rejects it at publish — but the
  // assertion is deliberate: a silent fallback would arm a fireAt the author never wrote.
  for (const { d } of CASES.filter((c) => c.verdict === "malformed"))
    expect(() => durationMs(d)).toThrow(/unsupported ISO 8601 duration/);
  expect(() => durationMs("P1Y")).toThrow("P1Y"); // names the offending value
});

/** A `/` opens a regex literal only where a value may start; after a value it divides. */
const REGEX_START = /(?:^|[=(,:[!&|?{};+\-*%~^<>]|\b(?:return|typeof|case|in|of|do|else|yield|await))\s*$/;

/**
 * Every regex source in one TypeScript file: literal regexes in ANY position, plus
 * the string-literal arguments of a `RegExp(...)` construction (concatenated pieces
 * joined). Comments and unrelated string literals are skipped. Position-independent
 * on purpose — a grammar copy is a copy whether it is written `const X = /re/`,
 * `let`, `const X: RegExp =`, split across lines, inlined into an expression, or
 * built with `new RegExp("...")`.
 */
function patternsIn(text: string): { body: string; flags: string }[] {
  const found: { body: string; flags: string }[] = [];
  const calls: { depth: number; parts: string[] }[] = [];
  let tail = ""; // trailing source characters, for lookbehind
  let depth = 0;
  let i = 0;
  const advance = (to: number, seen: string) => {
    i = to;
    tail = (tail + seen).slice(-24);
  };
  while (i < text.length) {
    const c = text[i]!;
    if (c === "/" && text[i + 1] === "/") {
      const e = text.indexOf("\n", i);
      i = e < 0 ? text.length : e;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const e = text.indexOf("*/", i + 2);
      i = e < 0 ? text.length : e + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      let s = "";
      while (j < text.length && text[j] !== c) {
        if (text[j] === "\\") {
          s += text[j + 1] ?? ""; // the escape's value: "\\d" in source means \d in the pattern
          j += 2;
        } else s += text[j++]!;
      }
      calls.at(-1)?.parts.push(s);
      advance(j + 1, "'");
      continue;
    }
    if (c === "/" && REGEX_START.test(tail)) {
      let j = i + 1;
      let body = "";
      let inClass = false;
      for (; j < text.length; j++) {
        const d = text[j]!;
        if (d === "\\") {
          body += d + (text[j + 1] ?? "");
          j++;
          continue;
        }
        if (d === "\n") break; // a regex literal cannot span lines: not a regex
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        body += d;
      }
      if (text[j] === "/") {
        let k = j + 1;
        let flags = "";
        while (k < text.length && /[a-z]/.test(text[k]!)) flags += text[k++]!;
        found.push({ body, flags });
        advance(k, "/");
        continue;
      }
    }
    if (c === "(") {
      depth++;
      if (/\bRegExp\s*$/.test(tail)) calls.push({ depth, parts: [] });
    } else if (c === ")") {
      // A call with no string literal in it builds its pattern from something this
      // scan cannot read; an empty body would match every case and report the file.
      if (calls.at(-1)?.depth === depth) {
        const parts = calls.pop()!.parts;
        if (parts.length) found.push({ body: parts.join(""), flags: "" });
      }
      depth--;
    }
    advance(i + 1, c);
  }
  return found;
}

test("no regex under src/ outside the schema matches an ISO duration", () => {
  // A second grammar is how the two verdicts drift apart, and a copy passes the
  // agreement test above on the day it is written — that test compares the two
  // implementations, so it fails when they disagree, not when a copy appears. This
  // one is what fails at the copy.
  //
  // Scope, stated honestly: this is a syntactic scan. It reads every regex literal
  // and every RegExp(...) built from string literals under src/, in any syntactic
  // position and in any file, and requires that only the schema's matches a duration.
  // It cannot see a pattern assembled from non-literal pieces at runtime, nor a
  // grammar hand-rolled without a regex at all. Those stay possible; for the one
  // module that matters most, src/engine/duration.ts, the test below closes them.
  const src = fileURLToPath(new URL("../src/", import.meta.url));
  const accepted = CASES.filter((c) => c.verdict === "accepted");
  const owners = new Set<string>();
  for (const entry of readdirSync(src, { recursive: true, encoding: "utf8" })) {
    if (!entry.endsWith(".ts")) continue;
    for (const { body, flags } of patternsIn(readFileSync(src + entry, "utf8"))) {
      let re: RegExp;
      try {
        re = new RegExp(body, flags.replace(/[gy]/g, "")); // stateful flags would skip cases
      } catch {
        continue; // not a valid pattern: a division misread, or a runtime-built fragment
      }
      if (accepted.some((c) => re.test(c.d))) owners.add(entry.replaceAll("\\", "/"));
    }
  }
  expect([...owners].sort()).toEqual(["schema/definition.ts"]);
});

test("the engine's durationMs parses through the contract's parser", () => {
  // Paired with `tsc --noEmit`, this covers duration.ts even against a copy the scan
  // above cannot see. A hand-rolled parser replacing the call leaves the import
  // unused, which noUnusedLocals rejects; dropping the import to silence that is what
  // this assertion rejects. One of the two fires either way.
  const engine = readFileSync(fileURLToPath(new URL("../src/engine/duration.ts", import.meta.url)), "utf8");
  expect(engine).toMatch(/import \{[^}]*\bparseIsoDuration\b[^}]*\} from "\.\.\/schema\/definition\.js"/);
});

test("the bound is exactly the span from the entry ceiling to the last representable ms", () => {
  // The derivation, recomputed: the bound is not a number someone liked, it is
  // 9999-12-31T23:59:59.999Z minus the stated entry-instant ceiling. A ceiling is
  // what makes the bound sufficient — the property is entryInstant + duration, and
  // the check cannot know the entry instant, so it must assume the latest one it
  // promises to cover.
  expect(MAX_TIMER_DURATION_MS).toBe(Date.parse("9999-12-31T23:59:59.999Z") - Date.parse(ENTRY_CEILING));
  const atCeiling = addDuration(ENTRY_CEILING, MAX_DURATION);
  expect(atCeiling).toBe("9999-12-31T23:59:59.999Z");
  expect(atCeiling).toMatch(ISO_FIXED_WIDTH);
});

test("no accepted duration overflows from any entry instant before the ceiling", () => {
  // The guarantee the bound states, exercised rather than argued: every accepted
  // case, armed from entries spanning the whole covered range, keeps the 24-char
  // form minFireAt's lexical sort depends on.
  const entries = ["1970-01-01T00:00:00.000Z", "2026-07-20T12:34:56.789Z", "8999-12-31T23:59:59.999Z"];
  for (const { d } of CASES.filter((c) => c.verdict === "accepted"))
    for (const entry of entries) expect(addDuration(entry, d)).toMatch(ISO_FIXED_WIDTH);
});

test("bounding by the full four-digit-year span would not have been sufficient", () => {
  // Teeth for the ceiling. Each of these fits inside 0001-9999 — the bound the
  // first implementation used — yet overflows from an ordinary 2026 entry, so
  // armStepTimers would raise on schema-valid authoring input. The expanded form
  // it produces is also exactly what sorts ahead of every ordinary fireAt.
  const fullSpan = Date.parse("9999-12-31T23:59:59.999Z") - Date.parse("0000-01-01T00:00:00.000Z");
  for (const d of ["P3000000D", "P2912243D"]) {
    expect(parseIsoDuration(d)!).toBeLessThan(fullSpan);
    expect(parseIsoDuration(d)!).toBeGreaterThan(MAX_TIMER_DURATION_MS);
    const overflowed = addDuration("2026-07-20T12:34:56.789Z", d);
    expect(overflowed.length).toBeGreaterThan(24);
    expect(overflowed.startsWith("+")).toBe(true);
    expect(overflowed < "2026-07-20T12:34:56.789Z").toBe(true);
  }
  // And one millisecond past the bound overflows from the ceiling itself.
  expect(addDuration(ENTRY_CEILING, OVER_BOUND).startsWith("+")).toBe(true);
});

/** A step carrying one duration timer, plus the two arguments the duration branch ignores. */
function durationStepFixture(duration: string): { step: Step; body: ProcessBody; entering: Instance } {
  const step = {
    id: "step_wait", key: "wait", label: "Wait", type: "task",
    timers: [{ id: "timer_t1", duration, onFire: { actions: [] } }],
  } as unknown as Step;
  // The duration branch reads neither `body` nor `entering` — the CEL context is
  // built only when a deadline is present — so a minimal pair reaches the assertion.
  return {
    step,
    body: { fields: [], workflow: { initialStep: "step_wait", steps: [step] } } as unknown as ProcessBody,
    entering: { currentStepId: "step_wait", transitionSeq: 1, data: {} } as unknown as Instance,
  };
}

test("an armed duration timer records provenance matching its declared source", () => {
  const { step, body, entering } = durationStepFixture("PT1H");
  const { armed, drops } = armStepTimers(step, "2026-07-20T12:34:56.789Z", body, entering);
  expect(drops).toEqual([]);
  expect(armed).toEqual([{
    timerId: "timer_t1",
    fireAt: "2026-07-20T13:34:56.789Z",
    provenance: { kind: "duration", duration: "PT1H", armedAt: "2026-07-20T12:34:56.789Z" },
  }] as unknown as typeof armed);
});

test("arming raises when a bound-valid duration overflows from an entry past the ceiling", () => {
  // The residue the width assertion exists for. The publish-time bound guarantees no
  // overflow from an entry before year 9000 and says nothing at or after it, so the
  // reachable case is an entry in the last thousand years of the window: P365D is
  // six orders of magnitude inside the bound, yet from a 9999 entry it leaves it.
  expect(parseIsoDuration("P365D")).not.toBeNull(); // grammar-valid: not durationMs' throw
  expect(parseIsoDuration("P365D")!).toBeLessThan(MAX_TIMER_DURATION_MS);
  const entry = "9999-06-01T00:00:00.000Z";
  expect(addDuration(entry, "P365D")).toBe("+010000-05-31T00:00:00.000Z");

  const { step, body, entering } = durationStepFixture("P365D");
  // Raises rather than arming the expanded-year value, which would win minFireAt's
  // lexical sort on its leading "+" and suppress every other timer on the step.
  expect(() => armStepTimers(step, entry, body, entering)).toThrow(/four-digit-year range/);
  expect(() => armStepTimers(step, entry, body, entering)).toThrow(/timer_t1/); // names the timer

  // The same timer from an ordinary entry arms normally, so the raise is a property
  // of the entry instant and not of the authored duration.
  expect(armStepTimers(step, "2026-07-20T12:34:56.789Z", body, entering)).toEqual({
    armed: [{
      timerId: "timer_t1",
      fireAt: "2027-07-20T12:34:56.789Z",
      provenance: { kind: "duration", duration: "P365D", armedAt: "2026-07-20T12:34:56.789Z" },
    }],
    drops: [],
  } as unknown as ReturnType<typeof armStepTimers>);
});

test("addDuration adds to the instant and emits UTC ISO", () => {
  expect(addDuration("2026-01-01T00:00:00.000Z", "P1D")).toBe("2026-01-02T00:00:00.000Z");
  expect(addDuration("2026-01-01T00:00:00.000Z", "PT30S")).toBe("2026-01-01T00:00:30.000Z");
  expect(addDuration("2026-01-01T23:59:30.000Z", "PT1M")).toBe("2026-01-02T00:00:30.000Z");
});

test("instantFromValue normalizes date-only, offset-bearing and Z instants to UTC ISO", () => {
  expect(instantFromValue("2026-08-01")).toBe("2026-08-01T00:00:00.000Z"); // midnight UTC
  expect(instantFromValue("2026-08-01T10:00:00+02:00")).toBe("2026-08-01T08:00:00.000Z");
  expect(instantFromValue("2026-08-01T09:00:00Z")).toBe("2026-08-01T09:00:00.000Z");
  expect(instantFromValue("2026-08-01T09:00:00.250Z")).toBe("2026-08-01T09:00:00.250Z");
  expect(instantFromValue("  2026-08-01T09:00:00Z  ")).toBe("2026-08-01T09:00:00.000Z"); // trimmed
});

/**
 * The zone the process started in, read before anything mutates TZ. Restoring by
 * `delete process.env.TZ` instead would freeze Bun's cached zone permanently: once
 * the variable is unset, every later assignment is ignored for the rest of the
 * process, silently making all subsequent zone forcing inert.
 */
const HOST_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Run `fn` with process.env.TZ forced to `tz`, restoring the previous zone. */
function withTZ(tz: string, fn: () => void): void {
  const original = process.env.TZ;
  try {
    process.env.TZ = tz;
    fn();
  } finally {
    process.env.TZ = original ?? HOST_TZ;
  }
}

test("a naive datetime is read as UTC, independently of the host timezone", () => {
  // The point of the helper: a persisted fireAt must not depend on the machine that
  // committed the entry. Asserted across zones east and west of UTC, with the bare
  // `new Date()` reading checked to differ — a host-local parse would move the result.
  for (const tz of ["Asia/Tokyo", "America/Los_Angeles", "UTC"])
    withTZ(tz, () => {
      expect(instantFromValue("2026-08-01T10:00:00")).toBe("2026-08-01T10:00:00.000Z");
      expect(instantFromValue("2026-08-01T10:00")).toBe("2026-08-01T10:00:00.000Z");
      expect(instantFromValue("2026-08-01T10:00:00.500")).toBe("2026-08-01T10:00:00.500Z");
    });
  // Teeth: under a non-UTC host the unguarded parse really does land elsewhere.
  withTZ("Asia/Tokyo", () => {
    expect(new Date("2026-08-01T10:00:00").toISOString()).not.toBe("2026-08-01T10:00:00.000Z");
  });
});

test("instantFromValue is total: a non-string or unparseable string is null", () => {
  for (const v of [undefined, null, 42, true, {}, [], new Date(), ["2026-08-01"]])
    expect(instantFromValue(v)).toBeNull();
  for (const s of ["", "   ", "garbage", "not a date", "2026-13-45", "P1D", "1754038800"])
    expect(instantFromValue(s)).toBeNull();
});

test("host-local date forms are rejected, not read in the host timezone", () => {
  // Each of these is outside strict ISO-8601, so `new Date()` hands it to the legacy
  // parser, which reads it in the HOST's zone: the same authored deadline would arm a
  // different fireAt per worker machine. The whitelist rejects them outright.
  const hostLocal = ["12/25/2026", "August 1, 2026", "August 1, 2026 10:00", "2026/08/01"];
  for (const tz of ["Asia/Tokyo", "America/Los_Angeles"])
    withTZ(tz, () => {
      for (const s of hostLocal) expect(instantFromValue(s)).toBeNull();
    });
  // Teeth: the legacy parse really is host-local — the same string reads as two
  // different instants under two zones, so accepting it would make the persisted
  // fireAt a function of whichever machine committed the entry.
  let tokyo = "";
  let la = "";
  withTZ("Asia/Tokyo", () => {
    tokyo = new Date("12/25/2026").toISOString();
  });
  withTZ("America/Los_Angeles", () => {
    la = new Date("12/25/2026").toISOString();
  });
  expect(tokyo).not.toBe(la);
});

test("a space separator is accepted and read as UTC under every host timezone", () => {
  // "2026-08-01 10:00:00" is the form a Postgres timestamp stringifies to, so a
  // deadline reading one straight out of a data source must arm deterministically.
  for (const tz of ["Asia/Tokyo", "America/Los_Angeles", "Europe/Zurich", "UTC"])
    withTZ(tz, () => {
      expect(instantFromValue("2026-08-01 10:00:00")).toBe("2026-08-01T10:00:00.000Z");
      expect(instantFromValue("2026-08-01 10:00")).toBe("2026-08-01T10:00:00.000Z");
      expect(instantFromValue("2026-08-01 10:00:00.250")).toBe("2026-08-01T10:00:00.250Z");
      expect(instantFromValue("2026-08-01 10:00:00+02:00")).toBe("2026-08-01T08:00:00.000Z");
    });
  // The DST fold: 02:30 on the European turn-back night is ambiguous in a local zone
  // and does not exist at all in some. Read as UTC it is neither — one answer, both zones.
  for (const tz of ["Europe/Zurich", "America/New_York"])
    withTZ(tz, () => {
      expect(instantFromValue("2026-10-25 02:30:00")).toBe("2026-10-25T02:30:00.000Z");
    });
});

test("values denoting no date are null, not a timestamp decades in the past", () => {
  // The legacy parser turns each of these into some instant (host-local, so the exact
  // value moves per machine): "5" -> 2001-04-30, "1" -> 2000-12-31, "99" -> 1998-12-31,
  // "Dec 25" -> 2001-12-24, "2026" -> 2026-01-01, "2026-08" -> 2026-08-01. The first
  // four arm a timer far in the past, which the scheduler's due-timer poll fires on its
  // very next pass; the last two silently invent a day the author never wrote.
  for (const s of ["5", "2026", "99", "Dec 25", "2026-08", "1"]) expect(instantFromValue(s)).toBeNull();
});

test("expanded-year instants are rejected so minFireAt's lexical sort holds", () => {
  // `toISOString()` emits the 27-char expanded-year form outside 0001-9999, and "+"
  // (0x2B) sorts before every digit. minFireAt picks the earliest fireAt by plain
  // string sort, so one such value would win that sort and suppress every other timer
  // on the step; the "-" form is a year 0 or negative that is not a real deadline either.
  expect(instantFromValue("+275760-09-13T00:00:00Z")).toBeNull();
  expect(instantFromValue("-000001-01-01T00:00:00Z")).toBeNull();
  // The premise: that is genuinely what the expanded form stringifies to, and it does
  // sort ahead of an ordinary fireAt.
  const expanded = new Date("+275760-09-13T00:00:00Z").toISOString();
  expect(expanded.length).toBeGreaterThan(24);
  expect(expanded < "2026-08-01T00:00:00.000Z").toBe(true);
});

test("every accepted instant has the exact toISOString width minFireAt sorts on", () => {
  const accepted = [
    "2026-08-01",
    "2026-08-01T10:00",
    "2026-08-01 10:00:00",
    "2026-08-01T10:00:00.5",
    "2026-08-01T10:00:00.250Z",
    "2026-08-01T10:00:00+02:00",
    "2026-08-01T10:00:00-0800",
    "0001-01-01T00:00:00Z",
    "9999-12-31T23:59:59.999Z",
  ];
  for (const s of accepted) {
    const iso = instantFromValue(s);
    expect(iso).not.toBeNull();
    expect(iso!.length).toBe(24);
    expect(iso!).toMatch(ISO_FIXED_WIDTH);
  }
  // The width is what lets minFireAt compare a deadline fireAt against a duration
  // fireAt with a plain string sort: same shape => lexical order is chronological.
  const deadline = instantFromValue("2026-08-01 09:59:59")!;
  const earlier = addDuration("2026-08-01T00:00:00.000Z", "PT1H");
  const later = addDuration("2026-08-01T00:00:00.000Z", "P1D");
  expect([later, deadline, earlier].sort()).toEqual([earlier, deadline, later]);
  expect(earlier < deadline).toBe(true);
  expect(deadline < later).toBe(true);
});
