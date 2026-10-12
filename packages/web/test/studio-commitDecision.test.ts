import { describe, expect, it } from "bun:test";
import { commitDecision } from "../src/areas/studio/panels/shared/conditionLogic.js";

/**
 * The write rule both condition inputs share. An unfinished row never reaches
 * the draft. Only the removal of a row can remove a stored source.
 */
describe("commitDecision", () => {
  const cases: {
    name: string;
    written: string | undefined;
    oldCount: number;
    newCount: number;
    stored: string | undefined;
    expected: "write" | "clear" | "hold";
  }[] = [
    {
      name: "an unfinished edit of the only row holds, and the stored source stands",
      written: undefined,
      oldCount: 1,
      newCount: 1,
      stored: "data.amount > 1000.0",
      expected: "hold",
    },
    {
      name: "an added row without a value holds when nothing is stored",
      written: undefined,
      oldCount: 0,
      newCount: 1,
      stored: undefined,
      expected: "hold",
    },
    {
      name: "an added row without a value holds when a source is stored",
      written: undefined,
      oldCount: 0,
      newCount: 1,
      stored: "data.amount > 1000.0",
      expected: "hold",
    },
    {
      name: "removing the last row clears a stored source",
      written: undefined,
      oldCount: 1,
      newCount: 0,
      stored: "data.amount > 1000.0",
      expected: "clear",
    },
    {
      name: "removing a row from an empty site holds",
      written: undefined,
      oldCount: 1,
      newCount: 0,
      stored: undefined,
      expected: "hold",
    },
    {
      name: "removing a row that leaves only incomplete rows clears a stored source",
      written: undefined,
      oldCount: 2,
      newCount: 1,
      stored: "data.amount > 1000.0",
      expected: "clear",
    },
    {
      name: "a complete row writes",
      written: "data.amount > 1000.0",
      oldCount: 1,
      newCount: 1,
      stored: undefined,
      expected: "write",
    },
    {
      name: "a complete row writes over a stored source",
      written: "data.amount > 2000.0",
      oldCount: 1,
      newCount: 1,
      stored: "data.amount > 1000.0",
      expected: "write",
    },
    {
      name: "removing a row writes when another complete row remains",
      written: "data.amount > 1000.0",
      oldCount: 2,
      newCount: 1,
      stored: "data.amount > 1000.0 && data.region == \"EU\"",
      expected: "write",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(commitDecision(c.written, c.oldCount, c.newCount, c.stored)).toBe(c.expected);
    });
  }
});
