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
        <p className="condition-empty">{t("ruleBuilder.empty")}</p>
        <button type="button" className="btn btn-ghost condition-add" onClick={addRow} disabled={!operands.length}>
          {t("condition.addRow")}
        </button>
      </div>
    );
  }

  return (
    <div className="rule-builder">
      <ol className="condition-rows">
        {condition.rows.map((row, index) => {
          const operand = row.kind === "cmp" ? byPath.get(row.operand) : undefined;
          const complete = isRuleRowComplete(row, byPath);
          return (
            <li key={index} className={`condition-row${complete ? "" : " is-incomplete"}`}>
              {index > 0 && <span className="condition-joiner">{t("ruleBuilder.and")}</span>}

              {row.kind === "raw" ? (
                <input
                  type="text"
                  className="cel-input condition-raw"
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

                  <span className="studio-segmented rule-value-kind" role="group" aria-label={t("ruleBuilder.valueKindLabel")}>
                    <button
                      type="button"
                      className="studio-segmented-option"
                      aria-pressed={row.value.kind === "literal"}
                      onClick={() => updateRow(index, { ...row, value: { kind: "literal", value: undefined } })}
                    >
                      {t("ruleBuilder.valueKindLiteral")}
                    </button>
                    <button
                      type="button"
                      className="studio-segmented-option"
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

              {!complete && <span className="condition-flag">{t("condition.incomplete")}</span>}

              <button type="button" className="condition-remove" aria-label={t("condition.removeRow")} onClick={() => removeRow(index)}>
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
