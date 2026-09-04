import type { ReactNode } from "react";
import type { LocaleCode } from "workflow-engine/schema";
import * as stylex from "@stylexjs/stylex";
import { isResolvedViewField, type ResolvedViewEntry, type ResolvedViewField, type ResolvedViewNote, type SubmissionIssue } from "./types.js";
import { booleanLabels, resolveText } from "./locale.js";
import { issueMessage } from "./issue-messages.js";
import { colors, fonts, space } from "./tokens.stylex.js";

/** Every `form-ui.css` rule, as StyleX. A layout choice with a fixed set of
 * outcomes (`columns`, `span`) is chosen among named styles in code — see
 * `web-styling`'s "A DOM-attribute variant becomes a code-side style
 * choice". The `data-columns`/`data-span` attributes below still render;
 * nothing in this module reads them back. */
const styles = stylex.create({
  form: {
    containerType: "inline-size",
    containerName: "form-ui-form",
  },
  gridOneCol: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: space.s4,
  },
  gridTwoCol: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@container form-ui-form (max-width: 34rem)": "1fr",
    },
    gap: space.s4,
  },
  groupStack: {
    display: "flex",
    flexDirection: "column",
    gap: space.s4,
    border: "none",
    padding: 0,
    margin: 0,
  },
  groupGridTwoCol: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@container form-ui-form (max-width: 34rem)": "1fr",
    },
    gap: space.s4,
  },
  spanTwo: {
    gridColumn: {
      default: "span 2",
      "@container form-ui-form (max-width: 34rem)": "auto",
    },
  },
  groupLegendFullWidth: {
    gridColumn: "1 / -1",
  },
  fieldStack: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
  },
  fieldLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  control: {
    fontFamily: "inherit",
    fontSize: 14,
    padding: space.s2,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.border,
      ":focus-visible": colors.accent,
    },
    outlineOffset: {
      default: "initial",
      ":focus-visible": 0,
    },
    background: colors.surface,
    color: colors.text,
  },
  textareaResize: {
    resize: "vertical",
  },
  checkboxRadioReset: {
    padding: 0,
    border: "none",
    background: "none",
    accentColor: colors.accent,
  },
  fieldOptions: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    border: "none",
    padding: 0,
    margin: 0,
  },
  optionsLegendSpacing: {
    padding: 0,
    marginBottom: space.s1,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    fontSize: 14,
  },
  groupLegend: {
    fontFamily: fonts.heading,
    fontWeight: fonts.headingWeight,
    fontSize: 16,
    padding: 0,
  },
  requiredMarker: {
    marginLeft: space.s1,
    color: colors.accent,
  },
  fieldIssues: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.refusal,
  },
  note: {
    margin: 0,
    padding: `0 0 0 ${space.s3}`,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
});

interface FieldFormProps {
  fields: ResolvedViewEntry[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  locale: LocaleCode;
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

/**
 * The native input a `string` field's `format` reaches. `integer` is absent:
 * it belongs to `number`, whose branch reads it as a `step` instead. A format
 * with no entry here, and a field declaring none, takes the plain text input.
 *
 * The native control enforces the same value domain `formatMatches` does, so
 * a participant cannot enter a value the engine then refuses.
 */
const NATIVE_INPUT_TYPE: Record<string, string | undefined> = {
  date: "date",
  datetime: "datetime-local",
  email: "email",
};

/** Separates an option's label from its attributes, and each attribute from the next. */
export const OPTION_ATTRIBUTE_SEPARATOR = " · ";

/**
 * An option's visible text: its label, then the attribute values its data-list
 * row carries, in the order the operator declared. The engine builds
 * `attributes` by walking that declaration, so map order is declaration order.
 *
 * Folded into the text rather than drawn as columns because a native
 * `<option>` carries one text run. That text is the accessible name, so the
 * keyboard behavior, the type-ahead and the screen-reader reading all come
 * from the platform. A custom listbox would draw aligned columns and own every
 * one of those itself.
 *
 * A number prints through the locale's own formatter. A boolean prints as its
 * literal value: it is a machine value with no wording of its own, and one
 * text run admits no catalog lookup and no face change.
 */
export function optionText(
  label: string,
  attributes: Record<string, string | number | boolean> | undefined,
  locale: LocaleCode,
): string {
  if (!attributes) return label;
  const parts = Object.values(attributes).map((v) =>
    typeof v === "number" ? new Intl.NumberFormat(locale).format(v) : String(v),
  );
  return [label, ...parts].join(OPTION_ATTRIBUTE_SEPARATOR);
}

/** A React key prefix per entry kind, so a reorder can never make React
 * reuse a note's node for a field's or the reverse: a field keys by its
 * stable `FieldId`, a note (which has none) keys by its position in the
 * resolved array. */
function entryKey(entry: ResolvedViewEntry, index: number): string {
  return isResolvedViewField(entry) ? `field:${entry.field.id}` : `note:${index}`;
}

interface ViewEntryProps {
  entry: ResolvedViewEntry;
  allFields: ResolvedViewEntry[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  locale: LocaleCode;
  issuesByField?: Map<string, SubmissionIssue[]>;
  columns?: 1 | 2;
}

/** Dispatches one resolved view entry to its renderer: a field reaches
 * `FieldInput` unchanged, a note reaches `NoteText`. */
function ViewEntryInput({ entry, allFields, values, onChange, locale, issuesByField, columns }: ViewEntryProps) {
  if (!isResolvedViewField(entry)) {
    return <NoteText note={entry} locale={locale} columns={columns} />;
  }
  return (
    <FieldInput
      field={entry}
      allFields={allFields}
      values={values}
      onChange={onChange}
      locale={locale}
      issuesByField={issuesByField}
      columns={columns}
    />
  );
}

/** Renders every root-level (non-nested) field from an `InstanceView` in a
 * `columns`-wide grid; a `group` field recurses into the fields that carry its
 * key as their `ResolvedViewField.group`, at that same width.
 *
 * Declaration order stays the render order. The grid fills left to right then
 * wraps down, so a view array built before this grid existed lays out in the
 * order its `↑`/`↓` buttons already gave it. */
export function FieldForm({ fields, values, onChange, locale, issuesByField, columns = 1 }: FieldFormProps) {
  const roots = fields.map((entry, index) => ({ entry, index })).filter(({ entry }) => !entry.group);
  return (
    // The wrapper carries the size container the collapse rule measures. A
    // container query matches descendants of the container, never the element
    // declaring it, so the grid cannot be its own container.
    <div {...stylex.props(styles.form)}>
      <div {...stylex.props(columns === 2 ? styles.gridTwoCol : styles.gridOneCol)} data-columns={columns}>
        {roots.map(({ entry, index }) => (
          <ViewEntryInput
            key={entryKey(entry, index)}
            entry={entry}
            allFields={fields}
            values={values}
            onChange={onChange}
            locale={locale}
            issuesByField={issuesByField}
            columns={columns}
          />
        ))}
      </div>
    </div>
  );
}

/** A note's text, at its place in the grid. Static text a participant reads:
 * no form control, no label element and no required marker, so it takes no
 * tab stop of its own. */
function NoteText({ note, locale, columns = 1 }: { note: ResolvedViewNote; locale: LocaleCode; columns?: 1 | 2 }) {
  const span = effectiveSpan(note.span, columns);
  return (
    <p {...stylex.props(styles.note, span === 2 && styles.spanTwo)} data-span={span}>
      {resolveText(note.text, locale, locale)}
    </p>
  );
}

interface FieldInputProps {
  field: ResolvedViewField;
  allFields: ResolvedViewEntry[];
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  locale: LocaleCode;
  issuesByField?: Map<string, SubmissionIssue[]>;
  /** The width of the grid this field sits in. A group passes its own value
   * straight down: a group inherits the form's count and declares none of its
   * own, which is what keeps an already-published one-column form stacked. */
  columns?: 1 | 2;
}

/** A group is a container, not a leaf, so it draws at the form's full width
 * rather than at a declared span. Its members lay out at the form's `columns`
 * inside it, and two tracks need the room two tracks take. `span` on a group
 * is therefore not read. On a one-column form full width IS one column, so an
 * already-published group renders exactly as it did. */
function isGroup(field: ResolvedViewField): boolean {
  return field.field.type === "group";
}

export function FieldInput({ field, allFields, values, onChange, locale, issuesByField, columns = 1 }: FieldInputProps) {
  const def = field.field;
  const label = resolveText(def.label, locale, locale) || def.key;
  const issues = issuesByField?.get(def.id) ?? [];
  const span = isGroup(field) ? columns : effectiveSpan(field.span, columns);

  if (def.type === "group") {
    const children = allFields.map((c, i) => ({ c, i })).filter(({ c }) => c.group === def.key);
    return (
      <fieldset
        {...stylex.props(styles.fieldStack, styles.groupStack, columns === 2 && styles.groupGridTwoCol)}
        data-span={span}
        data-columns={columns}
      >
        <legend {...stylex.props(styles.groupLegend, columns === 2 && styles.groupLegendFullWidth)}>{label}</legend>
        {children.map(({ c, i }) => (
          <ViewEntryInput
            key={entryKey(c, i)}
            entry={c}
            allFields={allFields}
            values={values}
            onChange={onChange}
            locale={locale}
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
  // Every option-reading branch — the two pickers, the radio group and the
  // checkbox group — composes its visible text here, once. An author who
  // switches a field's `control` sees the same option wording afterwards.
  const optionEntries = (field.options ?? []).map((o) => ({
    value: o.value,
    text: optionText(resolveText(o.label, locale, locale) || o.value, o.attributes, locale),
  }));
  const hasOptions = optionEntries.length > 0;
  const optionElements = optionEntries.map((o) => (
    <option key={o.value} value={o.value}>
      {o.text}
    </option>
  ));
  const checked = Array.isArray(value) ? (value as string[]) : [];

  // The widget reads four things: the resolved options, `control`, `format`
  // and `type`. Within a type, the options decide first, then the control,
  // then the format. A `control` the field's own shape cannot draw falls
  // through to the type's default rather than rendering an empty group — a
  // `dataSource`-bound field resolves its options at runtime, so no
  // publish-time check can see them.
  //
  // Only a `string` and a `list` reach a picker. Those are the two types the
  // allowed-pairs table lets carry a picker's control, and a `<select>`
  // writing a string into a `number` field would fail `typeMatches`.
  let control: ReactNode;
  // A radio group and a checkbox group have no single control to label, so
  // they render as a <fieldset> whose <legend> carries the field's label. A
  // <label> would name one input and leave the rest unnamed.
  let grouped = false;
  if (def.type === "boolean") {
    if (def.control === "radio") {
      grouped = true;
      const { yes, no } = booleanLabels(locale);
      control = (
        <>
          {[
            { on: true, text: yes },
            { on: false, text: no },
          ].map((o) => (
            <label {...stylex.props(styles.option)} key={String(o.on)}>
              <input
                type="radio"
                name={def.id}
                disabled={disabled}
                checked={value === o.on}
                onChange={() => onChange(def.id, o.on)}
                {...stylex.props(styles.control, styles.checkboxRadioReset)}
              />
              <span>{o.text}</span>
            </label>
          ))}
        </>
      );
    } else {
      control = (
        <input
          type="checkbox"
          disabled={disabled}
          checked={!!value}
          onChange={(e) => onChange(def.id, e.target.checked)}
          {...stylex.props(styles.control, styles.checkboxRadioReset)}
          {...a11yProps}
        />
      );
    }
  } else if (def.type === "number") {
    control = (
      <input
        type="number"
        // An integer field steps by one, so the spinner and the browser's own
        // step check agree with the format the engine validates against.
        step={def.format === "integer" ? 1 : undefined}
        disabled={disabled}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(def.id, e.target.value === "" ? undefined : Number(e.target.value))}
        {...stylex.props(styles.control)}
        {...a11yProps}
      />
    );
  } else if (hasOptions && def.type === "string" && def.control === "radio") {
    grouped = true;
    control = (
      <>
        {optionEntries.map((o) => (
          <label {...stylex.props(styles.option)} key={o.value}>
            <input
              type="radio"
              name={def.id}
              value={o.value}
              disabled={disabled}
              checked={value === o.value}
              onChange={() => onChange(def.id, o.value)}
              {...stylex.props(styles.control, styles.checkboxRadioReset)}
            />
            <span>{o.text}</span>
          </label>
        ))}
      </>
    );
  } else if (hasOptions && def.type === "list" && def.control === "checkboxes") {
    grouped = true;
    control = (
      <>
        {optionEntries.map((o) => (
          <label {...stylex.props(styles.option)} key={o.value}>
            <input
              type="checkbox"
              value={o.value}
              disabled={disabled}
              checked={checked.includes(o.value)}
              // Rebuilt from the option order, not from click order, so the
              // stored array reads the way the author declared it.
              onChange={(e) =>
                onChange(
                  def.id,
                  optionEntries.filter((c) => (c.value === o.value ? e.target.checked : checked.includes(c.value))).map((c) => c.value),
                )
              }
              {...stylex.props(styles.control, styles.checkboxRadioReset)}
            />
            <span>{o.text}</span>
          </label>
        ))}
      </>
    );
  } else if (def.type === "list") {
    control = (
      <select
        multiple
        disabled={disabled}
        value={checked}
        onChange={(e) => onChange(def.id, Array.from(e.target.selectedOptions).map((o) => o.value))}
        {...stylex.props(styles.control)}
        {...a11yProps}
      >
        {optionElements}
      </select>
    );
  } else if (hasOptions && def.type === "string") {
    control = (
      <select
        disabled={disabled}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(def.id, e.target.value)}
        {...stylex.props(styles.control)}
        {...a11yProps}
      >
        <option value="" />
        {optionElements}
      </select>
    );
  } else if (def.type === "string" && def.control === "multiline") {
    control = (
      <textarea
        disabled={disabled}
        rows={4}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(def.id, e.target.value)}
        {...stylex.props(styles.control, styles.textareaResize)}
        {...a11yProps}
      />
    );
  } else {
    // One text-input branch for three cases: a `file` field, a plugin
    // envelope, and a plain `string`. A `string` declaring a format takes that
    // format's own native input, which enforces the same domain the engine
    // checks. A dataSource-bound picker is NOT here — its options resolve
    // server-side into `field.options`, same as a static-options field.
    control = (
      <input
        type={def.type === "string" ? NATIVE_INPUT_TYPE[def.format ?? ""] ?? "text" : "text"}
        disabled={disabled}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(def.id, e.target.value)}
        {...stylex.props(styles.control)}
        {...a11yProps}
      />
    );
  }

  const marker = field.required && (
    <span {...stylex.props(styles.requiredMarker)} title="required">
      *
    </span>
  );

  return (
    <div {...stylex.props(styles.fieldStack, span === 2 && styles.spanTwo)} data-span={span}>
      {grouped ? (
        // The group's own state lives on the <fieldset>: it is the element the
        // required and invalid state describes, and the element the issue list
        // describes. Each input inside carries its own <label>.
        <fieldset {...stylex.props(styles.fieldOptions)} {...a11yProps}>
          <legend {...stylex.props(styles.fieldLabel, styles.optionsLegendSpacing)}>
            {label}
            {marker}
          </legend>
          {control}
        </fieldset>
      ) : (
        <label {...stylex.props(styles.fieldStack)}>
          <span {...stylex.props(styles.fieldLabel)}>
            {label}
            {marker}
          </span>
          {control}
        </label>
      )}
      {hasIssues && (
        <ul {...stylex.props(styles.fieldIssues)} id={issuesId}>
          {issues.map((issue, i) => (
            <li key={i}>{issueMessage(issue, locale)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
