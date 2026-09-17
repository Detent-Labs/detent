import { describe, expect, it } from "bun:test";
import { accessControls } from "../src/areas/studio/panels/accessLogic.js";
import type { ProcessAccessLists } from "../src/areas/studio/api/types.js";

/**
 * `studio-app`'s Access-surface requirement, its four named scenarios.
 * `AccessPanel.tsx` loads its lists through a `useEffect`, which a static
 * render never fires (this package ships no DOM test library —
 * `studio-draftProvider-chainingFetch.test.ts`'s own stated convention), so
 * this exercises the extracted, rendering-free gate directly.
 */
function lists(overrides: Partial<ProcessAccessLists>): ProcessAccessLists {
  return { developer: [], owner: [], reader: [], ...overrides };
}

describe("accessControls", () => {
  it("a Developer manages the Developer and Owner lists", () => {
    const controls = accessControls(lists({ developer: ["user_dev"] }), "user_dev", []);
    expect(controls.developerEditable).toBe(true);
    expect(controls.ownerEditable).toBe(true);
  });

  it("an Owner manages the Reader list", () => {
    const controls = accessControls(lists({ owner: ["user_owner"] }), "user_owner", []);
    expect(controls.readerEditable).toBe(true);
  });

  it("a Developer holding no Owner entry sees no Reader control", () => {
    const controls = accessControls(lists({ developer: ["user_dev"] }), "user_dev", []);
    expect(controls.readerEditable).toBe(false);
  });

  it("an admin with neither entry reaches every control", () => {
    const controls = accessControls(lists({}), "user_admin", ["system:admin"]);
    expect(controls).toEqual({ developerEditable: true, ownerEditable: true, readerEditable: true });
  });

  it("an actor listed on neither list, and holding no admin role, gets no control at all", () => {
    const controls = accessControls(lists({ developer: ["user_other"] }), "user_stranger", []);
    expect(controls).toEqual({ developerEditable: false, ownerEditable: false, readerEditable: false });
  });
});
