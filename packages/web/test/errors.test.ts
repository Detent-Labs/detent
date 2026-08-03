import { describe, expect, it } from "bun:test";
import { describeError } from "../src/areas/app/errors.js";
import { parseErrorBody } from "../src/api/client.js";
import { describeError as describeAdminError } from "../src/areas/admin/errors.js";

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

/**
 * A server error type reaches an operator through three sites that each carry
 * their own closed switch: `parseErrorBody`, the `ClientError` union, and the
 * area's `describeError`. Miss one and the text silently degrades to the
 * generic fallback — which is what happened to `self-role-strip` between the
 * union and the parser, caught in a browser rather than by a test.
 */
describe("a server error type maps through every layer", () => {
  const parse = async (status: number, type: string, message: string) =>
    parseErrorBody(new Response(JSON.stringify({ error: { type, message } }), { status }));

  it("carries self-role-strip through the parser rather than collapsing it to internal", async () => {
    const parsed = await parse(409, "self-role-strip", "an actor cannot remove system:admin from its own account");
    expect(parsed.type).toBe("self-role-strip");
  });

  it("gives self-role-strip its own operator-facing text, not the generic fallback", async () => {
    const parsed = await parse(409, "self-role-strip", "an actor cannot remove system:admin from its own account");
    const text = describeAdminError(parsed, 409);
    expect(text).toContain("your own account");
    expect(text).not.toBe("Something went wrong.");
    expect(text).not.toBe("The server hit an error. Try again.");
  });

  it("still collapses a type no layer knows into internal", async () => {
    const parsed = await parse(500, "type-from-the-future", "x");
    expect(parsed.type).toBe("internal");
    expect(describeAdminError(parsed, 500)).toBe("The server hit an error. Try again.");
  });
});
