/**
 * describeConfigSchema against the five configSchema values the studio-plugin-
 * config-form design names. Pure — no DB — mirrors registry-check.test.ts's style.
 */
import { test, expect } from "bun:test";
import { z } from "zod";
import { describeConfigSchema } from "../src/engine/config-descriptor.js";
import { staticAssignmentConfigSchema } from "../src/engine/registry.js";
import { staticDataSourceConfigSchema, dbListDataSourceConfigSchema } from "../src/engine/host.js";
import { notificationEmailConfigSchema } from "../src/handlers/notification-email.js";
import { httpConfigSchema } from "../src/handlers/http.js";
import { processStartConfigSchema } from "../src/handlers/process-start.js";

test("staticAssignmentConfigSchema produces a descriptor", () => {
  const descriptor = describeConfigSchema(staticAssignmentConfigSchema, "static");
  expect(descriptor).toEqual([{ key: "candidates", kind: "string-array", required: true }]);
});

test("dbListDataSourceConfigSchema produces a descriptor with minLength/maxLength", () => {
  const descriptor = describeConfigSchema(dbListDataSourceConfigSchema, "db.list");
  expect(descriptor).toEqual([{ key: "listKey", kind: "string", required: true, minLength: 1, maxLength: 200 }]);
});

// `to` lost its `.min(1)` when `toActors` arrived: an action may name its
// recipients by role alone, and the both-empty rule moved to an object-level
// refinement the generated form does not render. So `to` is no longer
// `required` and carries no `minItems`.
test("notificationEmailConfigSchema produces a descriptor with format and a value set", () => {
  const descriptor = describeConfigSchema(notificationEmailConfigSchema, "notification.email");
  expect(descriptor).toEqual([
    { key: "to", kind: "string-array", required: false, default: [], format: "email" },
    { key: "toActors", kind: "string-array", required: false, default: [], enumValues: ["candidate", "claimant", "starter"] },
    { key: "subject", kind: "string", required: true },
    { key: "body", kind: "string", required: true },
  ]);
});

// The regression this branch exists to prevent: without it the enum element
// leaves the supported subset and drops the descriptor for the WHOLE type, so
// `subject` and `body` fall back to the raw JSON textarea with it.
test("an array over an enum keeps its own type's descriptor", () => {
  const schema = z.object({ picks: z.array(z.enum(["a", "b"])), label: z.string() });
  expect(describeConfigSchema(schema, "test.enumArray")).toEqual([
    { key: "picks", kind: "string-array", required: true, enumValues: ["a", "b"] },
    { key: "label", kind: "string", required: true },
  ]);
});

test("staticDataSourceConfigSchema produces no descriptor (nested object array element)", () => {
  expect(describeConfigSchema(staticDataSourceConfigSchema, "static")).toBeUndefined();
});

// migrate-to-zod-v4: this used to hold for two reasons at once. Zod v3 wrapped
// a refined object as a ZodEffects, which the top-level check rejected before
// it read a single property. Zod v4 declares `refine` as returning `this`, so
// the refinements no longer stop it and the walk reaches the properties. It
// still produces no descriptor, now for the property reasons alone: `body` is
// `z.unknown()`, `headers` is a record, and `url` carries a non-email format.
test("httpConfigSchema produces no descriptor (unknown body, record, non-email format)", () => {
  expect(describeConfigSchema(httpConfigSchema, "http.request")).toBeUndefined();
});

// inputMapping is a record, the same shape that already sends httpConfigSchema
// to the fallback above. This is the fallback studio-plugin-config-form relies
// on: process.start needs no generator delta, the raw JSON editor already
// covers it.
test("processStartConfigSchema produces no descriptor (record-valued inputMapping)", () => {
  expect(describeConfigSchema(processStartConfigSchema, "process.start")).toBeUndefined();
});

test("a refined schema whose properties are all supported now produces a descriptor", () => {
  // The widening this change accepts. Under v3 the two refinements alone sent
  // this to the studio's raw JSON textarea, however ordinary its properties.
  const schema = z
    .object({
      min: z.number().min(0),
      max: z.number().min(0),
      label: z.string().min(1).max(40),
    })
    .refine((c) => c.min <= c.max, { message: "min must not exceed max", path: ["min"] });
  expect(describeConfigSchema(schema, "test.refined")).toEqual([
    { key: "min", kind: "number", required: true, min: 0 },
    { key: "max", kind: "number", required: true, min: 0 },
    { key: "label", kind: "string", required: true, minLength: 1, maxLength: 40 },
  ]);
});

test("a refined schema still reports its per-field rules, which the form renders inline", () => {
  // The delta spec's second scenario: the cross-field rule is invisible to the
  // form, but every per-field bound still reaches the descriptor.
  const schema = z
    .object({ from: z.string().min(3), to: z.string().min(3) })
    .superRefine((c, ctx) => {
      if (c.from === c.to) ctx.addIssue({ code: "custom", message: "from and to must differ" });
    });
  const descriptor = describeConfigSchema(schema, "test.refined-perfield");
  expect(descriptor).toEqual([
    { key: "from", kind: "string", required: true, minLength: 3 },
    { key: "to", kind: "string", required: true, minLength: 3 },
  ]);
});

test("a refined schema with an unsupported property still produces no descriptor", () => {
  // The refine no longer decides the outcome, so an unsupported property must
  // still be the thing that does. Otherwise the widening would have quietly
  // pulled unrenderable schemas into the generated form.
  const schema = z
    .object({ name: z.string(), payload: z.unknown() })
    .refine(() => true, { message: "always true" });
  expect(describeConfigSchema(schema, "test.refined-unsupported")).toBeUndefined();
});

test("a string format other than email leaves the supported subset", () => {
  expect(describeConfigSchema(z.object({ site: z.string().url() }), "test.url")).toBeUndefined();
  expect(describeConfigSchema(z.object({ site: z.url() }), "test.url-top")).toBeUndefined();
});

test("email format resolves whether it is authored as a check or as a node", () => {
  // v4 admits both spellings. `z.string().email()` appends a string_format
  // check; `z.email()` carries the format on the node and appends no check.
  // A reader that knew only the first would silently drop the format.
  expect(describeConfigSchema(z.object({ to: z.string().email() }), "test.mail-check")).toEqual([
    { key: "to", kind: "string", required: true, format: "email" },
  ]);
  expect(describeConfigSchema(z.object({ to: z.email() }), "test.mail-node")).toEqual([
    { key: "to", kind: "string", required: true, format: "email" },
  ]);
});

test("a synthetic schema exercises enum, number, boolean, optional and default", () => {
  const schema = z.object({
    priority: z.enum(["low", "high"]),
    weight: z.number().min(0).max(10),
    urgent: z.boolean(),
    note: z.string().optional(),
    tries: z.number().default(3),
  });
  const descriptor = describeConfigSchema(schema, "test.synthetic");
  expect(descriptor).toEqual([
    { key: "priority", kind: "enum", required: true, enumValues: ["low", "high"] },
    { key: "weight", kind: "number", required: true, min: 0, max: 10 },
    { key: "urgent", kind: "boolean", required: true },
    { key: "note", kind: "string", required: false },
    { key: "tries", kind: "number", required: false, default: 3 },
  ]);
});

test("a non-object schema produces no descriptor", () => {
  expect(describeConfigSchema(z.string(), "test.notobject")).toBeUndefined();
});
