import { useEffect, useRef, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../../catalog.js";
import { ghost } from "./btn";
import {
  boolChoiceOf,
  boolValueOf,
  fieldValueCandidates,
  inputTypeFor,
  isComplete,
  newGroup,
  newLeaf,
  operatorsFor,
  operatorWord,
  withoutRow,
  type CmpOp,
  type Condition,
  type GroupRow as GroupRowModel,
  type Leaf,
  type Literal,
  type Operand,
  type OperandGroup,
  type Row,
  type RowAt,
} from "./conditionLogic";

const styles = stylex.create({
  conditionRows: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
  },
  // A group's own list: indented 16px from a 2px rule in the border role, the
  // note's idiom.
  groupRows: {
    paddingInlineStart: space.s4,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
  },
  conditionRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.s2,
    padding: space.s2,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  // A row inside a group steps one neutral role from the group's ledger.
  innerRow: {
    backgroundColor: colors.surface,
  },
  groupRow: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space.s2,
    padding: space.s2,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  groupHead: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space.s2,
    minWidth: 0,
  },
  conditionRowIncomplete: {
    borderColor: colors.advisory,
    borderStyle: "dashed",
  },
  conditionJoiner: {
    backgroundColor: "transparent",
    // Accent text on the row's muted ground reads the role made for it.
    color: colors.accentOnMuted,
    fontWeight: 800,
    paddingBlock: 0,
    paddingInline: space.s1,
    minWidth: "2.5ch",
  },
  // The group's joiner as a word: the group's head sets it, so it reads as
  // text and not as the accent of a control.
  conditionJoinerWord: {
    color: colors.textMuted,
    fontWeight: 800,
    paddingInline: space.s1,
    minWidth: "2.5ch",
  },
  conditionRawSentence: {
    flex: "1 1 20ch",
    minWidth: 0,
    maxWidth: "100%",
    color: colors.textMuted,
    fontSize: "0.9rem",
  },
  // A select sizes to its longest option, which can outgrow a narrow column:
  // the row's controls shrink to the row instead.
  conditionControl: {
    maxWidth: "100%",
    minWidth: 0,
  },
  // The value editor with its swap command under it.
  valueSide: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s1,
    minWidth: 0,
    maxWidth: "100%",
  },
  // The authoring command (`DESIGN.md` Buttons): a ghost button in slate, mono
  // at 11px, as `ConditionInput.tsx`'s clear command. It composes over
  // `btn btn-ghost`, whose accent it replaces.
  command: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    fontFamily: fonts.mono,
    fontSize: 11,
    color: {
      default: colors.textMuted,
      ":hover": colors.text,
      ":active": colors.text,
    },
    textAlign: "left",
    overflowWrap: "anywhere",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceMuted,
      ":active": `color-mix(in srgb, ${colors.text} 14%, transparent)`,
    },
  },
  conditionFlag: {
    color: colors.refusal,
    fontSize: "0.85rem",
  },
  conditionRemove: {
    backgroundColor: "transparent",
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
  /** The id of the sentence that reads the rows, set on the rows' list as
   * `aria-describedby`. */
  describedBy?: string;
}

type Comparison = Extract<Leaf, { kind: "cmp" }>;

const GROUP_ORDER: readonly OperandGroup[] = ["fields", "child", "case", "person"];

const joinerWord = (joiner: Condition["joiner"]) => t(joiner === "&&" ? "condition.joiner.and" : "condition.joiner.or");

/** The operand options, under one `<optgroup>` per group that holds a member.
 * An operand with no group follows the groups, under no heading. */
function OperandOptions({ operands }: { operands: Operand[] }) {
  const option = (o: Operand) => (
    <option key={o.path} value={o.path}>
      {o.label}
    </option>
  );
  return (
    <>
      {GROUP_ORDER.map((group) => {
        const members = operands.filter((o) => o.group === group);
        return members.length ? (
          <optgroup key={group} label={t(`condition.group.${group}`)}>
            {members.map(option)}
          </optgroup>
        ) : null;
      })}
      {operands.filter((o) => !o.group).map(option)}
    </>
  );
}

/** The literal editor the operand's type picks. */
function ValueEditor({ value, operand, onChange }: { value: Literal; operand: Operand; onChange: (value: Literal) => void }) {
  const label = t("condition.valueLabel");

  if (operand.celType === "bool") {
    return (
      <select
        {...stylex.props(styles.conditionControl)}
        aria-label={label}
        value={boolChoiceOf(value)}
        onChange={(e) => onChange(boolValueOf(e.target.value))}
      >
        <option value="">{t("condition.selectValue")}</option>
        <option value="true">{t("condition.yes")}</option>
        <option value="false">{t("condition.no")}</option>
      </select>
    );
  }

  // A closed list: a select's options, an instance status, or a child outcome.
  if (operand.options?.length) {
    return (
      <select
        {...stylex.props(styles.conditionControl)}
        aria-label={label}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
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
      {...stylex.props(styles.conditionControl)}
      type={inputTypeFor(operand)}
      aria-label={label}
      placeholder={t("condition.valuePlaceholder")}
      value={String(value ?? "")}
      spellCheck={false}
      autoComplete="off"
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
    />
  );
}

/** The top level's joiner, between two rows: one press flips it. */
function JoinerButton({ joiner, onFlip }: { joiner: Condition["joiner"]; onFlip: () => void }) {
  return (
    <button type="button" {...stylex.props(styles.conditionJoiner)} onClick={onFlip} title={t("condition.joinerHint")}>
      {joinerWord(joiner)}
    </button>
  );
}

/** A group's joiner between two of its rows. The group's head sets it. */
function JoinerWord({ joiner }: { joiner: Condition["joiner"] }) {
  return <span {...stylex.props(styles.conditionJoinerWord)}>{joinerWord(joiner)}</span>;
}

function RemoveControl({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" {...stylex.props(styles.conditionRemove)} aria-label={label} data-condition-remove="" onClick={onRemove}>
      ×
    </button>
  );
}

interface LeafProps {
  operands: Operand[];
  byPath: Map<string, Operand>;
  /** What leads the row: the joiner between it and the row before. */
  gutter?: ReactNode;
  /** The row's ground, where its level steps from the default. */
  xstyle?: stylex.StyleXStyles;
  onChange: (next: Leaf) => void;
  onRemove: () => void;
}

/** One leaf's `<li>`: the gutter, the leaf's own controls, its incomplete flag
 * and its remove control. */
function LeafItem({ leaf, byPath, gutter, xstyle, onRemove, children }: Pick<LeafProps, "byPath" | "gutter" | "xstyle" | "onRemove"> & { leaf: Leaf; children: ReactNode }) {
  const complete = isComplete(leaf, byPath);
  return (
    <li {...stylex.props(styles.conditionRow, xstyle, !complete && styles.conditionRowIncomplete)}>
      {gutter}
      {children}
      {!complete && <span {...stylex.props(styles.conditionFlag)}>{t("condition.incomplete")}</span>}
      <RemoveControl label={t("condition.removeRow")} onRemove={onRemove} />
    </li>
  );
}

/**
 * A comparison: the operand, the operator and the value side. The value side
 * is the literal editor or the field picker, with the command that swaps them
 * under it. The same component draws a row at the top level and in a group.
 */
export function ComparisonRow({ row, operands, byPath, gutter, xstyle, onChange, onRemove }: LeafProps & { row: Comparison }) {
  const operand = byPath.get(row.operand);
  const candidates = fieldValueCandidates(row.operand, operands);
  // A read-back field value keeps its way back to a literal, candidate or not.
  const swappable = row.value.kind === "field" || candidates.length > 0;

  return (
    <LeafItem leaf={row} byPath={byPath} gutter={gutter} xstyle={xstyle} onRemove={onRemove}>
      <select
        {...stylex.props(styles.conditionControl)}
        aria-label={t("condition.operandLabel")}
        value={row.operand}
        onChange={(e) => {
          const next = byPath.get(e.target.value);
          // The operand's type governs the operators and the value, so a
          // switch resets both rather than keeping a stale pair.
          onChange({
            kind: "cmp",
            operand: e.target.value,
            op: operatorsFor(next?.celType ?? "string", next?.format)[0]!,
            value: { kind: "literal", value: undefined },
          });
        }}
      >
        <option value="">{t("condition.selectOperand")}</option>
        <OperandOptions operands={operands} />
      </select>

      <select
        {...stylex.props(styles.conditionControl)}
        aria-label={t("condition.operatorLabel")}
        value={row.op}
        onChange={(e) => onChange({ ...row, op: e.target.value as CmpOp })}
      >
        {operatorsFor(operand?.celType ?? "string", operand?.format).map((op) => (
          <option key={op} value={op}>
            {operatorWord(op, operand)}
          </option>
        ))}
      </select>

      {operand && (
        <span {...stylex.props(styles.valueSide)}>
          {row.value.kind === "literal" ? (
            <ValueEditor
              value={row.value.value}
              operand={operand}
              onChange={(value) => onChange({ ...row, value: { kind: "literal", value } })}
            />
          ) : (
            <select
              {...stylex.props(styles.conditionControl)}
              aria-label={t("condition.valueField.label")}
              value={row.value.path}
              onChange={(e) => onChange({ ...row, value: { kind: "field", path: e.target.value } })}
            >
              <option value="">{t("condition.selectOperand")}</option>
              <OperandOptions operands={candidates} />
            </select>
          )}
          {swappable && (
            <button
              type="button"
              {...ghost(styles.command)}
              onClick={() =>
                onChange({
                  ...row,
                  value: row.value.kind === "literal" ? { kind: "field", path: "" } : { kind: "literal", value: undefined },
                })
              }
            >
              {t(row.value.kind === "literal" ? "condition.valueField.toField" : "condition.valueField.toLiteral")}
            </button>
          )}
        </span>
      )}
    </LeafItem>
  );
}

/** A fragment the builder cannot show as a comparison: a sentence in place of
 * its text, which the Developer view holds. */
function RawRow({ row, byPath, gutter, xstyle, onRemove }: LeafProps & { row: Extract<Leaf, { kind: "raw" }> }) {
  return (
    <LeafItem leaf={row} byPath={byPath} gutter={gutter} xstyle={xstyle} onRemove={onRemove}>
      <span {...stylex.props(styles.conditionRawSentence)}>{t("condition.rawRowSentence")}</span>
    </LeafItem>
  );
}

function LeafRow({ leaf, ...props }: LeafProps & { leaf: Leaf }) {
  return leaf.kind === "cmp" ? <ComparisonRow row={leaf} {...props} /> : <RawRow row={leaf} {...props} />;
}

/**
 * A group: the head, the group's own rows indented under it, and the command
 * that adds a row inside. The head holds the group's joiner select, the
 * group's incomplete flag and its remove control. Inside the group the gutter
 * prints the joiner as a word: the head's select is the one way to set it.
 *
 * `onRemove` takes the inner row's index, or none for the whole group.
 */
export function GroupRow({
  row,
  operands,
  byPath,
  gutter,
  onChange,
  onRemove,
}: {
  row: GroupRowModel;
  operands: Operand[];
  byPath: Map<string, Operand>;
  gutter?: ReactNode;
  onChange: (next: GroupRowModel) => void;
  onRemove: (inner?: number) => void;
}) {
  const complete = isComplete(row, byPath);
  return (
    <li {...stylex.props(styles.groupRow, !complete && styles.conditionRowIncomplete)}>
      <div {...stylex.props(styles.groupHead)}>
        {gutter}
        <select
          {...stylex.props(styles.conditionControl)}
          aria-label={t("condition.groupRow.joinerLabel")}
          value={row.joiner}
          onChange={(e) => onChange({ ...row, joiner: e.target.value as GroupRowModel["joiner"] })}
        >
          <option value="||">{t("condition.groupRow.any")}</option>
          <option value="&&">{t("condition.groupRow.all")}</option>
        </select>
        {!complete && <span {...stylex.props(styles.conditionFlag)}>{t("condition.groupRow.incomplete")}</span>}
        <RemoveControl label={t("condition.groupRow.remove")} onRemove={() => onRemove()} />
      </div>
      <ol {...stylex.props(styles.conditionRows, styles.groupRows)}>
        {row.rows.map((leaf, inner) => (
          <LeafRow
            key={inner}
            leaf={leaf}
            operands={operands}
            byPath={byPath}
            gutter={inner > 0 ? <JoinerWord joiner={row.joiner} /> : undefined}
            xstyle={styles.innerRow}
            onChange={(next) => onChange({ ...row, rows: row.rows.map((r, i) => (i === inner ? next : r)) })}
            onRemove={() => onRemove(inner)}
          />
        ))}
      </ol>
      <button type="button" {...ghost(styles.command)} onClick={() => onChange({ ...row, rows: [...row.rows, newLeaf(operands)] })}>
        {t("condition.groupRow.addRow")}
      </button>
    </li>
  );
}

/**
 * The index of the remove control that takes focus once the control at
 * `removed` is gone and `remaining` controls stand: the control now at that
 * index, else the one before it. `null` when none stands, and the add-row
 * button takes focus.
 */
export function removeFocusIndex(removed: number, remaining: number): number | null {
  if (removed < remaining) return removed;
  return remaining > 0 ? remaining - 1 : null;
}

/**
 * The DOM index, among the remove controls, of the first control the removal
 * at `at` takes away. A group's control stands before its rows'. Removing a
 * group's last row takes the group, so the index is the group's own.
 */
export function removeControlIndex(rows: Row[], at: RowAt): number {
  const before = rows.slice(0, at.row).reduce((n, r) => n + (r.kind === "group" ? 1 + r.rows.length : 1), 0);
  const target = rows[at.row];
  if (at.inner === undefined || target?.kind !== "group" || target.rows.length === 1) return before;
  return before + 1 + at.inner;
}

/**
 * The rows, joined by the condition's one operator, and a group per level of
 * the other. The joiner sits in the gutter between rows rather than as a
 * per-row control: one level carries exactly one.
 *
 * A row the author has not finished stays visible and marked. It is builder
 * state, not body state — `toCel` leaves it out, so a half-written
 * `data.amount > ` never reaches the draft and never lands in the IssueList.
 */
export function ConditionBuilder({ condition, operands, onChange, describedBy }: Props) {
  const byPath = new Map(operands.map((o) => [o.path, o]));

  const setRows = (rows: Row[]) => onChange({ ...condition, rows });
  const updateRow = (index: number, next: Row) => setRows(condition.rows.map((r, i) => (i === index ? next : r)));
  // A removal unmounts the pressed control, which would drop focus to <body>;
  // the effect below runs once the next render has drawn the control to land on.
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusAfterRemove, setFocusAfterRemove] = useState<number | null>(null);

  const removeRow = (at: RowAt) => {
    setFocusAfterRemove(removeControlIndex(condition.rows, at));
    onChange(withoutRow(condition, at));
  };

  useEffect(() => {
    if (focusAfterRemove === null) return;
    setFocusAfterRemove(null);
    const root = rootRef.current;
    if (!root) return;
    const removes = root.querySelectorAll<HTMLElement>("button[data-condition-remove]");
    const at = removeFocusIndex(focusAfterRemove, removes.length);
    (at === null ? root.querySelector<HTMLElement>("button.condition-add") : removes.item(at))?.focus();
  }, [focusAfterRemove]);

  const flipJoiner = () => onChange({ ...condition, joiner: condition.joiner === "&&" ? "||" : "&&" });

  return (
    <div ref={rootRef} className="condition-builder">
      {condition.rows.length > 0 && (
        <ol {...stylex.props(styles.conditionRows)} aria-describedby={describedBy}>
          {condition.rows.map((row, index) => {
            const gutter = index > 0 ? <JoinerButton joiner={condition.joiner} onFlip={flipJoiner} /> : undefined;
            return row.kind === "group" ? (
              <GroupRow
                key={index}
                row={row}
                operands={operands}
                byPath={byPath}
                gutter={gutter}
                onChange={(next) => updateRow(index, next)}
                onRemove={(inner) => removeRow({ row: index, inner })}
              />
            ) : (
              <LeafRow
                key={index}
                leaf={row}
                operands={operands}
                byPath={byPath}
                gutter={gutter}
                onChange={(next) => updateRow(index, next)}
                onRemove={() => removeRow({ row: index })}
              />
            );
          })}
        </ol>
      )}

      <button type="button" className="btn btn-ghost condition-add" onClick={() => setRows([...condition.rows, newLeaf(operands)])} disabled={!operands.length}>
        {t("condition.addRow")}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setRows([...condition.rows, newGroup(condition.joiner, operands)])}
        disabled={!operands.length}
      >
        {t("condition.groupRow.add")}
      </button>
    </div>
  );
}
