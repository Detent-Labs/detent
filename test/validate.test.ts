import { readFileSync } from "node:fs";
import { describe, it, expect } from "bun:test";
import { processVersion, publishedProcessBody, instanceEvent, migrationSpec, MAX_TIMER_DURATION_MS, type ProcessBody } from "../src/schema/definition.js";
import { compileProcessBody, validateDurations, DurationValidationError } from "../src/schema/compile.js";
import { definitionHash } from "../src/schema/hash.js";

const raw = JSON.parse(
  readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf8"),
);

const rejects = (mutate: (d: any) => void): boolean => {
  const bad = structuredClone(raw);
  mutate(bad);
  return !processVersion.safeParse(bad).success;
};

describe("expense-approval definition", () => {
  it("validates the example", () => {
    expect(processVersion.safeParse(raw).success).toBe(true);
  });

  it("rejects an unresolved path target", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[0].paths[0].to = "step_does_not_exist";
    })).toBe(true);
  });

  it("rejects an outcome on a non-terminal step", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[0].outcome = "booked";
    })).toBe(true);
  });

  it("rejects mixed manual+automatic paths on one step", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[1].paths.push({
        id: "path_bbbb2222-9999-4a1c-8e2f-000000000099",
        key: "auto",
        to: "step_aaaa1111-0003-4a1c-8e2f-000000000003",
        trigger: "automatic",
        guard: { lang: "cel", src: "true" },
      });
    })).toBe(true);
  });

  it("rejects automatic paths without unique priority", () => {
    expect(rejects((d) => {
      const book = d.definition.workflow.steps[2];
      book.paths[0].priority = 5;
      book.paths[1].priority = 5;
    })).toBe(true);
  });

  it("rejects a terminal outcome not in the contract", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[3].outcome = "not_declared";
    })).toBe(true);
  });

  it("rejects options and dataSource together on a field", () => {
    expect(rejects((d) => {
      d.definition.fields[3].dataSource = "ds_something";
    })).toBe(true);
  });

  it("rejects an id with the wrong prefix", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[0].id = "node_wrongprefix";
    })).toBe(true);
  });

  it("keeps validity after a label rename", () => {
    const rename = structuredClone(raw);
    rename.definition.workflow.steps[1].label = "Erste Pruefung";
    expect(processVersion.safeParse(rename).success).toBe(true);
  });

  // A second action reachable by the booking transition (step_book.onEntry
  // already maps field ...0004) mapping the same field is the last-writer hazard.
  const dupOutputAction = (field: string) => ({
    id: "action_dddddddd-0000-4a1c-8e2f-000000000009",
    type: "noop",
    config: {},
    output: { [field]: { lang: "cel", src: "result.status" } },
  });

  it("rejects two actions on one transition writing the same output field", () => {
    expect(rejects((d) => {
      d.definition.workflow.steps[2].onEntry.push(
        dupOutputAction("field_1a2b3c4d-0004-4a1c-8e2f-000000000004"),
      );
    })).toBe(true);
  });

  it("accepts two actions on one transition writing disjoint fields", () => {
    const ok = structuredClone(raw);
    ok.definition.workflow.steps[2].onEntry.push(
      dupOutputAction("field_1a2b3c4d-0001-4a1c-8e2f-000000000001"),
    );
    expect(processVersion.safeParse(ok).success).toBe(true);
  });

  it("rejects two onCancel actions writing the same output field", () => {
    expect(rejects((d) => {
      const f = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001";
      d.definition.workflow.steps[0].onCancel = [
        { id: "action_c1000000-0000-4a1c-8e2f-000000000001", type: "noop", config: {}, output: { [f]: { lang: "cel", src: "result.x" } } },
        { id: "action_c2000000-0000-4a1c-8e2f-000000000002", type: "noop", config: {}, output: { [f]: { lang: "cel", src: "result.y" } } },
      ];
    })).toBe(true);
  });
});

// A duration is armed inside the transition commit, on the TARGET step, so an
// unvalidated one does not fail a single instance: it makes the step unreachable
// for every instance of the definition. It is checked on the WRITE path — see
// `validateDurations` — because `processVersion` is also the deserializer for
// stored immutable bodies. These assert both halves: the check bites at compile,
// and parse stays permissive so an already-published body still reads.
describe("timer duration", () => {
  // The review step's reminder timer, the only duration timer in the example.
  const loc = "steps[1].timers[0].duration";

  const bodyWith = (value: string): ProcessBody => {
    const bad = structuredClone(raw);
    bad.definition.workflow.steps[1].timers[0].duration = value;
    return bad.definition as ProcessBody;
  };
  const issuesFor = (value: string) => validateDurations(bodyWith(value));

  const expectRejected = (value: string, message: string) => {
    const issues = issuesFor(value);
    // Attributable: exactly one issue, on the offending duration.
    expect(issues).toEqual([{ loc, value, message }]);
    // And it stops the publish path, not merely reports.
    expect(() => compileProcessBody(bodyWith(value))).toThrow(DurationValidationError);
  };

  const UNSUPPORTED =
    "unsupported ISO 8601 duration (W/D/H/M/S only, no calendar units, at least one component)";
  const OUT_OF_RANGE = `timer duration exceeds the ${MAX_TIMER_DURATION_MS} ms bound (a fireAt past it leaves the four-digit-year range)`;

  // Calendar units are ambiguous without a date library and stay rejected.
  for (const value of ["P1Y", "P3M", "P1Y6M"]) {
    it(`rejects the calendar unit ${value}`, () => expectRejected(value, UNSUPPORTED));
  }

  for (const value of ["1 day", "7d", "", "  ", "PT1H "]) {
    it(`rejects the non-ISO value ${JSON.stringify(value)}`, () => expectRejected(value, UNSUPPORTED));
  }

  // Grammar-matching but componentless: they denote no span.
  for (const value of ["P", "PT"]) {
    it(`rejects the empty designator ${value}`, () => expectRejected(value, UNSUPPORTED));
  }

  // Every unit inside the time part is optional, so a bare trailing `T` matches
  // unless the parser forbids it. It is not ISO 8601 and denotes no time part.
  for (const value of ["P1DT", "P1WT"]) {
    it(`rejects the trailing bare T in ${value}`, () => expectRejected(value, UNSUPPORTED));
  }

  it("rejects a duration that overflows a fireAt from an ordinary entry", () => {
    // Both fit inside the 0001-9999 span, which is why bounding by that span was
    // not enough: each still overflows when added to a 2026 entry instant.
    for (const value of ["P3000000D", "P2912243D"]) expectRejected(value, OUT_OF_RANGE);
  });

  // The bound is derived from the entry-instant ceiling, not picked: the largest
  // whole day count inside it is accepted and the next one is not.
  const maxWholeDays = Math.floor(MAX_TIMER_DURATION_MS / 86_400_000);

  it("accepts the largest duration inside the bound", () => {
    expect(issuesFor(`P${maxWholeDays}D`)).toEqual([]);
  });

  it("rejects the first duration past the bound", () => {
    expectRejected(`PT${((MAX_TIMER_DURATION_MS + 1) / 1000).toFixed(3)}S`, OUT_OF_RANGE);
  });

  for (const value of ["P1W", "P1D", "PT1H", "PT30M", "PT1.5S", "P1DT2H30M"]) {
    it(`accepts ${value}`, () => {
      expect(issuesFor(value)).toEqual([]);
    });
  }

  // THE LAYERING ASSERTION. The check lives on the WRITE path only: `processVersion`
  // is also the deserializer for stored immutable bodies (`processBody.parse` on
  // every resolveBody cache miss), so a Zod refinement would make a definition
  // published before this check existed throw on READ — and its pinned instances
  // permanently unrehydratable, versions being immutable and migration not built.
  // In timers.ts the resolveBody call sits outside the per-instance try, so one
  // such body would starve every other due instance. Both halves belong in one
  // test: proving only the rejection would let the read-path regression back in.
  it("parses an invalid duration on the read path while rejecting it on the publish path", () => {
    // "" is absent from this set on purpose: it is falsy, so the pre-existing
    // duration-XOR-deadline refinement reads the timer as having neither and
    // fails parse for an unrelated reason. Its grammar rejection is above.
    for (const value of ["P1Y", "P1DT", "PT", "P9999999D", "garbage"]) {
      const stored = structuredClone(raw);
      stored.definition.workflow.steps[1].timers[0].duration = value;

      // READ: permissive, so an already-published body still rehydrates.
      expect(processVersion.safeParse(stored).success).toBe(true);

      // WRITE: rejected, and attributably so.
      expect(() => compileProcessBody(stored.definition as ProcessBody)).toThrow(
        DurationValidationError,
      );
      expect(validateDurations(stored.definition as ProcessBody)).toEqual([
        { loc, value, message: value === "P9999999D" ? OUT_OF_RANGE : UNSUPPORTED },
      ]);
    }
  });

  // The grammar covers every duration-typed field; the magnitude bound does not.
  // It is derived from the fireAt representation, and neither a baseDelay nor an
  // action timeout computes an instant.
  const withField = (path: (d: any) => void) => {
    const bad = structuredClone(raw);
    path(bad);
    return validateDurations(bad.definition as ProcessBody);
  };
  const setBaseDelay = (v: string) => (d: any) => {
    d.definition.workflow.steps[1].timers[0].onFire.actions[0].retry.baseDelay = v;
  };
  const setTimeout_ = (v: string) => (d: any) => {
    d.definition.workflow.steps[2].onEntry[0].timeout = v;
  };

  it("rejects a malformed retry baseDelay", () => {
    expect(withField(setBaseDelay("P1Y"))).toEqual([
      { loc: "steps[1].timers[0].onFire[0].retry.baseDelay", value: "P1Y", message: UNSUPPORTED },
    ]);
  });

  it("rejects a malformed action timeout", () => {
    expect(withField(setTimeout_("PT1H "))).toEqual([
      { loc: "steps[2].onEntry[0].timeout", value: "PT1H ", message: UNSUPPORTED },
    ]);
  });

  it("does not apply the magnitude bound to a baseDelay or a timeout", () => {
    const past = `P${maxWholeDays + 1}D`;
    expect(withField(setBaseDelay(past))).toEqual([]);
    expect(withField(setTimeout_(past))).toEqual([]);
  });

  // The example carries no onExit / onCancel / onPath actions, so those three
  // traversal lines were each individually deletable with the suite green. Grow
  // the blocks rather than asserting over the existing ones.
  const action = (id: string, timeout: string) => ({ id, type: "notify", config: {}, timeout });

  it("reaches a duration in an onExit action", () => {
    expect(
      withField((d: any) => {
        d.definition.workflow.steps[1].onExit = [action("action_x", "P1Y")];
      }),
    ).toEqual([{ loc: "steps[1].onExit[0].timeout", value: "P1Y", message: UNSUPPORTED }]);
  });

  it("reaches a duration in an onCancel action", () => {
    expect(
      withField((d: any) => {
        d.definition.workflow.steps[1].onCancel = [action("action_c", "P1M")];
      }),
    ).toEqual([{ loc: "steps[1].onCancel[0].timeout", value: "P1M", message: UNSUPPORTED }]);
  });

  it("reaches a duration in an onPath action", () => {
    expect(
      withField((d: any) => {
        d.definition.workflow.steps[1].paths[0].onPath = [action("action_p", "1 day")];
      }),
    ).toEqual([
      { loc: "steps[1].paths[0].onPath[0].timeout", value: "1 day", message: UNSUPPORTED },
    ]);
  });

  // compileProcessBody validates BEFORE its idempotent published-valid early
  // return. Moving the check below that return leaves every other test green
  // while re-publishing an already-compiled body — one already carrying the
  // injected cancel sink, e.g. round-tripped out of the definition store —
  // skips duration validation entirely.
  it("still validates a body that is already compiled", () => {
    const compiled = compileProcessBody(structuredClone(raw).definition as ProcessBody);
    // Precondition: this really is the published-valid shape the early return takes.
    expect(publishedProcessBody.safeParse(compiled).success).toBe(true);

    const republished = structuredClone(compiled) as any;
    republished.workflow.steps[1].timers[0].duration = "P1Y";
    expect(() => compileProcessBody(republished as ProcessBody)).toThrow(DurationValidationError);
  });
});

describe("migration schema additions", () => {
  const evtEnvelope = {
    id: "evt_11111111-1111-4a1c-8e2f-000000000001",
    instanceId: "inst_22222222-2222-4a1c-8e2f-000000000002",
    transitionSeq: 3,
    version: 1,
    at: "2026-07-20T00:00:00.000Z",
  };

  it("accepts both migration.skipped reasons", () => {
    for (const reason of ["step-unmappable", "pending-actions"]) {
      const ev = { ...evtEnvelope, kind: "migration.skipped", payload: { fromVersion: 1, toVersion: 2, reason } };
      expect(instanceEvent.safeParse(ev).success).toBe(true);
    }
  });

  it("rejects a malformed migration.skipped payload", () => {
    // Missing toVersion.
    expect(instanceEvent.safeParse({
      ...evtEnvelope, kind: "migration.skipped", payload: { fromVersion: 1, reason: "step-unmappable" },
    }).success).toBe(false);
    // Unknown reason (strict enum).
    expect(instanceEvent.safeParse({
      ...evtEnvelope, kind: "migration.skipped", payload: { fromVersion: 1, toVersion: 2, reason: "whatever" },
    }).success).toBe(false);
    // Extra key (strict payload).
    expect(instanceEvent.safeParse({
      ...evtEnvelope, kind: "migration.skipped", payload: { fromVersion: 1, toVersion: 2, reason: "pending-actions", extra: 1 },
    }).success).toBe(false);
  });

  it("rejects a non-injective fieldMap", () => {
    const a = "field_1a2b3c4d-0001-4a1c-8e2f-000000000001";
    const b = "field_1a2b3c4d-0002-4a1c-8e2f-000000000002";
    const t = "field_1a2b3c4d-0003-4a1c-8e2f-000000000003";
    expect(migrationSpec.safeParse({ fieldMap: { [a]: t, [b]: t } }).success).toBe(false);
    expect(migrationSpec.safeParse({ fieldMap: { [a]: t, [b]: a } }).success).toBe(true);
  });

  it("leaves the body hash unchanged when the wrapper carries no migration", () => {
    // migration lived on the unhashed wrapper; the hash covers only definition.
    const body = structuredClone(raw).definition as ProcessBody;
    const before = definitionHash(body);
    const withWrapperNoise = structuredClone(raw);
    delete (withWrapperNoise as any).migration;
    expect(definitionHash(withWrapperNoise.definition as ProcessBody)).toBe(before);
  });
});
