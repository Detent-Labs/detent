import type { View, ViewField } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { t } from "../i18n/catalog";
import { BooleanOrExpressionInput } from "./shared/BooleanOrExpressionInput";

type DraftView = DraftOf<View>;
type DraftViewField = DraftOf<ViewField>;

interface Props {
  view: DraftView | undefined;
  fields: DraftField[];
  onChange: (next: DraftView) => void;
}

/**
 * `view.fields` has no explicit "order" property (unlike the
 * visible/required/readonly/group overrides) — its position in this array
 * IS the per-step display order, so reordering the array is how an author
 * sets it.
 */
export function ViewEditor({ view, fields, onChange }: Props) {
  const rows = view?.fields ?? [];

  const setRows = (next: DraftViewField[]) => onChange({ ...view, fields: next });

  const usedRefs = new Set(rows.map((r) => r.ref));
  const available = fields.filter((f) => f.id !== undefined && !usedRefs.has(f.id));

  const addRow = () => {
    const target = available[0];
    if (!target?.id) return;
    setRows([...rows, { ref: target.id }]);
  };

  const removeRow = (index: number) => setRows(rows.filter((_, i) => i !== index));

  const updateRow = (index: number, patch: Partial<DraftViewField>) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setRows(next);
  };

  return (
    <fieldset className="view-editor">
      <legend>{t("view.legend")}</legend>
      {rows.length === 0 && <p className="empty">{t("view.empty")}</p>}
      {rows.map((row, index) => {
        const field = fields.find((f) => f.id === row.ref);
        return (
          <div className="view-row" key={row.ref ?? index}>
            <span className="view-row-field">{field?.key ?? row.ref}</span>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={t("view.moveUp")}>
              ↑
            </button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === rows.length - 1} aria-label={t("view.moveDown")}>
              ↓
            </button>
            <BooleanOrExpressionInput
              label="visible"
              value={row.visible}
              onChange={(visible) => updateRow(index, { visible })}
            />
            <BooleanOrExpressionInput
              label="required"
              value={row.required}
              onChange={(required) => updateRow(index, { required })}
            />
            <BooleanOrExpressionInput
              label="readonly"
              value={row.readonly}
              onChange={(readonly) => updateRow(index, { readonly })}
            />
            <label>
              group
              <input type="text" value={row.group ?? ""} onChange={(e) => updateRow(index, { group: e.target.value })} />
            </label>
            <button type="button" onClick={() => removeRow(index)}>
              {t("view.remove")}
            </button>
          </div>
        );
      })}
      <button type="button" onClick={addRow} disabled={available.length === 0}>
        {t("view.addFieldOverride")}
      </button>
    </fieldset>
  );
}
