import { describe, expect, it } from "bun:test";
import { accessControls } from "../src/areas/studio/panels/accessLogic.js";

/**
 * `studio-app`'s Access-surface requirement, its four named scenarios.
 * `AccessPanel.tsx` loads its lists through a `useEffect`, which a static
 * render never fires (this package ships no DOM test library —
 * `studio-draftProvider-chainingFetch.test.ts`'s own stated convention), so
 * this exercises the extracted, rendering-free gate directly.
 *
 * `accessControls` reads `getMyProcessAccess`'s response (the calling
 * actor's own group- and role-resolved standing), not the process's raw
 * `ProcessAccessLists` — a plain `.includes(actorId)` against the raw lists
 * would miss a group-listed actor.
 */
const PID = "proc_x";

function myAccess(overrides: { developer?: string[]; owner?: string[] }): { developer: string[]; owner: string[] } {
  return { developer: [], owner: [], ...overrides };
}

describe("accessControls", () => {
  it("a Developer manages the Developer and Owner lists", () => {
    const controls = accessControls(myAccess({ developer: [PID] }), PID, []);
    expect(controls.developerEditable).toBe(true);
    expect(controls.ownerEditable).toBe(true);
  });

  it("an Owner manages the Reader list, and neither Developer nor Owner controls", () => {
    const controls = accessControls(myAccess({ owner: [PID] }), PID, []);
    expect(controls).toEqual({ developerEditable: false, ownerEditable: false, readerEditable: true });
  });

  it("a Developer holding no Owner entry sees no Reader control", () => {
    const controls = accessControls(myAccess({ developer: [PID] }), PID, []);
    expect(controls.readerEditable).toBe(false);
  });

  it("an admin with neither entry reaches every control", () => {
    const controls = accessControls(myAccess({}), PID, ["system:admin"]);
    expect(controls).toEqual({ developerEditable: true, ownerEditable: true, readerEditable: true });
  });

  it("an actor matching neither set, and holding no admin role, gets no control at all", () => {
    const controls = accessControls(myAccess({ developer: ["proc_other"] }), PID, []);
    expect(controls).toEqual({ developerEditable: false, ownerEditable: false, readerEditable: false });
  });
});
