import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../../catalog.js";
import { listProcesses } from "../../api/client.js";
import { useFetchOnce } from "./useFetchOnce.js";
import { useTargetProcessCatalog, type TargetRef } from "./useTargetProcessCatalog.js";

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
    border: 0,
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
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: space.s2,
  },
  studioMono: {
    fontFamily: fonts.mono,
  },
  studioWarning: {
    color: colors.refusal,
    borderLeft: `3px solid ${colors.accent400}`,
    paddingLeft: space.s2,
  },
});

interface WhereEntry {
  fieldId?: string;
  operator?: "eq" | "ne" | "in";
  value?: unknown;
  valueFromField?: string;
}

interface Props {
  token: string;
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** The reading (own) process's own fields — the comparison right side's "field of my own process" option. */
  ownFields: TargetRef[];
}

/** A picked reference the target catalog does not carry — the publish-time reference check reports this rather than rejecting it, so the form marks it too. */
function StaleMark({ id, known }: { id: string; known: boolean }) {
  if (!id || known) return null;
  return <span {...stylex.props(styles.studioWarning)}>{t("instanceQuery.staleReference")}</span>;
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
  const catalog = useTargetProcessCatalog(token, processId || undefined);

  const stepIds = Array.isArray(config.stepIds) ? (config.stepIds as string[]) : [];
  const statuses = Array.isArray(config.statuses) ? (config.statuses as string[]) : [];
  const where = Array.isArray(config.where) ? (config.where as WhereEntry[]) : [];
  const labelFieldId = typeof config.labelFieldId === "string" ? config.labelFieldId : "";
  const attributes = (config.attributes && typeof config.attributes === "object" ? (config.attributes as Record<string, string>) : {});

  const knownStepIds = new Set(catalog?.steps.map((s) => s.id) ?? []);
  const knownFieldIds = new Set(catalog?.fields.map((f) => f.id) ?? []);
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

  const updateWhere = (i: number, patch: Partial<WhereEntry>) => set({ where: where.map((w, idx) => (idx === i ? { ...w, ...patch } : w)) });
  const addWhere = () => set({ where: [...where, { operator: "eq" as const }] });
  const removeWhere = (i: number) => set({ where: where.filter((_, idx) => idx !== i) });

  const updateAttributeKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(attributes)) next[k === oldKey ? newKey : k] = v;
    set({ attributes: next });
  };
  const updateAttributeField = (key: string, fieldId: string) => set({ attributes: { ...attributes, [key]: fieldId } });
  const addAttribute = () => set({ attributes: { ...attributes, "": "" } });
  const removeAttribute = (key: string) => {
    const next = { ...attributes };
    delete next[key];
    set({ attributes: next });
  };

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

      {processId && (
        <>
          <fieldset {...stylex.props(styles.instanceQueryFormFieldset)}>
            <legend {...stylex.props(styles.instanceQueryFormLegend)}>{t("instanceQuery.steps")}</legend>
            {catalog?.steps.map((s) => (
              <label key={s.id} {...stylex.props(styles.instanceQueryFormOption)}>
                <input type="checkbox" checked={stepIds.includes(s.id)} onChange={() => toggleStep(s.id)} />
                {s.label} <span {...stylex.props(styles.studioMono)}>({s.key})</span>
              </label>
            ))}
            {stepIds
              .filter((id) => !knownStepIds.has(id))
              .map((id) => (
                <p key={id} {...stylex.props(styles.studioWarning)}>
                  {t("instanceQuery.staleReference")} <span {...stylex.props(styles.studioMono)}>{id}</span>
                </p>
              ))}
          </fieldset>

          <fieldset {...stylex.props(styles.instanceQueryFormFieldset)}>
            <legend {...stylex.props(styles.instanceQueryFormLegend)}>{t("instanceQuery.statuses")}</legend>
            {STATUSES.map((s) => (
              <label key={s} {...stylex.props(styles.instanceQueryFormOption)}>
                <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} />
                {s}
              </label>
            ))}
          </fieldset>

          <div {...stylex.props(styles.instanceQueryFormLabelField)}>
            <label>
              {t("instanceQuery.labelField")}
              <select value={labelFieldId} onChange={(e) => set({ labelFieldId: e.target.value })}>
                <option value="">{t("instanceQuery.pickField")}</option>
                {fieldOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} ({f.key})
                  </option>
                ))}
              </select>
            </label>
            <StaleMark id={labelFieldId} known={knownFieldIds.has(labelFieldId)} />
          </div>

          <fieldset {...stylex.props(styles.instanceQueryFormFieldset)}>
            <legend {...stylex.props(styles.instanceQueryFormLegend)}>{t("instanceQuery.comparisons")}</legend>
            {where.map((w, i) => (
              <div key={i} {...stylex.props(styles.instanceQueryFormRow)}>
                <select value={w.fieldId ?? ""} onChange={(e) => updateWhere(i, { fieldId: e.target.value })}>
                  <option value="">{t("instanceQuery.pickField")}</option>
                  {fieldOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} ({f.key})
                    </option>
                  ))}
                </select>
                <select value={w.operator ?? "eq"} onChange={(e) => updateWhere(i, { operator: e.target.value as WhereEntry["operator"] })}>
                  <option value="eq">{t("instanceQuery.operatorEq")}</option>
                  <option value="ne">{t("instanceQuery.operatorNe")}</option>
                  <option value="in">{t("instanceQuery.operatorIn")}</option>
                </select>
                <select
                  value={w.valueFromField !== undefined ? "field" : "literal"}
                  onChange={(e) =>
                    e.target.value === "field"
                      ? updateWhere(i, { valueFromField: ownFields[0]?.id ?? "", value: undefined })
                      : updateWhere(i, { value: "", valueFromField: undefined })
                  }
                >
                  <option value="literal">{t("instanceQuery.literal")}</option>
                  <option value="field">{t("instanceQuery.ownField")}</option>
                </select>
                {w.valueFromField !== undefined ? (
                  <select value={w.valueFromField} onChange={(e) => updateWhere(i, { valueFromField: e.target.value })}>
                    {ownFields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label} ({f.key})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    {...stylex.props(styles.studioMono)}
                    value={typeof w.value === "string" ? w.value : w.value === undefined ? "" : JSON.stringify(w.value)}
                    onChange={(e) => updateWhere(i, { value: e.target.value })}
                  />
                )}
                <StaleMark id={w.fieldId ?? ""} known={knownFieldIds.has(w.fieldId ?? "")} />
                <button type="button" className="btn btn-secondary" onClick={() => removeWhere(i)}>
                  {t("instanceQuery.removeComparison")}
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary" onClick={addWhere}>
              {t("instanceQuery.addComparison")}
            </button>
          </fieldset>

          <fieldset {...stylex.props(styles.instanceQueryFormFieldset)}>
            <legend {...stylex.props(styles.instanceQueryFormLegend)}>{t("instanceQuery.attributes")}</legend>
            {Object.entries(attributes).map(([key, fieldId]) => (
              <div key={key} {...stylex.props(styles.instanceQueryFormRow)}>
                <input
                  type="text"
                  {...stylex.props(styles.studioMono)}
                  placeholder={t("instanceQuery.columnKey")}
                  value={key}
                  onChange={(e) => updateAttributeKey(key, e.target.value)}
                />
                <select value={fieldId} onChange={(e) => updateAttributeField(key, e.target.value)}>
                  <option value="">{t("instanceQuery.pickField")}</option>
                  {fieldOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} ({f.key})
                    </option>
                  ))}
                </select>
                <StaleMark id={fieldId} known={knownFieldIds.has(fieldId)} />
                <button type="button" className="btn btn-secondary" onClick={() => removeAttribute(key)}>
                  {t("instanceQuery.removeAttribute")}
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary" onClick={addAttribute}>
              {t("instanceQuery.addAttribute")}
            </button>
          </fieldset>
        </>
      )}
    </div>
  );
}
