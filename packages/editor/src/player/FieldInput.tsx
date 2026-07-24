import type { ReactNode } from "react";
import type { LocalizedText } from "workflow-engine/schema";
import type { ResolvedViewField, SubmissionIssue } from "./types";

function firstLocalizedText(value: LocalizedText | undefined): string {
  if (!value) return "";
  const values = Object.values(value);
  return values[0] ?? "";
}

interface FieldFormProps {
  fields: ResolvedViewField[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  issuesByField?: Map<string, SubmissionIssue[]>;
}

/** Renders every root-level (non-nested) field from an `InstanceView`; a
 * `group` field recurses into the fields that carry its key as their
 * `ResolvedViewField.group`. */
export function FieldForm({ fields, values, onChange, issuesByField }: FieldFormProps) {
  const roots = fields.filter((f) => !f.group);
  return (
    <div className="player-field-form">
      {roots.map((f) => (
        <FieldInput key={f.field.id} field={f} allFields={fields} values={values} onChange={onChange} issuesByField={issuesByField} />
      ))}
    </div>
  );
}

interface FieldInputProps {
  field: ResolvedViewField;
  allFields: ResolvedViewField[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  issuesByField?: Map<string, SubmissionIssue[]>;
}

export function FieldInput({ field, allFields, values, onChange, issuesByField }: FieldInputProps) {
  const def = field.field;
  const label = firstLocalizedText(def.label) || def.key;
  const issues = issuesByField?.get(def.id) ?? [];

  if (def.type === "group") {
    const children = allFields.filter((f) => f.group === def.key);
    return (
      <fieldset className="player-field player-field-group">
        <legend>{label}</legend>
        {children.map((c) => (
          <FieldInput key={c.field.id} field={c} allFields={allFields} values={values} onChange={onChange} issuesByField={issuesByField} />
        ))}
      </fieldset>
    );
  }

  // reference / file / a Plugin envelope type: no dedicated widget in this
  // preview tool, all fall back to free text. A dataSource-bound select/
  // multiselect field is NOT included here — its options are resolved
  // server-side into `field.options`, same as a static-options field.
  const isFreeTextFallback = def.type === "reference" || def.type === "file" || typeof def.type !== "string";

  const value = values[def.id];
  const disabled = field.readonly;

  let control: ReactNode;
  if (isFreeTextFallback) {
    control = <input type="text" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} />;
  } else if (def.type === "boolean") {
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
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {firstLocalizedText(o.label) || o.value}
          </option>
        ))}
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
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {firstLocalizedText(o.label) || o.value}
          </option>
        ))}
      </select>
    );
  } else {
    control = <input type="text" disabled={disabled} value={(value as string) ?? ""} onChange={(e) => onChange(def.id, e.target.value)} />;
  }

  return (
    <label className="player-field">
      <span className="player-field-label">
        {label}
        {field.required && (
          <span className="player-required-marker" title="required">
            *
          </span>
        )}
      </span>
      {control}
      {issues.length > 0 && (
        <ul className="player-field-issues">
          {issues.map((issue, i) => (
            <li key={i}>{issue.kind}</li>
          ))}
        </ul>
      )}
    </label>
  );
}
