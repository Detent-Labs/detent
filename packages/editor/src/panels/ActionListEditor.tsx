import { useState } from "react";
import type { Action, Expression, FieldId } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types";
import { mintId } from "../draft/ids";
import type { DraftField } from "../draft/fields";
import { FieldExpressionMapEditor } from "./shared/FieldExpressionMapEditor";
import { IssueList, NotCheckedBadge } from "./shared/IssueList";
import { useDraft } from "../draft/store";
import { t } from "../i18n/catalog";

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

  const setOutput = (next: Partial<Record<FieldId, DraftOf<Expression>>>) => onChange({ output: next });

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

      <FieldExpressionMapEditor
        legend={t("actions.outputMappingLabel")}
        addLabel={t("actions.addOutputMapping")}
        removeLabel={t("actions.removeOutputMapping")}
        placeholder={t("actions.resultCelPlaceholder")}
        mapping={output}
        fields={fields}
        onChange={setOutput}
      />

      {!validation.registryChecked && <NotCheckedBadge label="registry" />}
      <IssueList entityId={action.id} />

      <button type="button" onClick={onRemove}>
        {t("actions.removeAction")}
      </button>
    </div>
  );
}
