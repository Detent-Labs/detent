import { useId, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { ValueType } from "../../../../shell/literalValue.js";
import { t } from "../../catalog.js";
import { listProcesses } from "../../api/client.js";
import { useFetchOnce } from "./useFetchOnce.js";
import { useTargetProcessCatalog, type TargetProcessCatalog, type TargetRef } from "./useTargetProcessCatalog.js";
import { attributeRecord, attributesToCommit, duplicateRowIds, reseedRows, rowsFromRecord, type AttributeRow } from "./attributeRows.js";
import { nextRowId } from "../../screens/migrationPlanLogic.js";
import {
  booleanChoice,
  comparisonType,
  initialTextState,
  parseComparisonText,
  reasonKey,
  reconcileText,
  rightSideOptions,
  rowIncomplete,
  switchField,
  switchOperator,
  switchRightSide,
  syncRowIds,
  valueFromChoice,
  withoutRowId,
  withValue,
  type Operator,
  type RightSide,
  type WhereEntry,
} from "./comparisonRow.js";

const styles = stylex.create({
  instanceQueryForm: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s3,
    width: "100%",
  },
  // `.instance-query-form > label`: direct children only, the one top-level
  // process picker.
  instanceQueryFormLabel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.9rem",
    width: "100%",
  },
  instanceQueryFormFieldset: {
    borderWidth: 0,
    margin: 0,
    padding: 0,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s1,
    width: "100%",
  },
  // `.instance-query-form-steps > legend` and its three siblings: direct
  // children only.
  instanceQueryFormLegend: {
    padding: 0,
    fontSize: "0.9rem",
    fontWeight: 800,
  },
  instanceQueryFormOption: {
    display: "flex",
    alignItems: "center",
    gap: space.s1,
  },
  instanceQueryFormLabelField: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: space.s1,
    width: "100%",
  },
  instanceQueryFormRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBottom: space.s2,
  },
  // A dashed border means not there yet: a row the engine cannot run, or one
  // the config does not hold.
  instanceQueryFormRowIncomplete: {
    borderBottomStyle: "dashed",
    borderBottomColor: colors.advisory,
  },
  instanceQueryFormHint: {
    color: colors.textMuted,
    fontSize: "0.85rem",
  },
  studioMono: {
    fontFamily: fonts.mono,
  },
  studioWarning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
    paddingLeft: space.s2,
  },
});

interface Props {
  token: string;
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** The reading (own) process's own fields — the comparison right side's "field of my own process" option. */
  ownFields: TargetRef[];
}

interface ViewProps extends Omit<Props, "token"> {
  processes: Awaited<ReturnType<typeof listProcesses>> | undefined;
  /** `undefined` while loading and after a failed fetch. */
  catalog: TargetProcessCatalog | undefined;
  catalogError: boolean;
}

/**
 * A picked reference the target catalog does not carry — the publish-time
 * reference check reports this rather than rejecting it, so the form marks it
 * too. Only a loaded catalog can tell, so `known` is `undefined` before then.
 */
function StaleMark({ id, known }: { id: string; known: boolean | undefined }) {
  if (!id || known !== false) return null;
  return <span {...stylex.props(styles.studioWarning)}>{t("instanceQuery.staleReference")}</span>;
}

function FieldOptions({ fields }: { fields: readonly TargetRef[] }) {
  return fields.map((f) => (
    <option key={f.id} value={f.id}>
      {f.label} ({f.key})
    </option>
  ));
}

const STATUSES = ["running", "completed", "cancelled", "faulted"] as const;

/**
 * The purpose-built `"instance.query"` config editor (`studio-plugin-config-form`).
 * Pickers for the target process, its steps and its fields, drawn from the
 * union of every published version's catalog (`useTargetProcessCatalog`) —
 * free-text ids are the error the plugin `type` picker already removed
 * elsewhere. Commits the plain `{ processId, stepIds, statuses, where,
 * labelFieldId, attributes }` config shape the raw JSON path would.
 */
export function InstanceQueryForm({ token, config, onChange, ownFields }: Props) {
  const processes = useFetchOnce(token, listProcesses);
  const processId = typeof config.processId === "string" ? config.processId : "";
  const { catalog, error } = useTargetProcessCatalog(token, processId || undefined);
  return <InstanceQueryFormView processes={processes} catalog={catalog} catalogError={error} config={config} onChange={onChange} ownFields={ownFields} />;
}

/** The form without its fetches, so a static render can draw each catalog state. */
export function InstanceQueryFormView({ processes, catalog, catalogError, config, onChange, ownFields }: ViewProps) {
  const processId = typeof config.processId === "string" ? config.processId : "";
  const stepIds = Array.isArray(config.stepIds) ? (config.stepIds as string[]) : [];
  const statuses = Array.isArray(config.statuses) ? (config.statuses as string[]) : [];
  const where = Array.isArray(config.where) ? (config.where as WhereEntry[]) : [];
  const labelFieldId = typeof config.labelFieldId === "string" ? config.labelFieldId : "";

  const knownStepIds = catalog && new Set(catalog.steps.map((s) => s.id));
  const knownFieldIds = catalog && new Set(catalog.fields.map((f) => f.id));
  const fieldOptions = catalog?.fields ?? [];

  const set = (patch: Record<string, unknown>) => onChange({ ...config, ...patch });

  const toggleStep = (id: string) => set({ stepIds: stepIds.includes(id) ? stepIds.filter((s) => s !== id) : [...stepIds, id] });
  // An explicit empty `statuses` fails the config schema's `.min(1)` (it means "caller
  // error", not "default to running") — so unchecking the last box omits the key
  // instead, falling back to the schema's own implicit `["running"]` default.
  const toggleStatus = (s: string) => {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
    if (next.length > 0) return set({ statuses: next });
    const withoutStatuses = { ...config };
    delete withoutStatuses.statuses;
    onChange(withoutStatuses);
  };

  // One key per comparison row, so a removal never hands one row's text to
  // the next (`comparisonRow.ts::syncRowIds`).
  const [rowIds, setRowIds] = useState(() => where.map(() => nextRowId()));
  const syncedIds = syncRowIds(rowIds, where.length);
  if (syncedIds) setRowIds(syncedIds);
  const whereIds = syncedIds ?? rowIds;

  const replaceWhere = (i: number, next: WhereEntry) => set({ where: where.map((w, idx) => (idx === i ? next : w)) });
  const addWhere = () => {
    setRowIds([...whereIds, nextRowId()]);
    set({ where: [...where, { operator: "eq" as const }] });
  };
  const removeWhere = (i: number) => {
    setRowIds(withoutRowId(whereIds, i));
    set({ where: where.filter((_, idx) => idx !== i) });
  };

  const statusesFieldset = (
    <fieldset {...stylex.props(styles.instanceQueryFormFieldset)}>
      <legend {...stylex.props(styles.instanceQueryFormLegend)}>{t("instanceQuery.statuses")}</legend>
      {STATUSES.map((s) => (
        <label key={s} {...stylex.props(styles.instanceQueryFormOption)}>
          <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />
          {s}
        </label>
      ))}
    </fieldset>
  );

  return (
    <div {...stylex.props(styles.instanceQueryForm)}>
      <label {...stylex.props(styles.instanceQueryFormLabel)}>
        {t("instanceQuery.process")}
        <select value={processId} onChange={(e) => set({ processId: e.target.value })}>
          <option value="">{t("instanceQuery.pickProcess")}</option>
          {(processes ?? []).map((p) => (
            <option key={p.processId} value={p.processId}>
              {p.key} ({p.processId})
            </option>
          ))}
        </select>
      </label>

      {processId && catalogError && (
        <>
          <p {...stylex.props(styles.studioWarning)}>{t("instanceQuery.catalogError")}</p>
          {statusesFieldset}
        </>
      )}

      {processId && !catalogError && (
        <>
          <fieldset {...stylex.props(styles.instanceQueryFormFieldset)}>
            <legend {...stylex.props(styles.instanceQueryFormLegend)}>{t("instanceQuery.steps")}</legend>
            {catalog?.steps.map((s) => (
              <label key={s.id} {...stylex.props(styles.instanceQueryFormOption)}>
                <input type="checkbox" checked={stepIds.includes(s.id)} onChange={() => toggleStep(s.id)} />
                {s.label} <span {...stylex.props(styles.studioMono)}>({s.key})</span>
              </label>
            ))}
            {knownStepIds &&
              stepIds
                .filter((id) => !knownStepIds.has(id))
                .map((id) => (
                  <p key={id} {...stylex.props(styles.studioWarning)}>
                    {t("instanceQuery.staleReference")} <span {...stylex.props(styles.studioMono)}>{id}</span>
                  </p>
                ))}
          </fieldset>

          {statusesFieldset}

          <div {...stylex.props(styles.instanceQueryFormLabelField)}>
            <label>
              {t("instanceQuery.labelField")}
              <select value={labelFieldId} onChange={(e) => set({ labelFieldId: e.target.value })}>
                <option value="">{t("instanceQuery.pickField")}</option>
                <FieldOptions fields={fieldOptions} />
              </select>
            </label>
            <StaleMark id={labelFieldId} known={knownFieldIds?.has(labelFieldId)} />
          </div>
        </>
      )}

      {/* Drawn on a catalog error too, so the stored comparisons and
          attributes stay in sight. Their literal controls then refuse input. */}
      {processId && (
        <>
          <fieldset {...stylex.props(styles.instanceQueryFormFieldset)}>
            <legend {...stylex.props(styles.instanceQueryFormLegend)}>{t("instanceQuery.comparisons")}</legend>
            {where.map((w, i) => (
              <ComparisonRow
                key={whereIds[i]}
                entry={w}
                fields={catalog?.fields}
                ownFields={ownFields}
                onChange={(next) => replaceWhere(i, next)}
                onRemove={() => removeWhere(i)}
              />
            ))}
            <button type="button" className="btn btn-secondary" onClick={addWhere}>
              {t("instanceQuery.addComparison")}
            </button>
          </fieldset>

          <AttributeRows
            attributes={config.attributes}
            fieldOptions={fieldOptions}
            knownFieldIds={knownFieldIds}
            onCommit={(attributes) => set({ attributes })}
          />
        </>
      )}
    </div>
  );
}

interface ComparisonRowProps {
  entry: WhereEntry;
  /** The target catalog's fields, `undefined` while it loads. */
  fields: readonly TargetRef[] | undefined;
  ownFields: readonly TargetRef[];
  onChange: (next: WhereEntry) => void;
  onRemove: () => void;
}

function ComparisonRow({ entry, fields, ownFields, onChange, onRemove }: ComparisonRowProps) {
  const type = comparisonType(fields, entry.fieldId);
  const side: RightSide = entry.valueFromField !== undefined ? "field" : "literal";
  const list = entry.operator === "in";
  return (
    <div {...stylex.props(styles.instanceQueryFormRow, rowIncomplete(entry) && styles.instanceQueryFormRowIncomplete)}>
      <select
        aria-label={t("instanceQuery.comparedField")}
        value={entry.fieldId ?? ""}
        onChange={(e) => onChange(switchField(entry, e.target.value, fields))}
      >
        <option value="">{t("instanceQuery.pickField")}</option>
        <FieldOptions fields={fields ?? []} />
      </select>
      <select
        aria-label={t("instanceQuery.operator")}
        value={entry.operator ?? "eq"}
        onChange={(e) => onChange(switchOperator(entry, e.target.value as Operator))}
      >
        <option value="eq">{t("instanceQuery.operatorEq")}</option>
        <option value="ne">{t("instanceQuery.operatorNe")}</option>
        <option value="in">{t("instanceQuery.operatorIn")}</option>
      </select>
      <select
        aria-label={t("instanceQuery.rightSide")}
        value={side}
        onChange={(e) => onChange(switchRightSide(entry, e.target.value as RightSide, ownFields))}
      >
        {rightSideOptions(entry.operator).map((option) => (
          <option key={option} value={option}>
            {t(option === "literal" ? "instanceQuery.literal" : "instanceQuery.ownField")}
          </option>
        ))}
      </select>
      {side === "field" ? (
        <select
          aria-label={t("instanceQuery.ownField")}
          value={entry.valueFromField}
          onChange={(e) => onChange({ ...entry, valueFromField: e.target.value })}
        >
          <FieldOptions fields={ownFields} />
        </select>
      ) : (
        // A new control kind starts from the stored value, so the text of a
        // number field never shows under a list or a Yes/No choice.
        <LiteralControl key={`${type ?? "unknown"}:${list ? "list" : "one"}`} entry={entry} type={type} onChange={onChange} />
      )}
      <StaleMark id={entry.fieldId ?? ""} known={fields && type !== undefined} />
      <button type="button" className="btn btn-secondary" onClick={onRemove}>
        {t("instanceQuery.removeComparison")}
      </button>
    </div>
  );
}

/**
 * The literal right side. It keeps its own text and parses it on each
 * keystroke, so `1.` or `a,` survives until the next character
 * (`comparisonRow.ts::reconcileText`). The control refuses input while the
 * type is unknown.
 */
function LiteralControl({ entry, type, onChange }: { entry: WhereEntry; type: ValueType | undefined; onChange: (next: WhereEntry) => void }) {
  const reasonId = useId();
  const hintId = useId();
  const [state, setState] = useState(() => initialTextState(entry.value));
  const drawn = reconcileText(state, entry.value, type, entry.operator);
  if (drawn !== state) setState(drawn);

  const list = entry.operator === "in";
  if (type === "boolean" && !list) {
    return (
      <select
        aria-label={t("instanceQuery.comparisonValue")}
        value={booleanChoice(entry.value)}
        onChange={(e) => onChange(withValue(entry, valueFromChoice(e.target.value)))}
      >
        <option value="">{t("condition.selectValue")}</option>
        <option value="true">{t("condition.yes")}</option>
        <option value="false">{t("condition.no")}</option>
      </select>
    );
  }

  const parsed = parseComparisonText(drawn.text, type, entry.operator);
  const reason = parsed.ok ? undefined : reasonKey(parsed.reason);
  const describedBy = [list ? hintId : "", reason ? reasonId : ""].filter(Boolean).join(" ");
  return (
    <>
      <input
        type="text"
        {...stylex.props(styles.studioMono)}
        aria-label={t("instanceQuery.comparisonValue")}
        autoComplete="off"
        spellCheck={false}
        inputMode={type === "number" && !list ? "decimal" : undefined}
        disabled={type === undefined}
        aria-invalid={reason ? true : undefined}
        aria-describedby={describedBy || undefined}
        value={drawn.text}
        onChange={(e) => {
          const text = e.target.value;
          setState({ text, seen: drawn.seen });
          const next = parseComparisonText(text, type, entry.operator);
          onChange(withValue(entry, next.ok ? next.value : undefined));
        }}
      />
      {list && (
        <span id={hintId} {...stylex.props(styles.instanceQueryFormHint)}>
          {t("instanceQuery.listHint")}
        </span>
      )}
      {reason && (
        <span id={reasonId} {...stylex.props(styles.studioWarning)}>
          {t(reason)}
        </span>
      )}
    </>
  );
}

interface AttributeRowsProps {
  attributes: unknown;
  fieldOptions: readonly TargetRef[];
  /** `undefined` until the catalog loads: no field reads as stale before then. */
  knownFieldIds: ReadonlySet<string> | undefined;
  onCommit: (attributes: Record<string, string>) => void;
}

/**
 * Rows keyed by their own id, so a key input keeps focus while its key
 * changes. A row with an empty or duplicate key stays local until the
 * developer fixes it (`attributeRows.ts`).
 */
function AttributeRows({ attributes, fieldOptions, knownFieldIds, onCommit }: AttributeRowsProps) {
  const duplicateId = useId();
  const [rows, setRows] = useState(() => rowsFromRecord(attributeRecord(attributes)));
  const reseeded = reseedRows(rows, attributes);
  if (reseeded) setRows(reseeded);
  const drawn = reseeded ?? rows;
  const duplicates = duplicateRowIds(drawn);

  const update = (next: AttributeRow[]) => {
    setRows(next);
    const record = attributesToCommit(next, attributes);
    if (record) onCommit(record);
  };
  const patchRow = (rowId: string, patch: Partial<AttributeRow>) => update(drawn.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));

  return (
    <fieldset {...stylex.props(styles.instanceQueryFormFieldset)}>
      <legend {...stylex.props(styles.instanceQueryFormLegend)}>{t("instanceQuery.attributes")}</legend>
      {drawn.map((row) => {
        const duplicate = duplicates.has(row.rowId);
        const reasonId = `${duplicateId}-${row.rowId}`;
        return (
          <div key={row.rowId} {...stylex.props(styles.instanceQueryFormRow, (row.key === "" || duplicate) && styles.instanceQueryFormRowIncomplete)}>
            <input
              type="text"
              {...stylex.props(styles.studioMono)}
              aria-label={t("instanceQuery.columnKey")}
              placeholder={t("instanceQuery.columnKey")}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={duplicate ? true : undefined}
              aria-describedby={duplicate ? reasonId : undefined}
              value={row.key}
              onChange={(e) => patchRow(row.rowId, { key: e.target.value })}
            />
            <select aria-label={t("instanceQuery.attributeField")} value={row.fieldId} onChange={(e) => patchRow(row.rowId, { fieldId: e.target.value })}>
              <option value="">{t("instanceQuery.pickField")}</option>
              <FieldOptions fields={fieldOptions} />
            </select>
            {duplicate && (
              <span id={reasonId} {...stylex.props(styles.studioWarning)}>
                {t("instanceQuery.duplicateColumnKey")}
              </span>
            )}
            <StaleMark id={row.fieldId} known={knownFieldIds?.has(row.fieldId)} />
            <button type="button" className="btn btn-secondary" onClick={() => update(drawn.filter((r) => r.rowId !== row.rowId))}>
              {t("instanceQuery.removeAttribute")}
            </button>
          </div>
        );
      })}
      <button type="button" className="btn btn-secondary" onClick={() => update([...drawn, { rowId: nextRowId(), key: "", fieldId: "" }])}>
        {t("instanceQuery.addAttribute")}
      </button>
    </fieldset>
  );
}
