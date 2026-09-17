import { describe, it, expect } from "bun:test";
import { moveTo } from "../src/areas/studio/draft/list-ops.js";

describe("list-ops", () => {
  describe("moveTo", () => {
    it("moves an item from index 0 to index 3", () => {
      const list = ["a", "b", "c", "d", "e"];
      const result = moveTo(list, 0, 3);
      expect(result).toEqual(["b", "c", "d", "a", "e"]);
    });

    it("moves an item from index 3 to index 0", () => {
      const list = ["a", "b", "c", "d", "e"];
      const result = moveTo(list, 3, 0);
      expect(result).toEqual(["d", "a", "b", "c", "e"]);
    });

    it("is a no-op when moving from index 0 to index 0", () => {
      const list = ["a", "b", "c", "d"];
      const result = moveTo(list, 0, 0);
      expect(result).toEqual(list);
    });

    it("is a no-op when moving from the last index to the last index", () => {
      const list = ["a", "b", "c", "d"];
      const result = moveTo(list, 3, 3);
      expect(result).toEqual(list);
    });

    it("clamps to when moving earlier than 0", () => {
      const list = ["a", "b", "c", "d"];
      const result = moveTo(list, 0, -5);
      expect(result).toEqual(list); // clamped to 0, which equals from, so no-op
    });

    it("clamps to when moving later than the last index", () => {
      const list = ["a", "b", "c", "d"];
      const result = moveTo(list, 3, 10);
      expect(result).toEqual(list); // clamped to 3, which equals from, so no-op
    });

    it("returns the original list when from is out of bounds", () => {
      const list = ["a", "b", "c", "d"];
      expect(moveTo(list, -1, 2)).toEqual(list);
      expect(moveTo(list, 4, 2)).toEqual(list);
    });

    it("preserves list type with objects", () => {
      const list = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const result = moveTo(list, 0, 2);
      expect(result).toEqual([{ id: 2 }, { id: 3 }, { id: 1 }]);
      // Verify it's a new array but same objects
      expect(result).not.toBe(list);
      expect(result[0]).toBe(list[1]);
    });
  });
});
