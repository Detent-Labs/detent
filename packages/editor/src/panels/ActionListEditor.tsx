import { useState } from "react";
import type { Action, Expression, FieldId } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import { mintId } from "../draft/ids";
import type { DraftField } from "../draft/fields";
import { ExpressionInput } from "./shared/ExpressionInput";
import { IssueList, NotCheckedBadge } from "./shared/IssueList";
import { useDraft } from "../draft/store";
import { useT } from "../i18n/store";

type DraftAction = DraftOf<Action>;

interface Props {
  label: string;
  actions: DraftAction[] | undefined;
  onChange: (next: DraftAction[]) => void;
  fields: DraftField[];
}

/**
 * Shared across step onEntry/onExit/onCancel, path onPath, and timer
 * onFire.actions positions (spec: editor-structural-panels task 3.6). Never
 * mutates in place — always calls `onChange` with a full new array so the
 * caller's own immer recipe stays the single source of the write.
 */
export function ActionListEditor({ label, actions, onChange, fields }: Props) {
  const t = useT();
  const list = actions ?? [];

  const addAction = () => {
    const next: DraftAction = { id: mintId("action"), type: "", config: {} };
    onChange([...list, next]);
  };

  const removeAction = (index: number) => {
    onChange(list.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, patch: Partial<DraftAction>) => {
    onChange(list.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  return (
    <fieldset className="action-list">
      <legend>{label}</legend>
      {list.length === 0 && <p className="empty">{t("actions.empty")}</p>}
      {list.map((action, index) => (
        <ActionRow
          key={action.id ?? index}
          action={action}
          fields={fields}
          onChange={(patch) => updateAction(index, patch)}
          onRemove={() => removeAction(index)}
        />
      ))}
      <button type="button" onClick={addAction}>
        {t("actions.addAction")}
      </button>
    </fieldset>
  );
}

function ActionRow({
  action,
  fields,
  onChange,
  onRemove,
}: {
  action: DraftAction;
  fields: DraftField[];
  onChange: (patch: Partial<DraftAction>) => void;
  onRemove: () => void;
}) {
  const [configText, setConfigText] = useState(() => JSON.stringify(action.config ?? {}, null, 2));
  const [configError, setConfigError] = useState<string | null>(null);
  const { validation } = useDraft();
  const t = useT();

  const commitConfig = (text: string) => {
    setConfigText(text);
    try {
      const parsed = JSON.parse(text);
      setConfigError(null);
      onChange({ config: parsed });
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : t("common.invalidJson"));
    }
  };

  const output = action.output ?? {};

  const setOutputEntry = (fieldId: string, expr: DraftOf<Expression> | undefined) => {
    const next = { ...output };
    if (expr === undefined) delete next[fieldId as FieldId];
    else next[fieldId as FieldId] = expr;
    onChange({ output: next });
  };

  const addOutputEntry = () => {
    if (fields.length === 0) return;
    const firstUnused = fields.find((f) => f.id !== undefined && !(f.id in output));
    const target = firstUnused ?? fields[0];
    if (target?.id === undefined) return;
    setOutputEntry(target.id, { lang: "cel", src: "" });
  };

  return (
    <div className="action-row">
      <input
        type="text"
        placeholder={t("actions.typePlaceholder")}
        value={action.type ?? ""}
        onChange={(e) => onChange({ type: e.target.value })}
      />
      <textarea
        rows={3}
        value={configText}
        onChange={(e) => commitConfig(e.target.value)}
        aria-label="action config JSON"
      />
      {configError && (
        <p className="error">
          {t("common.configErrorPrefix")} {configError}
        </p>
      )}

      <div className="action-output">
        <span>{t("actions.outputMappingLabel")}</span>
        {Object.entries(output).map(([fieldId, expr]) => (
          <div key={fieldId} className="action-output-row">
            <select value={fieldId} onChange={(e) => {
              const value = expr;
              setOutputEntry(fieldId, undefined);
              setOutputEntry(e.target.value, value);
            }}>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.key ?? f.id}
                </option>
              ))}
            </select>
            <ExpressionInput value={expr} onChange={(v) => setOutputEntry(fieldId, v)} placeholder={t("actions.resultCelPlaceholder")} />
            <button type="button" onClick={() => setOutputEntry(fieldId, undefined)}>
              {t("actions.removeOutputMapping")}
            </button>
          </div>
        ))}
        <button type="button" onClick={addOutputEntry} disabled={fields.length === 0}>
          {t("actions.addOutputMapping")}
        </button>
      </div>

      {!validation.registryChecked && <NotCheckedBadge label="registry" />}
      <IssueList entityId={action.id} />

      <button type="button" onClick={onRemove}>
        {t("actions.removeAction")}
      </button>
    </div>
  );
}
