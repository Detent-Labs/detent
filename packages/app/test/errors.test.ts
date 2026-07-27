import { describe, expect, it } from "bun:test";
import { describeError } from "../src/errors.js";

describe("describeError", () => {
  it("maps already-claimed to refresh-and-remove", () => {
    expect(describeError({ type: "already-claimed", message: "x" }, "en").kind).toBe("refresh-and-remove");
  });

  it("maps not-a-candidate to explain", () => {
    expect(describeError({ type: "not-a-candidate", message: "x" }, "en").kind).toBe("explain");
  });

  it("maps not-claimant to prompt-claim", () => {
    expect(describeError({ type: "not-claimant", message: "x" }, "en").kind).toBe("prompt-claim");
  });

  it("maps not-claimed to claim-lost", () => {
    expect(describeError({ type: "not-claimed", message: "x" }, "en").kind).toBe("claim-lost");
  });

  it("maps a concurrency conflict to reload-moved-on", () => {
    expect(describeError({ type: "concurrency-conflict" }, "en").kind).toBe("reload-moved-on");
  });

  it("falls back to a localized generic message when the server sent none", () => {
    expect(describeError({ type: "internal", message: "" }, "de").message).toBe("Etwas ist schiefgelaufen.");
  });

  it("prefers the server's own message when present", () => {
    expect(describeError({ type: "guard-refused", message: "path no longer available" }, "en").message).toBe("path no longer available");
  });

  it("maps authorization to explain with a friendly message, not the server's technical one", () => {
    const described = describeError({ type: "authorization", message: "actor 'user_1' may not cancel instance 'inst_x'" }, "en");
    expect(described.kind).toBe("explain");
    expect(described.message).toBe("You're not allowed to do that.");
  });
});
