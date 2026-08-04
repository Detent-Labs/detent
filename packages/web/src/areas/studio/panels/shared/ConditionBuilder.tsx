import { t } from "../../catalog.js";
import { isComplete, operatorsFor, type CmpOp, type Condition, type Operand, type Row } from "./conditionLogic";

interface Props {
  condition: Condition;
  operands: Operand[];
  onChange: (next: Condition) => void;
}

/** Operator labels. `in` reads as a word; the rest are the CEL symbols themselves. */
function operatorLabel(op: CmpOp): string {
  return op === "in" ? t("condition.contains") : op;
}

/** The native input type a value editor uses, by the field's declared type. */
function inputTypeFor(declared: string | undefined): "number" | "date" | "datetime-local" | "text" {
  if (declared === "number") return "number";
  if (declared === "date") return "date";
  if (declared === "datetime") return "datetime-local";
  return "text";
}

function ValueEditor({
  row,
  operand,
  onChange,
}: {
  row: Extract<Row, { kind: "cmp" }>;
  operand: Operand | undefined;
  onChange: (value: string | number | boolean | undefined) => void;
}) {
  const label = t("condition.valueLabel");

  if (!operand) return null;

  if (operand.celType === "bool") {
    return (
      <select
        aria-label={label}
        value={row.value === true || row.value === "true" ? "true" : "false"}
        onChange={(e) => onChange(e.target.value === "true")}
      >
        <option value="true">{t("condition.yes")}</option>
        <option value="false">{t("condition.no")}</option>
      </select>
    );
  }

  // A closed list: a select's options, an instance status, or a child outcome.
  if (operand.options?.length) {
    return (
      <select aria-label={label} value={String(row.value ?? "")} onChange={(e) => onChange(e.target.value || undefined)}>
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
      type={inputTypeFor(operand.declaredType)}
      aria-label={label}
      placeholder={t("condition.valuePlaceholder")}
      value={String(row.value ?? "")}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
  );
}

/**
 * A flat list of rows joined by one operator.
 *
 * The joiner sits in the gutter between rows rather than as a per-row control,
 * because the model carries exactly one: a per-row joiner would imply a
 * grouping the flat model does not have.
 *
 * A row the author has not finished stays visible and marked. It is builder
 * state, not body state — `toCel` leaves it out, so a half-written
 * `data.amount > ` never reaches the draft and never lands in the IssueList.
 */
export function ConditionBuilder({ condition, operands, onChange }: Props) {
  const byPath = new Map(operands.map((o) => [o.path, o]));

  const setRows = (rows: Row[]) => onChange({ ...condition, rows });
  const updateRow = (index: number, next: Row) => setRows(condition.rows.map((r, i) => (i === index ? next : r)));
  const removeRow = (index: number) => setRows(condition.rows.filter((_, i) => i !== index));

  const addRow = () => {
    const first = operands[0];
    setRows([...condition.rows, { kind: "cmp", operand: first?.path ?? "", op: operatorsFor(first?.celType ?? "string")[0], value: undefined }]);
  };

  const flipJoiner = () => onChange({ ...condition, joiner: condition.joiner === "&&" ? "||" : "&&" });

  if (!condition.rows.length) {
    return (
      <div className="condition-builder">
        <p className="condition-empty">{t("condition.empty")}</p>
        <button type="button" className="condition-add" onClick={addRow} disabled={!operands.length}>
          {t("condition.addRow")}
        </button>
      </div>
    );
  }

  return (
    <div className="condition-builder">
      <ol className="condition-rows">
        {condition.rows.map((row, index) => {
          const operand = row.kind === "cmp" ? byPath.get(row.operand) : undefined;
          const complete = isComplete(row, byPath);
          return (
            <li key={index} className={`condition-row${complete ? "" : " is-incomplete"}`}>
              {index > 0 && (
                <button type="button" className="condition-joiner" onClick={flipJoiner} title={t("condition.joinerHint")}>
                  {condition.joiner}
                </button>
              )}

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
                      // The operand's type governs the operators and the literal,
                      // so a switch resets both rather than keeping a stale pair.
                      updateRow(index, {
                        kind: "cmp",
                        operand: e.target.value,
                        op: operatorsFor(next?.celType ?? "string")[0],
                        value: undefined,
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
                        {operatorLabel(op)}
                      </option>
                    ))}
                  </select>

                  <ValueEditor row={row} operand={operand} onChange={(value) => updateRow(index, { ...row, value })} />
                </>
              )}

              {!complete && <span className="condition-flag">{t("condition.incomplete")}</span>}

              <button
                type="button"
                className="condition-remove"
                aria-label={t("condition.removeRow")}
                onClick={() => removeRow(index)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ol>

      <button type="button" className="condition-add" onClick={addRow} disabled={!operands.length}>
        {t("condition.addRow")}
      </button>
    </div>
  );
}
