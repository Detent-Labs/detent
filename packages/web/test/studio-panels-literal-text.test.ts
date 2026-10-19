import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseSync } from "vite";
import { en } from "../src/i18n/catalogs/studio.js";

/**
 * `ui-string-overrides`: a studio panel renders no author-facing literal. The
 * scan parses every `.tsx` under `areas/studio/panels/` and fails on three
 * node shapes (`catalog-studio-literal-strings`, design.md D3):
 *
 * - a JSX text node that holds a letter;
 * - a string or template literal that holds a letter, as a JSX child or as
 *   either branch of a conditional or logical child;
 * - a string literal as the value of a caption attribute.
 *
 * Three exemptions keep legal values out of the report: an `<option>` whose
 * text equals its own `value`, a string literal equal to a studio catalog key,
 * and the named machine words in `MACHINE_WORDS`.
 */

const PANELS = join(import.meta.dir, "../src/areas/studio/panels");

const CAPTION_ATTRIBUTES = new Set(["label", "legend", "placeholder", "title", "aria-label", "addLabel", "removeLabel", "hint"]);

/** `CEL` names a language. `v` is the prefix before a mono version number. */
const MACHINE_WORDS = new Set(["CEL", "v"]);

const HAS_LETTER = /\p{L}/u;

/** An HTML entity such as `&gt;` prints punctuation, so its name is no text. */
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/giu;

// oxc's ESTree output is plain objects; the walk reads it structurally.
type Node = { type: string; start: number; [key: string]: any };

interface Finding {
  where: string;
  kind: string;
  text: string;
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

function exempt(text: string): boolean {
  // The letters alone decide a machine word, so ", v" in a template reads as "v".
  return MACHINE_WORDS.has(text.replace(/[^\p{L}]/gu, "")) || Object.hasOwn(en, text);
}

/** The letter-bearing literal strings an expression can print. Looks through both branches of a conditional or logical expression. */
function literalsIn(expr: unknown): string[] {
  if (!isNode(expr)) return [];
  switch (expr.type) {
    case "Literal":
      return typeof expr.value === "string" ? [expr.value] : [];
    case "TemplateLiteral":
      // Each quasi alone, so the machine word `v` between two expressions is judged on its own.
      return expr.quasis.map((q: Node) => q.value.cooked ?? q.value.raw);
    case "ConditionalExpression":
      return [...literalsIn(expr.consequent), ...literalsIn(expr.alternate)];
    case "LogicalExpression":
      return [...literalsIn(expr.left), ...literalsIn(expr.right)];
    case "ParenthesizedExpression":
      return literalsIn(expr.expression);
    default:
      return [];
  }
}

function attributeName(attribute: Node): string | undefined {
  const name = attribute.name;
  if (name?.type === "JSXIdentifier") return name.name;
  return undefined;
}

function attributeLiteral(element: Node, wanted: string): string | undefined {
  for (const attribute of element.openingElement.attributes) {
    if (attribute.type !== "JSXAttribute" || attributeName(attribute) !== wanted) continue;
    const value = attribute.value;
    if (value?.type === "Literal" && typeof value.value === "string") return value.value;
  }
  return undefined;
}

/** Every literal-text finding in one TSX source. */
export function findLiterals(source: string, file = "inline.tsx"): Finding[] {
  const parsed = parseSync(file, source, { lang: "tsx" });
  const findings: Finding[] = [];
  const lineOf = (offset: number) => source.slice(0, offset).split("\n").length;
  const report = (kind: string, node: Node, text: string) => {
    if (!HAS_LETTER.test(text.replace(ENTITY, "")) || exempt(text)) return;
    findings.push({ where: `${file}:${lineOf(node.start)}`, kind, text: text.trim() });
  };

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!isNode(node)) return;

    if (node.type === "JSXElement" || node.type === "JSXFragment") {
      const isOption = node.type === "JSXElement" && node.openingElement.name?.name === "option";
      const optionValue = isOption ? attributeLiteral(node, "value") : undefined;
      for (const child of node.children) {
        if (child.type === "JSXText") {
          if (isOption && optionValue !== undefined && child.value.trim() === optionValue) continue;
          report("jsx-text", child, child.value);
        } else if (child.type === "JSXExpressionContainer") {
          for (const text of literalsIn(child.expression)) report("jsx-child-literal", child, text);
        }
      }
    }

    if (node.type === "JSXAttribute") {
      const name = attributeName(node);
      if (name !== undefined && CAPTION_ATTRIBUTES.has(name)) {
        const value = node.value;
        const direct = value?.type === "Literal" ? literalsIn(value) : [];
        const wrapped = value?.type === "JSXExpressionContainer" ? literalsIn(value.expression) : [];
        for (const text of [...direct, ...wrapped]) report(`attribute-${name}`, node, text);
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      visit(node[key]);
    }
  };

  visit(parsed.program);
  return findings;
}

function panelFiles(): string[] {
  return (readdirSync(PANELS, { recursive: true }) as string[]).filter((f) => f.endsWith(".tsx")).sort();
}

describe("the literal-text scan itself", () => {
  it("fails a planted JSX text node", () => {
    expect(findLiterals("export const X = () => <p>Hello there</p>;").map((f) => f.text)).toEqual(["Hello there"]);
  });

  it("fails a planted caption attribute", () => {
    expect(findLiterals('export const X = () => <Foo legend="onEntry" />;').map((f) => f.kind)).toEqual(["attribute-legend"]);
  });

  it("fails a planted literal in either branch of a conditional child", () => {
    const found = findLiterals("export const X = (a: boolean) => <p>{a ? t('x') : 'Fallback'}</p>;");
    expect(found.map((f) => f.text)).toEqual(["Fallback"]);
  });

  it("fails a planted template literal and a logical branch", () => {
    const found = findLiterals("export const X = (a: string) => <p>{`${a} missing`}{a && 'extra'}</p>;");
    expect(found.map((f) => f.text)).toEqual(["missing", "extra"]);
  });

  it("passes an option whose text equals its own value", () => {
    expect(findLiterals('export const X = () => <option value="manual">manual</option>;')).toEqual([]);
  });

  it("fails an option whose text differs from its value", () => {
    expect(findLiterals('export const X = () => <option value="manual">By hand</option>;').map((f) => f.text)).toEqual(["By hand"]);
  });

  it("passes a string equal to a catalog key and the named machine words", () => {
    const key = Object.keys(en)[0];
    expect(findLiterals(`export const X = () => <Foo legend="${key}"><span>CEL</span><span>v</span></Foo>;`)).toEqual([]);
  });

  it("passes punctuation, entities, expressions and a version prefix in a template", () => {
    expect(findLiterals("export const X = (a: string) => <p>({a}) — {a} -&gt; {`${a} v${a}, v${a}`}</p>;")).toEqual([]);
  });
});

describe("studio panels", () => {
  it("finds the panel files", () => {
    expect(panelFiles().length).toBeGreaterThan(20);
  });

  it("render no literal author-facing text", () => {
    const findings: string[] = [];
    for (const file of panelFiles()) {
      const path = join(PANELS, file);
      const rel = relative(join(PANELS, ".."), path).replaceAll("\\", "/");
      for (const f of findLiterals(readFileSync(path, "utf8"), rel)) findings.push(`${f.where} [${f.kind}] ${JSON.stringify(f.text)}`);
    }
    expect(findings).toEqual([]);
  });
});
