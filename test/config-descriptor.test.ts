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

test("staticAssignmentConfigSchema produces a descriptor", () => {
  const descriptor = describeConfigSchema(staticAssignmentConfigSchema, "static");
  expect(descriptor).toEqual([{ key: "candidates", kind: "string-array", required: true }]);
});

test("dbListDataSourceConfigSchema produces a descriptor with minLength/maxLength", () => {
  const descriptor = describeConfigSchema(dbListDataSourceConfigSchema, "db.list");
  expect(descriptor).toEqual([{ key: "listKey", kind: "string", required: true, minLength: 1, maxLength: 200 }]);
});

test("notificationEmailConfigSchema produces a descriptor with minItems and format", () => {
  const descriptor = describeConfigSchema(notificationEmailConfigSchema, "notification.email");
  expect(descriptor).toEqual([
    { key: "to", kind: "string-array", required: true, minItems: 1, format: "email" },
    { key: "subject", kind: "string", required: true },
    { key: "body", kind: "string", required: true },
  ]);
});

test("staticDataSourceConfigSchema produces no descriptor (nested object array element)", () => {
  expect(describeConfigSchema(staticDataSourceConfigSchema, "static")).toBeUndefined();
});

test("httpConfigSchema produces no descriptor (refine-wrapped, unknown body)", () => {
  expect(describeConfigSchema(httpConfigSchema, "http.request")).toBeUndefined();
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
