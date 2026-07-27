## Context

`FieldInput.tsx:60-107` (verified against current file contents), inside
the `if`/`else if` chain that sets `control`:

```tsx
let control: ReactNode;
if (isFreeTextFallback) {
  control = <input type="text" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} />;
} else if (def.type === "boolean") { ... }
  ... number, date, datetime ...
} else if (def.type === "select") {
  control = (
    <select disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)}>
      <option value="" />
      {(field.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>{firstLocalizedText(o.label) || o.value}</option>
      ))}
    </select>
  );
} else if (def.type === "multiselect") {
  const selected = Array.isArray(value) ? (value as string[]) : [];
  control = (
    <select multiple disabled={disabled} value={selected} onChange={(e) => onChange(def.id, Array.from(e.target.selectedOptions).map((o) => o.value))}>
      {(field.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>{firstLocalizedText(o.label) || o.value}</option>
      ))}
    </select>
  );
} else {
  control = <input type="text" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} />;
}
```

`isFreeTextFallback` is defined above this chain as `def.type ===
"reference" || def.type === "file" || typeof def.type !== "string"`. Since
`BaseFieldType` is the 10-member enum `string, number, boolean, date,
datetime, select, multiselect, reference, file, group` (`group` is handled
in an earlier, separate early-return above this chain — not reachable
here), the only member with no explicit `else if` in this chain is
`string`, which is exactly what the final `else` exists to catch. Removing
the `isFreeTextFallback` branch therefore does not change which input
`reference`/`file`/plugin-envelope types get — they fall through every
`else if` (none match) straight to the same final `else` that already
renders the identical `<input type="text">` for `string`.

## Goals / Non-Goals

**Goals:**
- One `options` expression feeds both `select` and `multiselect`.
- One text-input branch covers `string`, `reference`, `file`, and plugin
  envelope types, instead of two copies of the same JSX.
- Preserve every rendered DOM node, attribute, and event handler exactly.

**Non-Goals:**
- Any change to which `BaseFieldType`s get which widget, to
  `dataSource`-bound option resolution, or to `group` nesting — all
  handled elsewhere in this file, untouched.
- Adding a dedicated widget for `reference`/`file`/plugin types — out of
  scope per `openspec/specs/editor-player/spec.md`'s existing "no
  dedicated widget ... in this preview tool" statement.

## Decisions

### Hoist the option list

```tsx
const value = values[def.id];
const disabled = field.readonly;
const options = (field.options ?? []).map((o) => (
  <option key={o.value} value={o.value}>
    {firstLocalizedText(o.label) || o.value}
  </option>
));
```

`select`'s branch becomes `<select ...><option value="" />{options}</select>`
(unchanged empty-value placeholder option, unique to `select` since
`multiselect` has no "no selection" placeholder need); `multiselect`'s
becomes `<select multiple ...>{options}</select>`. `options` is computed
unconditionally before the branch chain (cheap — `field.options` is
usually a short array or `undefined` -> `[]`), avoiding a second
independent map.

Alternative considered: compute `options` lazily inside a small local
function (`const renderOptions = () => (field.options ?? []).map(...)`)
called from both branches. Rejected — a plain hoisted expression is
simpler than a function for something evaluated at most once per render
either way; JSX element arrays are cheap to construct and unused branches
never read the variable.

### Merge the two text branches by deleting the redundant one

Delete the `isFreeTextFallback` variable and its `if` branch entirely;
`reference`/`file`/plugin-envelope types now reach the chain's existing
final `else`, which already renders the byte-identical
`<input type="text" disabled={disabled} value={(value as string) ?? ""}
onChange={(e) => onChange(def.id, e.target.value)} />`. Move the existing
explanatory comment (currently above the `isFreeTextFallback` declaration)
to sit above the final `else`, since it now documents why that branch
covers more than just `string`.

Alternative considered: keep `isFreeTextFallback` as a named condition but
merge it into the final `else`'s guard (`else if (isFreeTextFallback ||
true)` or restructuring the chain's order). Rejected — once
`isFreeTextFallback`'s branch is gone, the variable has no remaining
reader; keeping it would be dead code the audit itself would flag next
scan.

## Risks / Trade-offs

- [Risk] None identified — both changes are provably output-preserving:
  the option list is the same map applied at the same two call sites, and
  the merged text branch is deleting one of two textually-identical JSX
  expressions, not writing new logic.

## Migration Plan

Pure refactor, no schema/contract/data changes, no rendered-output change
for any field type. Rollback is reverting `FieldInput.tsx`.

## Open Questions

None outstanding.
