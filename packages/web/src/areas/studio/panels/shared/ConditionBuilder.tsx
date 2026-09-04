import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../../catalog.js";
import { inputTypeFor, isComplete, operatorsFor, type CmpOp, type Condition, type Operand, type Row } from "./conditionLogic";

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
  condition: Condition;
  operands: Operand[];
  onChange: (next: Condition) => void;
}

/** Operator labels. `in` reads as a word; the rest are the CEL symbols themselves. */
function operatorLabel(op: CmpOp): string {
  return op === "in" ? t("condition.contains") : op;
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
      type={inputTypeFor(operand)}
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
        <p {...stylex.props(styles.conditionEmpty)}>{t("condition.empty")}</p>
        <button type="button" className="btn btn-ghost condition-add" onClick={addRow} disabled={!operands.length}>
          {t("condition.addRow")}
        </button>
      </div>
    );
  }

  return (
    <div className="condition-builder">
      <ol {...stylex.props(styles.conditionRows)}>
        {condition.rows.map((row, index) => {
          const operand = row.kind === "cmp" ? byPath.get(row.operand) : undefined;
          const complete = isComplete(row, byPath);
          return (
            <li key={index} {...stylex.props(styles.conditionRow, !complete && styles.conditionRowIncomplete)}>
              {index > 0 && (
                <button type="button" {...stylex.props(styles.conditionJoiner)} onClick={flipJoiner} title={t("condition.joinerHint")}>
                  {condition.joiner}
                </button>
              )}

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

              {!complete && <span {...stylex.props(styles.conditionFlag)}>{t("condition.incomplete")}</span>}

              <button
                type="button"
                {...stylex.props(styles.conditionRemove)}
                aria-label={t("condition.removeRow")}
                onClick={() => removeRow(index)}
              >
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
