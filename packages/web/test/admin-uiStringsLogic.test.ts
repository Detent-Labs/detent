/**
 * `areas/admin/screens/uiStringsLogic.ts`: the row list the UI-strings screen
 * renders and the writes a save sends.
 *
 * The distinction under test throughout is absence versus emptiness. A cleared
 * input sends `null`, which deletes the row, never `""` — the route refuses an
 * empty string, and a stored one would resolve ahead of the builtin value and
 * render a blank label.
 */
import { describe, expect, it } from "bun:test";
import { localesOf, rowsFor, pendingWrite, pendingWrites, OVERRIDABLE_AREAS } from "../src/areas/admin/screens/uiStringsLogic.js";
import type { OverrideRow } from "../src/areas/admin/screens/uiStringsLogic.js";

describe("localesOf", () => {
  it("offers only the locales an area actually ships", () => {
    expect(localesOf("shell")).toEqual(["de", "en"]);
    expect(localesOf("app")).toEqual(["de", "en"]);
    expect(localesOf("admin")).toEqual(["de", "en"]);
    expect(localesOf("reporting")).toEqual(["de", "en"]);
    // Studio is fixed `en` by the existing collapse-editor-i18n decision.
    expect(localesOf("studio")).toEqual(["en"]);
  });

  it("answers an empty list for an area with no catalog rather than throwing", () => {
    expect(localesOf("nonsense")).toEqual([]);
  });

  it("names a shipped catalog for every area the picker offers", () => {
    for (const area of OVERRIDABLE_AREAS) expect(localesOf(area).length, area).toBeGreaterThan(0);
  });
});

describe("rowsFor", () => {
  it("lists every builtin key in sorted order, with its builtin value", () => {
    const rows = rowsFor("shell", "en", {});
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.key)).toEqual([...rows.map((r) => r.key)].sort());
    expect(rows.find((r) => r.key === "login.title")).toEqual({ key: "login.title", builtin: "Log in", stored: "" });
  });

  it("seeds a row's stored value from an existing override", () => {
    const rows = rowsFor("shell", "en", { shell: { en: { "login.title": "Sign in" } } });
    expect(rows.find((r) => r.key === "login.title")).toEqual({ key: "login.title", builtin: "Log in", stored: "Sign in" });
    expect(rows.find((r) => r.key === "login.email")?.stored).toBe("");
  });

  it("ignores an override stored for another area or another locale", () => {
    const overrides = { app: { en: { "login.title": "Elsewhere" } }, shell: { de: { "login.title": "Anmeldung" } } };
    expect(rowsFor("shell", "en", overrides).find((r) => r.key === "login.title")?.stored).toBe("");
  });

  it("carries no row for a key the deployment overrode but the catalog no longer declares", () => {
    // The row list comes from the catalog, so a stale override cannot invent a row.
    const rows = rowsFor("shell", "en", { shell: { en: { "removed.key": "Ghost" } } });
    expect(rows.some((r) => r.key === "removed.key")).toBe(false);
  });

  it("answers an empty list for a locale the area does not ship", () => {
    expect(rowsFor("studio", "de", {})).toEqual([]);
  });
});

describe("pendingWrite", () => {
  const row = (stored: string): OverrideRow => ({ key: "login.title", builtin: "Log in", stored });

  it("sends nothing when the draft equals what is stored", () => {
    expect(pendingWrite(row("Sign in"), "Sign in")).toBeUndefined();
    expect(pendingWrite(row(""), "")).toBeUndefined();
  });

  it("sends the trimmed value when the draft differs", () => {
    expect(pendingWrite(row(""), "  Sign in  ")).toEqual({ value: "Sign in" });
    expect(pendingWrite(row("Sign in"), "Enter")).toEqual({ value: "Enter" });
  });

  it("sends null, never an empty string, when an input holding an override is cleared", () => {
    expect(pendingWrite(row("Sign in"), "")).toEqual({ value: null });
    // Whitespace alone is a clear too, not a value of three spaces.
    expect(pendingWrite(row("Sign in"), "   ")).toEqual({ value: null });
  });

  it("sends nothing when an input that never had an override is cleared", () => {
    // There is no row to delete, and the request would cost a round trip to learn that.
    expect(pendingWrite(row(""), "   ")).toBeUndefined();
  });
});

describe("pendingWrites", () => {
  const rows: OverrideRow[] = [
    { key: "login.title", builtin: "Log in", stored: "Sign in" },
    { key: "login.email", builtin: "Email", stored: "" },
    { key: "login.password", builtin: "Password", stored: "Secret" },
  ];

  it("is empty when no input was touched, which is what disables the save action", () => {
    expect(pendingWrites(rows, {})).toEqual([]);
  });

  it("collects one entry per changed row, in catalog order", () => {
    const writes = pendingWrites(rows, { "login.password": "", "login.email": "E-mail" });
    expect(writes).toEqual([
      { key: "login.email", value: "E-mail" },
      { key: "login.password", value: null },
    ]);
  });

  it("skips a row whose draft was typed back to its stored value", () => {
    expect(pendingWrites(rows, { "login.title": "Sign in" })).toEqual([]);
  });
});
