import type { ReactNode } from "react";
import type { LocaleCode } from "workflow-engine/schema";
import type { ResolvedViewField, SubmissionIssue } from "./types.js";
import { resolveText } from "./locale.js";

interface FieldFormProps {
  fields: ResolvedViewField[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  locale: LocaleCode;
  baseLocale?: LocaleCode;
  issuesByField?: Map<string, SubmissionIssue[]>;
}

/** Renders every root-level (non-nested) field from an `InstanceView`; a
 * `group` field recurses into the fields that carry its key as their
 * `ResolvedViewField.group`. */
export function FieldForm({ fields, values, onChange, locale, baseLocale = locale, issuesByField }: FieldFormProps) {
  const roots = fields.filter((f) => !f.group);
  return (
    <div className="form-ui-field-form">
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
        />
      ))}
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
}

export function FieldInput({ field, allFields, values, onChange, locale, baseLocale, issuesByField }: FieldInputProps) {
  const def = field.field;
  const label = resolveText(def.label, locale, baseLocale) || def.key;
  const issues = issuesByField?.get(def.id) ?? [];

  if (def.type === "group") {
    const children = allFields.filter((f) => f.group === def.key);
    return (
      <fieldset className="form-ui-field form-ui-field-group">
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
          />
        ))}
      </fieldset>
    );
  }

  const value = values[def.id];
  const disabled = field.readonly;
  // Select/multiselect share this one option-list build — never two
  // independently-maintained copies of the same map.
  const options = (field.options ?? []).map((o) => (
    <option key={o.value} value={o.value}>
      {resolveText(o.label, locale, baseLocale) || o.value}
    </option>
  ));

  let control: ReactNode;
  if (def.type === "boolean") {
    control = <input type="checkbox" disabled={disabled} checked={!!value} onChange={(e) => onChange(def.id, e.target.checked)} />;
  } else if (def.type === "number") {
    control = (
      <input
        type="number"
        disabled={disabled}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(def.id, e.target.value === "" ? undefined : Number(e.target.value))}
      />
    );
  } else if (def.type === "date") {
    control = <input type="date" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} />;
  } else if (def.type === "datetime") {
    control = <input type="datetime-local" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} />;
  } else if (def.type === "select") {
    control = (
      <select disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)}>
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
    control = <input type="text" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} />;
  }

  return (
    <label className="form-ui-field">
      <span className="form-ui-field-label">
        {label}
        {field.required && (
          <span className="form-ui-required-marker" title="required">
            *
          </span>
        )}
      </span>
      {control}
      {issues.length > 0 && (
        <ul className="form-ui-field-issues">
          {issues.map((issue, i) => (
            <li key={i}>{issue.kind}</li>
          ))}
        </ul>
      )}
    </label>
  );
}
