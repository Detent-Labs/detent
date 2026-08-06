import type { ReactNode } from "react";
import type { LocaleCode } from "workflow-engine/schema";
import type { ResolvedViewField, SubmissionIssue } from "./types.js";
import { resolveText } from "./locale.js";
import { issueMessage } from "./issue-messages.js";

interface FieldFormProps {
  fields: ResolvedViewField[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  locale: LocaleCode;
  baseLocale?: LocaleCode;
  issuesByField?: Map<string, SubmissionIssue[]>;
  /** The step view's declared column count. 1 is the width every form had
   * before `view.columns` existed, so an omitted prop renders unchanged. */
  columns?: 1 | 2;
}

/** How many grid columns a field draws across. A field never exceeds the grid
 * it sits in: the two properties are set independently, so a form narrowed to
 * one column keeps its `span: 2` fields and simply draws them full width. */
export function effectiveSpan(span: 1 | 2 | undefined, columns: 1 | 2): 1 | 2 {
  return Math.min(span ?? 1, columns) as 1 | 2;
}

/** Renders every root-level (non-nested) field from an `InstanceView` in a
 * `columns`-wide grid; a `group` field recurses into the fields that carry its
 * key as their `ResolvedViewField.group`, at that same width.
 *
 * Declaration order stays the render order. The grid fills left to right then
 * wraps down, so a view array built before this grid existed lays out in the
 * order its `↑`/`↓` buttons already gave it. */
export function FieldForm({ fields, values, onChange, locale, baseLocale = locale, issuesByField, columns = 1 }: FieldFormProps) {
  const roots = fields.filter((f) => !f.group);
  return (
    // The wrapper carries the size container the collapse rule measures. A
    // container query matches descendants of the container, never the element
    // declaring it, so the grid cannot be its own container.
    <div className="form-ui-form">
      <div className="form-ui-field-form" data-columns={columns}>
        {roots.map((f) => (
          <FieldInput
            key={f.field.id}
            field={f}
            allFields={fields}
            values={values}
            onChange={onChange}
            locale={locale}
            baseLocale={baseLocale}
            issuesByField={issuesByField}
            columns={columns}
          />
        ))}
      </div>
    </div>
  );
}

interface FieldInputProps {
  field: ResolvedViewField;
  allFields: ResolvedViewField[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  locale: LocaleCode;
  baseLocale: LocaleCode;
  issuesByField?: Map<string, SubmissionIssue[]>;
  /** The width of the grid this field sits in. A group passes its own value
   * straight down: a group inherits the form's count and declares none of its
   * own, which is what keeps an already-published one-column form stacked. */
  columns?: 1 | 2;
}

export function FieldInput({ field, allFields, values, onChange, locale, baseLocale, issuesByField, columns = 1 }: FieldInputProps) {
  const def = field.field;
  const label = resolveText(def.label, locale, baseLocale) || def.key;
  const issues = issuesByField?.get(def.id) ?? [];
  const span = effectiveSpan(field.span, columns);

  if (def.type === "group") {
    const children = allFields.filter((f) => f.group === def.key);
    return (
      <fieldset className="form-ui-field form-ui-field-group" data-span={span} data-columns={columns}>
        <legend>{label}</legend>
        {children.map((c) => (
          <FieldInput
            key={c.field.id}
            field={c}
            allFields={allFields}
            values={values}
            onChange={onChange}
            locale={locale}
            baseLocale={baseLocale}
            issuesByField={issuesByField}
            columns={columns}
          />
        ))}
      </fieldset>
    );
  }

  const value = values[def.id];
  const disabled = field.readonly;
  const hasIssues = issues.length > 0;
  const issuesId = `${def.id}-issues`;
  // Every branch below carries the same three: required/invalid state
  // announced programmatically (not only via the visual marker/styling),
  // and the issue list linked as a description rather than folded into the
  // control's name. `aria-required` only, never native `required` — the
  // engine is the validator, and native blocking would prevent the
  // submission it's meant to judge (design.md's default, chosen for every
  // branch here).
  const a11yProps = {
    "aria-required": field.required || undefined,
    "aria-invalid": hasIssues || undefined,
    "aria-describedby": hasIssues ? issuesId : undefined,
  } as const;
  // Select/multiselect share this one option-list build — never two
  // independently-maintained copies of the same map.
  const options = (field.options ?? []).map((o) => (
    <option key={o.value} value={o.value}>
      {resolveText(o.label, locale, baseLocale) || o.value}
    </option>
  ));

  let control: ReactNode;
  if (def.type === "boolean") {
    control = <input type="checkbox" disabled={disabled} checked={!!value} onChange={(e) => onChange(def.id, e.target.checked)} {...a11yProps} />;
  } else if (def.type === "number") {
    control = (
      <input
        type="number"
        disabled={disabled}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(def.id, e.target.value === "" ? undefined : Number(e.target.value))}
        {...a11yProps}
      />
    );
  } else if (def.type === "date") {
    control = (
      <input type="date" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} {...a11yProps} />
    );
  } else if (def.type === "datetime") {
    control = (
      <input
        type="datetime-local"
        disabled={disabled}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(def.id, e.target.value)}
        {...a11yProps}
      />
    );
  } else if (def.type === "select") {
    control = (
      <select disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} {...a11yProps}>
        <option value="" />
        {options}
      </select>
    );
  } else if (def.type === "multiselect") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    control = (
      <select
        multiple
        disabled={disabled}
        value={selected}
        onChange={(e) => onChange(def.id, Array.from(e.target.selectedOptions).map((o) => o.value))}
        {...a11yProps}
      >
        {options}
      </select>
    );
  } else {
    // string, reference, file, or a Plugin envelope type share this one
    // free-text branch: no dedicated widget beyond free text exists for
    // reference/file/plugin. A dataSource-bound select/multiselect field is
    // NOT included here — its options are resolved server-side into
    // `field.options`, same as a static-options field.
    control = (
      <input type="text" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} {...a11yProps} />
    );
  }

  return (
    <div className="form-ui-field" data-span={span}>
      <label className="form-ui-field-control">
        <span className="form-ui-field-label">
          {label}
          {field.required && (
            <span className="form-ui-required-marker" title="required">
              *
            </span>
          )}
        </span>
        {control}
      </label>
      {hasIssues && (
        <ul className="form-ui-field-issues" id={issuesId}>
          {issues.map((issue, i) => (
            <li key={i}>{issueMessage(issue, locale, baseLocale)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
