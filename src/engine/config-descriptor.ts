/**
 * Converts a registry entry's `configSchema` into a browser-consumable
 * descriptor for a generated form, so the studio area never hand-maintains a
 * second description beside the Zod schema the publish-time registry checks
 * already parse against (see `registry-check.ts`). A leaf module importing
 * only `zod`, so `studio-routes.ts` can import it without a cycle.
 *
 * `describeConfigSchema` returns `undefined` for any construct outside the
 * supported subset: a nested `ZodObject` property, `z.unknown()`, a string
 * format other than email, or any other unsupported node. The caller then
 * omits a schema description for that type, and the studio area falls back to
 * its raw JSON textarea — unchanged from the behavior before this module
 * existed.
 *
 * A `.refine()`/`.superRefine()`-wrapped object is NOT outside that subset.
 * Zod v4 declares `refine` as returning `this`, so a refined object stays a
 * `ZodObject` and reaches the per-property walk below. Zod v3 wrapped it as a
 * `ZodEffects`, which the top-level check rejected, so those types used to
 * fall back to the raw JSON textarea. The generated form describes per-field
 * rules only; the cross-field rule the refinement carries still runs at
 * publish, through `registry-check.ts`.
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

/** Zod v4 keeps a node's constraints in `_zod.def.checks`, each check carrying
 * its own `_zod.def` with a `check` discriminator. The shapes read below were
 * taken from the running library: a string length check is
 * `{ check: "min_length", minimum }`, a number bound is
 * `{ check: "greater_than", value, inclusive }`, and a string format is
 * `{ check: "string_format", format }`. */
/** A node's own type tag. Zod v4 gives a formatted string its own class —
 * `z.email()` is a ZodEmail and answers `instanceof z.ZodString` with false —
 * while still reporting `type: "string"` here. Dispatching on the tag keeps
 * such a node inside the supported subset instead of dropping it silently. */
function nodeType(schema: z.ZodTypeAny): string | undefined {
  return (schema as unknown as { _zod?: { def?: { type?: string } } })._zod?.def?.type;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkDefs(schema: z.ZodTypeAny): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (((schema as any)._zod?.def?.checks ?? []) as any[]).map((c) => c?._zod?.def).filter(Boolean);
}

/** A string format reaches the node two ways. `z.string().email()` appends a
 * `string_format` check, while `z.email()` carries `format` on the node itself
 * and appends no check. Both must resolve, or a schema authored the second way
 * would silently lose its format rather than fail. */
function stringFormat(schema: z.ZodString): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeFormat = (schema as any)._zod?.def?.format;
  if (typeof nodeFormat === "string") return nodeFormat;
  const formatCheck = checkDefs(schema).find((c) => c.check === "string_format");
  return typeof formatCheck?.format === "string" ? formatCheck.format : undefined;
}

function describeString(schema: z.ZodString): LeafDescriptor | undefined {
  const descriptor: LeafDescriptor = { kind: "string" };
  const format = stringFormat(schema);
  if (format === "email") descriptor.format = "email";
  else if (format !== undefined) return undefined;
  for (const check of checkDefs(schema)) {
    if (check.check === "min_length") descriptor.minLength = check.minimum;
    else if (check.check === "max_length") descriptor.maxLength = check.maximum;
    else if (check.check === "string_format") continue;
    else return undefined;
  }
  return descriptor;
}

function describeNumber(schema: z.ZodNumber): LeafDescriptor | undefined {
  const descriptor: LeafDescriptor = { kind: "number" };
  for (const check of checkDefs(schema)) {
    // `.min()`/`.max()` are inclusive bounds. An exclusive bound describes a
    // range the form cannot render, so it leaves the subset.
    if (check.check === "greater_than" && check.inclusive) descriptor.min = check.value;
    else if (check.check === "less_than" && check.inclusive) descriptor.max = check.value;
    else return undefined;
  }
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeStringArray(schema: z.ZodArray<any>): LeafDescriptor | undefined {
  const element = schema.element as z.ZodTypeAny;
  const descriptor: LeafDescriptor = { kind: "string-array" };
  if (element instanceof z.ZodEnum) {
    // v4's `.options` may carry numbers; the generated form renders strings.
    const values = element.options;
    if (!values.every((v): v is string => typeof v === "string")) return undefined;
    descriptor.enumValues = [...values];
  } else {
    if (nodeType(element) !== "string") return undefined;
    const elementDescriptor = describeString(element as z.ZodString);
    if (!elementDescriptor) return undefined;
    if (elementDescriptor.format) descriptor.format = elementDescriptor.format;
  }
  // An array's own length bounds sit in `checks`, as `min_length`/`max_length`.
  // v3 carried them on the def as `minLength`/`maxLength` objects instead.
  for (const check of checkDefs(schema)) {
    if (check.check === "min_length") descriptor.minItems = check.minimum;
    else if (check.check === "max_length") descriptor.maxItems = check.maximum;
    else return undefined;
  }
  return descriptor;
}

function describeLeaf(schema: z.ZodTypeAny): LeafDescriptor | undefined {
  const t = nodeType(schema);
  if (t === "string") return describeString(schema as z.ZodString);
  if (t === "number") return describeNumber(schema as z.ZodNumber);
  if (schema instanceof z.ZodBoolean) return { kind: "boolean" };
  if (schema instanceof z.ZodEnum) {
    // v4's `.options` may carry numbers; the generated form renders strings.
    const values = schema.options;
    if (!values.every((v): v is string => typeof v === "string")) return undefined;
    return { kind: "enum", enumValues: [...values] };
  }
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
  // v4 exposes `.shape` as a property. v3 exposed `_def.shape()`, a call.
  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const descriptors: ConfigFieldDescriptor[] = [];
  for (const key of Object.keys(shape)) {
    let fieldSchema: z.ZodTypeAny = shape[key]!;
    let required = true;
    let defaultValue: unknown;
    if (fieldSchema instanceof z.ZodDefault) {
      required = false;
      // v4 stores the default as a value. v3 stored a thunk.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      defaultValue = (fieldSchema as any)._zod.def.defaultValue;
      fieldSchema = fieldSchema.unwrap() as z.ZodTypeAny;
    }
    if (fieldSchema instanceof z.ZodOptional) {
      required = false;
      fieldSchema = fieldSchema.unwrap() as z.ZodTypeAny;
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
