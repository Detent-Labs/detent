/**
 * Converts a registry entry's `configSchema` into a browser-consumable
 * descriptor for a generated form, so the studio area never hand-maintains a
 * second description beside the Zod schema the publish-time registry checks
 * already parse against (see `registry-check.ts`). A leaf module importing
 * only `zod`, so `studio-routes.ts` can import it without a cycle.
 *
 * `describeConfigSchema` returns `undefined` for any construct outside the
 * supported subset: a nested `ZodObject` property, `z.unknown()`, a string
 * format other than email, a pattern-constrained string, an exclusive
 * numeric bound, a `multipleOf`-constrained number, a non-string array
 * element, or any other unsupported node. The caller then omits a schema
 * description for that type, and the studio area falls back to its raw JSON
 * textarea — unchanged from the behavior before this module existed.
 *
 * Classification reads `z.toJSONSchema(schema)`'s draft 2020-12 output
 * rather than Zod's internal `_zod.def` representation. That normalizes
 * refinements, defaults, optionals, and every string-format spelling into
 * standard JSON Schema keywords before this module ever inspects a node, so
 * a `.refine()`/`.superRefine()`-wrapped object reaches the per-property walk
 * below on the same footing as an unrefined one. See
 * `openspec/changes/replace-config-descriptor-with-zod-json-schema/design.md`
 * for the keyword-by-keyword classification this file implements.
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

/**
 * The subset of `z.toJSONSchema`'s draft 2020-12 output this module reads.
 * Zod's own `z.core.JSONSchema.JSONSchema` type admits a boolean node (a
 * bare `true`/`false` schema) anywhere a property or an array's `items` can
 * sit — a shape `z.toJSONSchema` never emits for an object or array Zod
 * schema. This narrows to the keywords the classifiers below inspect.
 */
interface JsonSchemaNode {
  type?: string;
  enum?: unknown[];
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  multipleOf?: number;
  items?: JsonSchemaNode;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
}

function describeString(node: JsonSchemaNode): LeafDescriptor | undefined {
  // `.regex()`, `.startsWith()`, and `.endsWith()` all produce a bare
  // `pattern` keyword with no `format` key. The email format also carries a
  // `pattern` keyword (its validation regex), so a pattern paired with
  // `format: "email"` is not itself an extra constraint to bail on.
  if (node.pattern !== undefined && node.format !== "email") return undefined;
  const descriptor: LeafDescriptor = { kind: "string" };
  if (node.format === "email") descriptor.format = "email";
  else if (node.format !== undefined) return undefined;
  if (node.minLength !== undefined) descriptor.minLength = node.minLength;
  if (node.maxLength !== undefined) descriptor.maxLength = node.maxLength;
  return descriptor;
}

function describeNumber(node: JsonSchemaNode): LeafDescriptor | undefined {
  // `.multipleOf()` produces a `multipleOf` keyword the form cannot render.
  if (node.multipleOf !== undefined) return undefined;
  // `.min()`/`.max()` are inclusive bounds, `minimum`/`maximum`. An
  // exclusive bound (`.gt()`/`.lt()`) describes a range the form cannot
  // render, so it leaves the subset.
  if (node.exclusiveMinimum !== undefined || node.exclusiveMaximum !== undefined) return undefined;
  const descriptor: LeafDescriptor = { kind: "number" };
  if (node.minimum !== undefined) descriptor.min = node.minimum;
  if (node.maximum !== undefined) descriptor.max = node.maximum;
  return descriptor;
}

/**
 * An array over a fixed value set stays `kind: "string-array"` and carries its
 * values in `enumValues`, the field the scalar `enum` kind already uses. A
 * separate `enum-array` kind would need a new branch in every consumer of
 * `ConfigFieldKind`, and the browser's mirror type already declares
 * `enumValues`. The generated form renders such a property as one checkbox per
 * value instead of the free-text control an open-ended array gets.
 *
 * Without this branch a `z.array(z.enum([...]))` property leaves the supported
 * subset, which drops the descriptor for its WHOLE type — every sibling
 * property falls back to the raw JSON textarea with it.
 */
function describeStringArray(node: JsonSchemaNode): LeafDescriptor | undefined {
  const items = node.items;
  if (!items) return undefined;
  const descriptor: LeafDescriptor = { kind: "string-array" };
  // Check `items.enum` before `items.type`: a fixed string enum's element
  // node carries both `type: "string"` and `enum: [...]` at once.
  if (items.enum !== undefined) {
    if (!items.enum.every((v): v is string => typeof v === "string")) return undefined;
    descriptor.enumValues = [...items.enum];
  } else if (items.type === "string") {
    if (items.pattern !== undefined && items.format !== "email") return undefined;
    if (items.format === "email") descriptor.format = "email";
    else if (items.format !== undefined) return undefined;
  } else {
    return undefined;
  }
  if (node.minItems !== undefined) descriptor.minItems = node.minItems;
  if (node.maxItems !== undefined) descriptor.maxItems = node.maxItems;
  return descriptor;
}

function describeLeaf(node: JsonSchemaNode): LeafDescriptor | undefined {
  // Check `enum` before `type`: a scalar `z.enum()` node carries both
  // `type: "string"` and `enum: [...]` on the same property node. Checking
  // `type` first would misclassify it as `kind: "string"` and discard
  // `enumValues`.
  if (node.enum !== undefined) {
    if (!node.enum.every((v): v is string => typeof v === "string")) return undefined;
    return { kind: "enum", enumValues: [...node.enum] };
  }
  if (node.type === "string") return describeString(node);
  if (node.type === "number") return describeNumber(node);
  if (node.type === "boolean") return { kind: "boolean" };
  if (node.type === "array") return describeStringArray(node);
  // A record, a nested object, an unknown/any-typed property (no `type`
  // keyword at all), or anything else this module does not classify.
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
  let jsonSchema: JsonSchemaNode;
  try {
    jsonSchema = z.toJSONSchema(schema) as unknown as JsonSchemaNode;
  } catch (err) {
    // z.toJSONSchema is not total: it throws on z.date(), z.bigint(),
    // .transform(), z.void(), z.symbol(), z.nan(), z.map(), and possibly a
    // future construct a registered config schema adds. describeConfigSchema
    // runs once per registered type inside describeRegistry's loop, so an
    // uncaught throw here would crash the whole GET /registry response
    // instead of dropping just this one type's descriptor.
    log.debug("config schema has no generated-form descriptor", {
      type: typeName,
      reason: `z.toJSONSchema threw: ${err instanceof Error ? err.message : String(err)}`,
    });
    return undefined;
  }
  // `.shape` gives property existence and iteration order, a stable public
  // Zod API. `jsonSchema.properties[key]` is the leaf-type oracle for each
  // property named there.
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const properties = jsonSchema.properties ?? {};
  const requiredKeys = jsonSchema.required ?? [];
  const descriptors: ConfigFieldDescriptor[] = [];
  for (const key of Object.keys(shape)) {
    const propertyNode = properties[key];
    if (!propertyNode) {
      log.debug("config schema has no generated-form descriptor", {
        type: typeName,
        reason: `property '${key}' has no JSON Schema node`,
      });
      return undefined;
    }
    const leaf = describeLeaf(propertyNode);
    if (!leaf) {
      log.debug("config schema has no generated-form descriptor", {
        type: typeName,
        reason: `property '${key}' uses an unsupported construct`,
      });
      return undefined;
    }
    // z.toJSONSchema lists a `.default()`-carrying property in the schema's
    // own `required` array, alongside its `default` keyword. Today's
    // descriptor semantics mark a defaulted field `required: false` with its
    // default attached, never `required: true`, so `required` reads both
    // signals together rather than the bare `required` array membership.
    const hasDefault = "default" in propertyNode;
    const required = requiredKeys.includes(key) && !hasDefault;
    descriptors.push({
      key,
      required,
      ...(hasDefault ? { default: propertyNode.default } : {}),
      ...leaf,
    });
  }
  return descriptors;
}
