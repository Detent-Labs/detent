import { useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { ValueType } from "../../../shell/literalValue.js";
import {
  booleanChoice,
  comparisonIncomplete,
  initialTextState,
  parseComparisonText,
  reasonKey,
  reconcileText,
  switchComparisonField,
  switchComparisonOperator,
  valueFromChoice,
  valueTypeFor,
  type Operator,
  type RememberedTypes,
} from "./reportsLogic.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";
import type { ColumnChoice, DataComparison } from "../api/types.js";

const OPERATORS = ["eq", "ne", "in"] as const;

const styles = stylex.create({
  comparisonRow: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    flexWrap: "wrap",
    paddingBlock: space.s2,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  // A dashed border means not there yet: a comparison the query leaves out.
  comparisonRowIncomplete: {
    borderBottomStyle: "dashed",
    borderBottomColor: colors.advisory,
  },
  mono: {
    fontFamily: fonts.mono,
  },
  hint: {
    fontSize: "0.85rem",
    color: colors.textMuted,
  },
  warning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
    paddingLeft: space.s2,
  },
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
});

interface Props {
  comparison: DataComparison;
  choices: readonly ColumnChoice[];
  /** Every field type a column response named for this process (`reportsLogic.ts::rememberTypes`). */
  types: RememberedTypes;
  onChange: (next: DataComparison) => void;
  onRemove: () => void;
  locale: UiLocale;
}

/**
 * One field comparison of the report builder (`reporting-data-tables`). The
 * value control follows the compared field's declared type: text, a decimal
 * text input, or a Yes/No choice. The studio's `InstanceQueryForm.tsx` draws
 * the same row for `instance.query`.
 */
export function ComparisonRow({ comparison, choices, types, onChange, onRemove, locale }: Props) {
  const noteId = useId();
  const type = valueTypeFor(types, comparison.fieldId, comparison.value);
  const incomplete = comparisonIncomplete(comparison);
  const list = comparison.operator === "in";
  // A field the range no longer offers stays selectable, so the select shows the row's own field.
  const fieldIds = choices.some((c) => c.fieldId === comparison.fieldId)
    ? choices.map((c) => c.fieldId)
    : [comparison.fieldId, ...choices.map((c) => c.fieldId)];
  return (
    <div {...stylex.props(styles.comparisonRow, incomplete && styles.comparisonRowIncomplete)}>
      <select
        aria-label={t(locale, "builder.comparedField")}
        {...stylex.props(styles.mono)}
        translate="no"
        value={comparison.fieldId}
        onChange={(e) => onChange(switchComparisonField(comparison, e.target.value, types))}
      >
        {fieldIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <select
        aria-label={t(locale, "builder.operator")}
        value={comparison.operator}
        onChange={(e) => onChange(switchComparisonOperator(comparison, e.target.value as Operator))}
      >
        {OPERATORS.map((op) => (
          <option key={op} value={op}>
            {t(locale, `builder.op.${op}`)}
          </option>
        ))}
      </select>
      {/* A new control kind starts from the stored value, so a number's text
          never shows under a list or a Yes/No choice. */}
      <ValueControl
        key={`${type}:${list ? "list" : "one"}`}
        comparison={comparison}
        type={type}
        noteId={incomplete ? noteId : undefined}
        onChange={onChange}
        locale={locale}
      />
      {incomplete && (
        <span id={noteId} {...stylex.props(styles.srOnly)}>
          {t(locale, "builder.comparisonIncomplete")}
        </span>
      )}
      <button type="button" className="btn btn-secondary" onClick={onRemove}>
        {t(locale, "builder.removeComparison")}
      </button>
    </div>
  );
}

interface ValueControlProps {
  comparison: DataComparison;
  type: ValueType;
  /** The incomplete-row note's id, while the row is incomplete. */
  noteId: string | undefined;
  onChange: (next: DataComparison) => void;
  locale: UiLocale;
}

/**
 * The value side. It keeps its own text and parses it on each keystroke, so
 * `1.` or `a,` survives until the next character
 * (`reportsLogic.ts::reconcileText`).
 */
function ValueControl({ comparison, type, noteId, onChange, locale }: ValueControlProps) {
  const reasonId = useId();
  const hintId = useId();
  const [state, setState] = useState(() => initialTextState(comparison.value));
  const drawn = reconcileText(state, comparison.value, type, comparison.operator);
  if (drawn !== state) setState(drawn);

  const list = comparison.operator === "in";
  if (type === "boolean" && !list) {
    return (
      <select
        aria-label={t(locale, "builder.comparisonValue")}
        aria-describedby={noteId}
        value={booleanChoice(comparison.value)}
        onChange={(e) => onChange({ ...comparison, value: valueFromChoice(e.target.value) })}
      >
        <option value="">{t(locale, "builder.chooseValue")}</option>
        <option value="true">{t(locale, "builder.yes")}</option>
        <option value="false">{t(locale, "builder.no")}</option>
      </select>
    );
  }

  const parsed = parseComparisonText(drawn.text, type, comparison.operator);
  const reason = parsed.ok ? undefined : reasonKey(parsed.reason);
  const describedBy = [list ? hintId : "", reason ? reasonId : "", noteId ?? ""].filter(Boolean).join(" ");
  return (
    <>
      <input
        type="text"
        {...stylex.props(styles.mono)}
        aria-label={t(locale, "builder.comparisonValue")}
        autoComplete="off"
        spellCheck={false}
        inputMode={type === "number" && !list ? "decimal" : undefined}
        aria-invalid={reason ? true : undefined}
        aria-describedby={describedBy || undefined}
        value={drawn.text}
        onChange={(e) => {
          const text = e.target.value;
          setState({ text, seen: drawn.seen });
          const next = parseComparisonText(text, type, comparison.operator);
          onChange({ ...comparison, value: next.ok ? next.value : undefined });
        }}
      />
      {list && (
        <span id={hintId} {...stylex.props(styles.hint)}>
          {t(locale, "builder.comparisonValueHint")}
        </span>
      )}
      {reason && (
        <span id={reasonId} {...stylex.props(styles.warning)}>
          {t(locale, reason)}
        </span>
      )}
    </>
  );
}
