import { describe, expect, it } from "bun:test";
import { checkConnection, refusalSentence } from "../src/areas/studio/canvas/connection.js";
import { checkSentence, literalSentenceFor } from "../src/areas/studio/draft/checkSentence.js";
import type { DraftStep } from "../src/areas/studio/draft/createStep.js";
import type { Draft } from "../src/areas/studio/draft/types.js";
import { t } from "../src/areas/studio/catalog.js";

describe("canvas connection validity", () => {
  it("accepts a manual candidate when the step has no paths yet", () => {
    expect(checkConnection([], "manual")).toEqual({ ok: true });
  });

  it("accepts a manual candidate alongside existing manual paths", () => {
    expect(checkConnection([{ trigger: "manual" }], "manual")).toEqual({ ok: true });
  });

  it("rejects a manual candidate on a step whose existing paths are automatic", () => {
    const result = checkConnection([{ trigger: "automatic" }], "manual");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("a step's paths must be all-manual or all-automatic, not mixed");
  });

  it("rejects an automatic candidate on a step whose existing paths are manual", () => {
    const result = checkConnection([{ trigger: "manual" }], "automatic");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("a step's paths must be all-manual or all-automatic, not mixed");
  });

  it("accepts the first automatic candidate on a step with no paths yet", () => {
    expect(checkConnection([], "automatic")).toEqual({ ok: true });
  });

  it("rejects a second automatic candidate that would lack a priority", () => {
    // checkConnection only carries a trigger for the candidate (no guard/priority
    // yet — those are set afterwards in PathsPanel), so a second automatic path
    // is correctly rejected here the same way the engine rejects it at publish.
    const result = checkConnection([{ trigger: "automatic", priority: 1 }], "automatic");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("automatic paths need a priority when a step has two or more");
  });
});

describe("refusalSentence", () => {
  const ENGINE_TEXTS = [
    "a step's paths must be all-manual or all-automatic, not mixed",
    "automatic paths need a priority when a step has two or more",
    "automatic path priorities must be unique",
    "at most one default (guardless) automatic path per step",
    "the default (guardless) automatic path must have the highest priority",
    "a terminal step has no outgoing paths",
  ];

  const draft = (steps: DraftStep[]): Draft => ({ baseLocale: "en", workflow: { initialStep: steps[0]!.id, steps } });
  const step = (id: string, label: string | undefined, extra: Partial<DraftStep> = {}): DraftStep =>
    ({ id: id as never, key: id, type: "task", label: label === undefined ? {} : { en: label }, ...extra }) as DraftStep;

  /** The checks rail's own sentence for `message` on the step at `index`. */
  const railSentence = (body: Draft, index: number, message: string): string =>
    checkSentence(body, { loc: `workflow.steps[${index}]`, message, entityType: "step", entityId: body.workflow!.steps![index]!.id as string });

  it("reads the connect handle's sentence for an end", () => {
    const end = step("step_done", "Done", { terminal: true });
    expect(refusalSentence({ refusal: "end" }, draft([end]), end)).toBe("An end has no way out.");
    expect(refusalSentence({ refusal: "end" }, draft([end]), end)).toBe(t("canvas.connectHandleEnd"));
  });

  it("reads the canvas's own sentence for a missing order, naming Ways out", () => {
    const call = step("step_credit", "Check credit", {
      type: "subprocess",
      paths: [{ id: "path_a" as never, to: "step_credit" as never, trigger: "automatic", priority: 1, label: "On", key: "on" }],
    });
    const body = draft([call]);
    const reason = "automatic paths need a priority when a step has two or more";
    expect(refusalSentence({ refusal: "trigger", reason }, body, call)).toBe(
      "“Check credit” already has a way out that happens by itself. Add the next one under Ways out, and give it a number.",
    );
    expect(t("canvas.connectNeedsOrder")).toContain("{section}");
  });

  for (const reason of [
    "a step's paths must be all-manual or all-automatic, not mixed",
    "automatic path priorities must be unique",
    "at most one default (guardless) automatic path per step",
    "the default (guardless) automatic path must have the highest priority",
  ]) {
    it(`reads the checks rail's sentence for "${reason}"`, () => {
      const review = step("step_review", "Review", { paths: [{ id: "path_a" as never, to: "step_review" as never, trigger: "manual", label: "A", key: "a" }] });
      const body = draft([step("step_start", "Start"), review]);
      const sentence = refusalSentence({ refusal: "trigger", reason }, body, review);
      expect(sentence).toBe(railSentence(body, 1, reason));
      expect(sentence).toContain("“Review”");
      expect(sentence).toContain("Ways out");
    });
  }

  it("reads an unnamed step by its number, as the checks rail does", () => {
    const unnamed = step("step_two", undefined, { paths: [{ id: "path_a" as never, to: "step_two" as never, trigger: "manual", label: "A", key: "a" }] });
    const body = draft([step("step_one", "One"), unnamed]);
    const reason = "a step's paths must be all-manual or all-automatic, not mixed";
    const sentence = refusalSentence({ refusal: "trigger", reason }, body, unnamed);
    expect(sentence).toContain("“Step 2”");
    expect(sentence).toBe(railSentence(body, 1, reason));
  });

  it("reads the general sentence for a reason no rule matches", () => {
    const review = step("step_review", "Review");
    expect(refusalSentence({ refusal: "trigger", reason: "something the checks rail never heard of" }, draft([review]), review)).toBe(
      t("canvas.connectRefused"),
    );
    expect(t("canvas.connectRefused")).toBe("This step cannot take another way out here.");
  });

  it("never prints the engine's own text", () => {
    const review = step("step_review", "Review", { paths: [{ id: "path_a" as never, to: "step_review" as never, trigger: "automatic", priority: 1, label: "A", key: "a" }] });
    const body = draft([review]);
    const sentences = [
      refusalSentence({ refusal: "end" }, body, review),
      ...ENGINE_TEXTS.map((reason) => refusalSentence({ refusal: "trigger", reason }, body, review)),
    ];
    for (const sentence of sentences) for (const text of ENGINE_TEXTS) expect(sentence).not.toContain(text);
  });
});

describe("literalSentenceFor", () => {
  const review = { id: "step_review" as never, key: "review", type: "task", label: { en: "Review" } } as DraftStep;
  const body: Draft = { baseLocale: "en", workflow: { initialStep: "step_review" as never, steps: [review] } };

  it("returns undefined when no literal rule matches", () => {
    expect(literalSentenceFor(body, review, "no rule reads this")).toBeUndefined();
  });

  it("lets a given key replace the rule's own template", () => {
    const reason = "automatic paths need a priority when a step has two or more";
    expect(literalSentenceFor(body, review, reason)).toBe(t("checks.paths.noOrder").replace("{step}", "Review").replace("{section}", "Ways out"));
    expect(literalSentenceFor(body, review, reason, "canvas.connectNeedsOrder")).toBe(
      t("canvas.connectNeedsOrder").replace("{step}", "Review").replace("{section}", "Ways out"),
    );
  });
});
