import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../../catalog.js";
import { inputTypeFor, operatorsFor, type CmpOp } from "./conditionLogic";
import {
  fieldValueOperandsFor,
  isRuleRowComplete,
  newRuleRow,
  type RuleCondition,
  type RuleOperand,
  type RuleRow,
} from "./ruleLogic";

const styles = stylex.create({
  conditionEmpty: {
    margin: 0,
    color: colors.textMuted,
    fontSize: "0.9rem",
  },
  conditionRows: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
  },
  conditionRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.s2,
    padding: space.s2,
    border: `1px solid ${colors.border}`,
    background: colors.surfaceMuted,
  },
  conditionRowIncomplete: {
    borderColor: colors.accent400,
    borderStyle: "dashed",
  },
  conditionJoiner: {
    background: "none",
    color: colors.accent,
    fontFamily: fonts.mono,
    fontWeight: 600,
    paddingBlock: 0,
    paddingInline: space.s1,
    minWidth: "2.5ch",
  },
  conditionRaw: {
    flex: "1 1 20ch",
    minWidth: 0,
    fontFamily: fonts.mono,
  },
  // `.studio-segmented` merged with its own `.rule-value-kind` override
  // (app.css `.studio-segmented.rule-value-kind { margin: 0 }`): this file
  // renders only that combined variant, never the bare segmented control.
  ruleValueKind: {
    display: "flex",
    gap: 0,
    border: "none",
    padding: 0,
    margin: 0,
  },
  // `.studio-segmented-option` merged with the `.rule-value-kind` descendant
  // override, for the same reason.
  segmentedOption: {
    flex: "none",
    background: "none",
    color: colors.text,
    border: `1px solid ${colors.border}`,
    paddingBlock: "2px",
    paddingInline: space.s2,
    font: "inherit",
    cursor: "pointer",
    fontSize: "0.8rem",
    ":hover": {
      background: colors.surfaceMuted,
    },
  },
  // `.studio-segmented-option + .studio-segmented-option { border-left: none }`:
  // this file always renders exactly two options, so the second one's own
  // style applies the sibling override statically.
  segmentedOptionSecond: {
    borderLeft: "none",
  },
  // The stamp, read off `aria-pressed` — a JS-computed choice, not a
  // reproduced attribute selector.
  segmentedOptionPressed: {
    borderColor: colors.accent,
    color: colors.accent,
    boxShadow: `inset 0 -2px 0 ${colors.accent}`,
  },
  conditionFlag: {
    color: colors.refusal,
    fontSize: "0.85rem",
  },
  conditionRemove: {
    background: "none",
    color: colors.textMuted,
    fontSize: "1.1rem",
    lineHeight: 1,
    paddingBlock: space.s1,
    paddingInline: space.s2,
    marginLeft: "auto",
    ":hover": {
      color: colors.refusal,
    },
  },
});

interface Props {
  condition: RuleCondition;
  operands: RuleOperand[];
  onChange: (next: RuleCondition) => void;
}


function LiteralEditor({
  row,
  operand,
  onChange,
}: {
  row: Extract<RuleRow, { kind: "cmp" }>;
  operand: RuleOperand | undefined;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  const label = t("condition.valueLabel");
  const current = row.value.kind === "literal" ? row.value.value : undefined;

  if (!operand) return null;

  if (operand.celType === "bool") {
    return (
      <select aria-label={label} value={current === true || current === "true" ? "true" : "false"} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">{t("condition.yes")}</option>
        <option value="false">{t("condition.no")}</option>
      </select>
    );
  }

  if (operand.options?.length) {
    return (
      <select aria-label={label} value={String(current ?? "")} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t("condition.selectValue")}</option>
        {operand.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={inputTypeFor(operand)}
      aria-label={label}
      placeholder={t("condition.valuePlaceholder")}
      value={String(current ?? "")}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
  );
}

/**
 * A field's `validation.rule` as a flat list of rows, joined by "and" only —
 * `ConditionBuilder`'s row shape and CEL-readout convention, over a
 * different operand model: "this answer" by default, and a value side that
 * is either a literal or another catalog field (design.md's decision, not
 * `ConditionBuilder` itself: neither a path guard nor a view override has a
 * concept of "this field's own answer").
 */
export function RuleBuilder({ condition, operands, onChange }: Props) {
  const byPath = new Map(operands.map((o) => [o.path, o]));

  const setRows = (rows: RuleRow[]) => onChange({ rows });
  const updateRow = (index: number, next: RuleRow) => setRows(condition.rows.map((r, i) => (i === index ? next : r)));
  const removeRow = (index: number) => setRows(condition.rows.filter((_, i) => i !== index));
  const addRow = () => setRows([...condition.rows, newRuleRow(operands)]);

  if (!condition.rows.length) {
    return (
      <div className="rule-builder">
        <p {...stylex.props(styles.conditionEmpty)}>{t("ruleBuilder.empty")}</p>
        <button type="button" className="btn btn-ghost condition-add" onClick={addRow} disabled={!operands.length}>
          {t("condition.addRow")}
        </button>
      </div>
    );
  }

  return (
    <div className="rule-builder">
      <ol {...stylex.props(styles.conditionRows)}>
        {condition.rows.map((row, index) => {
          const operand = row.kind === "cmp" ? byPath.get(row.operand) : undefined;
          const complete = isRuleRowComplete(row, byPath);
          return (
            <li key={index} {...stylex.props(styles.conditionRow, !complete && styles.conditionRowIncomplete)}>
              {index > 0 && <span {...stylex.props(styles.conditionJoiner)}>{t("ruleBuilder.and")}</span>}

              {row.kind === "raw" ? (
                <input
                  type="text"
                  className={`cel-input ${stylex.props(styles.conditionRaw).className}`}
                  aria-label={t("condition.rawRow")}
                  value={row.src}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => updateRow(index, { kind: "raw", src: e.target.value })}
                />
              ) : (
                <>
                  <select
                    aria-label={t("condition.operandLabel")}
                    value={row.operand}
                    onChange={(e) => {
                      const next = byPath.get(e.target.value);
                      updateRow(index, {
                        kind: "cmp",
                        operand: e.target.value,
                        op: operatorsFor(next?.celType ?? "string")[0]!,
                        value: { kind: "literal", value: undefined },
                      });
                    }}
                  >
                    <option value="">{t("condition.selectOperand")}</option>
                    {operands.map((o) => (
                      <option key={o.path} value={o.path}>
                        {o.label}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label={t("condition.operatorLabel")}
                    value={row.op}
                    onChange={(e) => updateRow(index, { ...row, op: e.target.value as CmpOp })}
                  >
                    {operatorsFor(operand?.celType ?? "string").map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>

                  <span {...stylex.props(styles.ruleValueKind)} role="group" aria-label={t("ruleBuilder.valueKindLabel")}>
                    <button
                      type="button"
                      {...stylex.props(styles.segmentedOption, row.value.kind === "literal" && styles.segmentedOptionPressed)}
                      aria-pressed={row.value.kind === "literal"}
                      onClick={() => updateRow(index, { ...row, value: { kind: "literal", value: undefined } })}
                    >
                      {t("ruleBuilder.valueKindLiteral")}
                    </button>
                    <button
                      type="button"
                      {...stylex.props(
                        styles.segmentedOption,
                        styles.segmentedOptionSecond,
                        row.value.kind === "field" && styles.segmentedOptionPressed,
                      )}
                      aria-pressed={row.value.kind === "field"}
                      onClick={() => updateRow(index, { ...row, value: { kind: "field", path: "" } })}
                    >
                      {t("ruleBuilder.valueKindField")}
                    </button>
                  </span>

                  {row.value.kind === "literal" ? (
                    <LiteralEditor row={row} operand={operand} onChange={(value) => updateRow(index, { ...row, value: { kind: "literal", value } })} />
                  ) : (
                    <select
                      aria-label={t("ruleBuilder.selectValueField")}
                      value={row.value.path}
                      onChange={(e) => updateRow(index, { ...row, value: { kind: "field", path: e.target.value } })}
                    >
                      <option value="">{t("ruleBuilder.selectValueField")}</option>
                      {fieldValueOperandsFor(row.operand, operands).map((o) => (
                        <option key={o.path} value={o.path}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}

              {!complete && <span {...stylex.props(styles.conditionFlag)}>{t("condition.incomplete")}</span>}

              <button type="button" {...stylex.props(styles.conditionRemove)} aria-label={t("condition.removeRow")} onClick={() => removeRow(index)}>
                ×
              </button>
            </li>
          );
        })}
      </ol>

      <button type="button" className="btn btn-ghost condition-add" onClick={addRow} disabled={!operands.length}>
        {t("condition.addRow")}
      </button>
    </div>
  );
}
