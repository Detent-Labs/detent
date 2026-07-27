## Context

`src/runtime/api.ts:304-346` (verified against current file contents):

```ts
function typeMatches(fieldType: FieldDef["type"], value: Literal): boolean {
  if (typeof fieldType !== "string") return true; // plugin type: opaque, accept
  switch (fieldType) {
    case "string": case "date": case "datetime": case "select": case "reference":
      return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "multiselect": return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "file": case "group": return true; // opaque / unreachable
    default: return true;
  }
}

function expectedTypeLabel(fieldType: FieldDef["type"]): string {
  if (typeof fieldType !== "string") return "any";
  switch (fieldType) {
    case "string": case "date": case "datetime": case "select": case "reference": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    case "multiselect": return "string[]";
    default: return "any"; // covers file/group too
  }
}
```

Both switches partition the same 10-member `BaseFieldType` enum
(`src/schema/definition.ts:204-206`:
`string, number, boolean, date, datetime, select, multiselect, reference,
file, group`) into the same four JS-shape groups. Called from
`buildIssues` (`api.ts:417-418`): `if (!typeMatches(rf.field.type, value))
issues.push({ kind: "type-mismatch", fieldId, expected:
expectedTypeLabel(rf.field.type) })` — this runs over user-submitted
`data` in `submitAndTransition`, a trust boundary.

## Goals / Non-Goals

**Goals:**
- One table drives both functions' per-`BaseFieldType` answer.
- Preserve the plugin-type opaque-accept branch as an explicit check ahead
  of the table (it is not a `BaseFieldType`, so it cannot live in a
  `Record<BaseFieldType, ...>`).
- Preserve every current value's accept/reject result and every current
  `expected` label string, exactly.

**Non-Goals:**
- Changing what counts as a type match for any existing `BaseFieldType`
  (e.g. tightening `file`/`group` beyond "opaque, always accept").
- Changing `buildIssues`, the `type-mismatch` issue shape, or any other
  validation check (`optionValuesValid`, `checkConstraints`).
- Adding runtime validation for `BaseFieldType` values that don't exist
  yet — the enum is closed today; if it grows, that's a separate schema
  change with its own review.

## Decisions

### One `Record<BaseFieldType, string>` table, not a fail-open default

```ts
const JS_TYPE: Record<BaseFieldType, string> = {
  string: "string",
  date: "string",
  datetime: "string",
  select: "string",
  reference: "string",
  number: "number",
  boolean: "boolean",
  multiselect: "string[]",
  file: "any",
  group: "any",
};

function typeMatches(fieldType: FieldDef["type"], value: Literal): boolean {
  if (typeof fieldType !== "string") return true; // plugin type: opaque, accept
  const expected = JS_TYPE[fieldType];
  if (expected === "any") return true; // file/group: opaque
  if (expected === "string[]") return Array.isArray(value) && value.every((v) => typeof v === "string");
  return typeof value === expected;
}

function expectedTypeLabel(fieldType: FieldDef["type"]): string {
  return typeof fieldType !== "string" ? "any" : JS_TYPE[fieldType];
}
```

`Record<BaseFieldType, string>` is exhaustively checked by `tsc` against
the `baseFieldType` zod enum's inferred type — every current member must
have an entry, and TypeScript raises a compile error if `BaseFieldType`
gains a member without a corresponding `JS_TYPE` entry. This directly
answers the audit's own concern ("the fail-open fallback must be
explicit, or the refactor silently turns acceptance into rejection"): the
plugin-type branch stays an explicit, deliberate opaque-accept (unchanged
behavior, unrelated to the table), while the *only* thing the audit warned
about — a bare `Record` lookup silently returning `undefined` for an
unhandled `BaseFieldType` — cannot happen, because there is no unhandled
`BaseFieldType`; the table is exhaustive by construction and enforced at
compile time, which is strictly safer than the switches' silent
`default: return true` for a case nothing today can produce.

`typeMatches`'s `typeof value === expected` comparison uses `expected` as
a plain runtime string (`"string"`, `"number"`, or `"boolean"` — never
`"any"`/`"string[]"`, both handled by the two guards above it), which is
valid JS (`typeof` compared against a `string`-typed variable) even though
TypeScript can't statically narrow `value`'s type from it — the function
already returns a plain `boolean`, so no narrowing was needed before this
change either.

Alternative considered: a single table entry format like `{ jsType:
"string" | "number" | "boolean", label: string, arrayCheck?: boolean }`
per `BaseFieldType`, letting `typeMatches` and `expectedTypeLabel` both
read structured fields instead of `typeMatches` re-deriving behavior from
the label string. Rejected — the label string IS a valid `typeof` result
for every case except the two explicitly-guarded ones
(`"any"`/`"string[]"`), so branching on the label directly (as the audit's
own suggested design put it: "the label *is* the lookup") is one table and
two guards, not a table of structured records.

### `file`/`group` collapse into the `file`/`group` case that already fell to `default` in `expectedTypeLabel`

`typeMatches`'s switch had explicit `case "file": case "group": return
true;`, while `expectedTypeLabel`'s switch let `file`/`group` fall through
to `default: return "any"`. Both produce the same practical result (accept
unconditionally; label `"any"`), so the merged table entry (`"any"`) and
the `if (expected === "any") return true;` guard in `typeMatches` unify
them into one code path — this is the one place implementation detail
changes (two switch cases collapse into the shared `"any"` branch) while
output stays identical for every input.

## Risks / Trade-offs

- [Risk] This is submission validation at a trust boundary — a
  transcription error in `JS_TYPE` (e.g. mapping `boolean` to `"string"`)
  would silently change what submitted values are accepted or rejected.
  → Mitigation: `test/runtime-api.test.ts` has a direct
  `"type-mismatch: a wrongly-shaped value is rejected"` test
  (`field_amount` expects `"number"`) plus every other submission-issue
  test in that file exercises a real field through real
  `submitAndTransition` calls, not a mock of `typeMatches`; task 3 also
  adds a line-by-line diff of the table against both original switches.
- [Risk] None identified for the `file`/`group` case collapse — both
  functions already treated them identically in observable output
  (accept-always, label `"any"`), only the code path merges.

## Migration Plan

Pure refactor, no schema/contract/data changes, no validation-outcome
change for any existing `BaseFieldType`. Rollback is reverting
`src/runtime/api.ts`.

## Open Questions

None outstanding.
