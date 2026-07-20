import { test, expect } from "bun:test";
import { durationMs, addDuration, instantFromValue } from "../src/engine/duration.js";

/** The exact shape of `toISOString()` for a 4-digit year, which minFireAt sorts on. */
const ISO_FIXED_WIDTH = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type Verdict = "accepted" | "malformed";

/** The one list of duration cases, shared by the accept and reject assertions. */
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
];

test("durationMs returns the millisecond value of every accepted duration", () => {
  const accepted = CASES.filter((c) => c.verdict === "accepted");
  expect(accepted.map((c) => [c.d, durationMs(c.d)])).toEqual(accepted.map((c) => [c.d, c.ms!]));
});

test("durationMs throws on an unsupported value rather than arming a wrong instant", () => {
  // A silent fallback would arm a fireAt the author never wrote. Nothing rejects a
  // malformed duration before this point — `Timer.duration` carries no format check.
  for (const { d } of CASES.filter((c) => c.verdict === "malformed"))
    expect(() => durationMs(d)).toThrow(/unsupported ISO 8601 duration/);
  expect(() => durationMs("P1Y")).toThrow("P1Y"); // names the offending value
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
