/**
 * Converts a registry entry's `configSchema` into a browser-consumable
 * descriptor for a generated form, so the studio area never hand-maintains a
 * second description beside the Zod schema the publish-time registry checks
 * already parse against (see `registry-check.ts`). A leaf module importing
 * only `zod`, so `studio-routes.ts` can import it without a cycle.
 *
 * `describeConfigSchema` returns `undefined` for any construct outside the
 * supported subset: a `.refine()`/`.superRefine()`-wrapped object (Zod wraps
 * these as `ZodEffects`, never a `ZodObject`, so the top-level check alone
 * rejects them), a nested `ZodObject` property, `z.unknown()`, or any other
 * unsupported node. The caller then omits a schema description for that
 * type, and the studio area falls back to its raw JSON textarea — unchanged
 * from the behavior before this module existed.
 */

import { z } from "zod";
import { log } from "../log.js";

export type ConfigFieldKind = "string" | "number" | "boolean" | "enum" | "string-array";

export interface ConfigFieldDescriptor {
  key: string;
  kind: ConfigFieldKind;
  required: boolean;
  enumValues?: string[];
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  minItems?: number;
  maxItems?: number;
  format?: "email";
}

type LeafDescriptor = Omit<ConfigFieldDescriptor, "key" | "required" | "default">;

function describeString(schema: z.ZodString): LeafDescriptor | undefined {
  const descriptor: LeafDescriptor = { kind: "string" };
  for (const check of schema._def.checks) {
    if (check.kind === "min") descriptor.minLength = check.value;
    else if (check.kind === "max") descriptor.maxLength = check.value;
    else if (check.kind === "email") descriptor.format = "email";
    else return undefined;
  }
  return descriptor;
}

function describeNumber(schema: z.ZodNumber): LeafDescriptor | undefined {
  const descriptor: LeafDescriptor = { kind: "number" };
  for (const check of schema._def.checks) {
    if (check.kind === "min") descriptor.min = check.value;
    else if (check.kind === "max") descriptor.max = check.value;
    else return undefined;
  }
  return descriptor;
}

function describeStringArray(schema: z.ZodArray<z.ZodTypeAny>): LeafDescriptor | undefined {
  const element = schema.element;
  if (!(element instanceof z.ZodString)) return undefined;
  const elementDescriptor = describeString(element);
  if (!elementDescriptor) return undefined;
  const descriptor: LeafDescriptor = { kind: "string-array" };
  if (elementDescriptor.format) descriptor.format = elementDescriptor.format;
  if (schema._def.minLength) descriptor.minItems = schema._def.minLength.value;
  if (schema._def.maxLength) descriptor.maxItems = schema._def.maxLength.value;
  return descriptor;
}

function describeLeaf(schema: z.ZodTypeAny): LeafDescriptor | undefined {
  if (schema instanceof z.ZodString) return describeString(schema);
  if (schema instanceof z.ZodNumber) return describeNumber(schema);
  if (schema instanceof z.ZodBoolean) return { kind: "boolean" };
  if (schema instanceof z.ZodEnum) return { kind: "enum", enumValues: [...schema._def.values] };
  if (schema instanceof z.ZodArray) return describeStringArray(schema);
  return undefined;
}

/**
 * Converts `schema` into one descriptor per property, or `undefined` if any
 * property falls outside the supported subset. `typeName` names the
 * registry entry in the debug log emitted on that path — nothing else uses
 * it.
 */
export function describeConfigSchema(schema: z.ZodTypeAny, typeName: string): ConfigFieldDescriptor[] | undefined {
  if (!(schema instanceof z.ZodObject)) {
    log.debug("config schema has no generated-form descriptor", { type: typeName, reason: "not a ZodObject" });
    return undefined;
  }
  const shape = schema._def.shape();
  const descriptors: ConfigFieldDescriptor[] = [];
  for (const key of Object.keys(shape)) {
    let fieldSchema: z.ZodTypeAny = shape[key];
    let required = true;
    let defaultValue: unknown;
    if (fieldSchema instanceof z.ZodDefault) {
      required = false;
      defaultValue = fieldSchema._def.defaultValue();
      fieldSchema = fieldSchema.removeDefault();
    }
    if (fieldSchema instanceof z.ZodOptional) {
      required = false;
      fieldSchema = fieldSchema.unwrap();
    }
    const leaf = describeLeaf(fieldSchema);
    if (!leaf) {
      log.debug("config schema has no generated-form descriptor", {
        type: typeName,
        reason: `property '${key}' uses an unsupported construct`,
      });
      return undefined;
    }
    descriptors.push({
      key,
      required,
      ...(defaultValue !== undefined ? { default: defaultValue } : {}),
      ...leaf,
    });
  }
  return descriptors;
}
