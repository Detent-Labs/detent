import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

/**
 * `panels/shared/btn.ts` joins the literal `.btn` classes and the compiled
 * classes into one `className`. A literal `className` written beside a spread
 * of `stylex.props(...)` breaks that join: whichever of the two the JSX writes
 * first loses, so the button drops either its `.btn` look or its compiled
 * style, with no type error and no failing render.
 *
 * A source test in the idiom `studio-no-confirm.test.ts` uses: it reads each
 * file, matches a pattern, and asserts nothing hits. The harness mounts no DOM,
 * so it cannot observe which class list survived.
 *
 * The pattern spans line breaks, since a tag can write the two attributes on
 * separate lines. It stops at the `>` closing the tag, and steps over the
 * `=>` of an arrow function between the two attributes. A template literal that
 * reads `stylex.props(...).className` is a join, holds no spread, and passes.
 */
const STUDIO = new URL("../src/areas/studio/", import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const modules = walk(STUDIO).filter((f) => f.endsWith(".tsx"));

/** Block comments first, then line comments, as `studio-no-confirm.test.ts`
 * strips them: a name in a comment is not an attribute. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const LITERAL_BTN = String.raw`className=\{?["'\x60][^"'\x60]*\bbtn\b`;
const SPREAD = String.raw`\{\.\.\.stylex\.props\(`;
const WITHIN_TAG = String.raw`(?:(?!(?<!=)>)[\s\S])*?`;
const LITERAL_BESIDE_PROPS = new RegExp(`${LITERAL_BTN}${WITHIN_TAG}${SPREAD}|${SPREAD}${WITHIN_TAG}${LITERAL_BTN}`);

describe("no studio file writes a literal .btn beside stylex.props", () => {
  it("finds modules to check, so an empty walk cannot pass", () => {
    expect(modules.length).toBeGreaterThan(20);
  });

  for (const file of modules) {
    it(`${file.slice(file.indexOf("areas/studio/"))} joins through btn.ts`, () => {
      const code = stripComments(readFileSync(file, "utf8"));
      expect(LITERAL_BESIDE_PROPS.exec(code)?.[0] ?? null).toBeNull();
    });
  }

  it("the pattern catches the literal on either side, on one line or across lines", () => {
    expect(LITERAL_BESIDE_PROPS.test(`<button className="btn btn-ghost" {...stylex.props(styles.back)}>`)).toBe(true);
    expect(LITERAL_BESIDE_PROPS.test(`<button {...stylex.props(styles.back)} className="btn btn-ghost">`)).toBe(true);
    expect(LITERAL_BESIDE_PROPS.test(`<button\n  type="button"\n  className="btn btn-ghost"\n  {...stylex.props(styles.back)}\n>`)).toBe(true);
    expect(LITERAL_BESIDE_PROPS.test(`<button className={"btn btn-ghost"} {...stylex.props(styles.back)}>`)).toBe(true);
    expect(LITERAL_BESIDE_PROPS.test(`<button className="btn" onClick={() => go()} {...stylex.props(styles.back)}>`)).toBe(true);
  });

  it("the pattern passes the join, and two separate tags", () => {
    expect(LITERAL_BESIDE_PROPS.test(`<button {...ghost(styles.back)}>`)).toBe(false);
    expect(LITERAL_BESIDE_PROPS.test('<button className={`btn btn-ghost ${stylex.props(styles.back).className ?? ""}`}>')).toBe(false);
    expect(LITERAL_BESIDE_PROPS.test(`<button className="btn" onClick={() => go()}>x</button><div {...stylex.props(styles.row)}>`)).toBe(false);
    expect(LITERAL_BESIDE_PROPS.test(`<div {...stylex.props(styles.row)}><button className="btn">`)).toBe(false);
  });
});
