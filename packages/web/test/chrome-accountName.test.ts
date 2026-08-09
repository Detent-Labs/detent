import { describe, expect, it } from "bun:test";
import { accountName } from "../src/shell/accountName.js";

describe("accountName", () => {
  it("takes the body face when the session carries a displayName", () => {
    expect(accountName({ displayName: "Ada Lovelace", actorId: "user_1" })).toEqual({
      text: "Ada Lovelace",
      mono: false,
    });
  });

  it("falls back to actorId, mono face, for a federated actor with no displayName", () => {
    expect(accountName({ displayName: undefined, actorId: "user_2" })).toEqual({
      text: "user_2",
      mono: true,
    });
  });

  it("falls back to actorId, mono face, in the pre-hydration window", () => {
    // Same shape as the federated case from `accountName`'s side: `displayName`
    // is simply absent until `GET /account/me` resolves.
    expect(accountName({ actorId: "user_3" })).toEqual({ text: "user_3", mono: true });
  });
});
