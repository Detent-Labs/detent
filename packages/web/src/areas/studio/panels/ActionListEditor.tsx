import type { Action, Expression, FieldId } from "workflow-engine/schema";
import { PROCESS_START_ACTION_TYPE } from "workflow-engine/engine/registry";
import type { DraftOf } from "../draft/types";
import { mintId } from "../draft/ids";
import { removeAt, updateAt } from "../draft/list-ops";
import type { DraftField } from "../draft/fields";
import type { ConfigFieldDescriptor } from "../api/types.js";
import { FieldExpressionMapEditor } from "./shared/FieldExpressionMapEditor";
import { PluginEnvelopeEditor } from "./shared/PluginEnvelopeEditor";
import { IssueList, NotCheckedBadge } from "./shared/IssueList";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";

type DraftAction = DraftOf<Action>;

interface Props {
  label: string;
  actions: DraftAction[] | undefined;
  onChange: (next: DraftAction[]) => void;
  fields: DraftField[];
  /** The action registry's live type names and config-schema descriptions (GET /registry). */
  registryTypes?: string[];
  registrySchemas?: Record<string, ConfigFieldDescriptor[]>;
}

/**
 * Shared across step onEntry/onExit/onCancel, path onPath, and timer
 * onFire.actions positions. Never
 * mutates in place — always calls `onChange` with a full new array so the
 * caller's own `mutate` recipe stays the single source of the write.
 */
export function ActionListEditor({ label, actions, onChange, fields, registryTypes, registrySchemas }: Props) {
  const list = actions ?? [];

  const addAction = () => {
    const next: DraftAction = { id: mintId("action"), type: "", config: {} };
    onChange([...list, next]);
  };

  const removeAction = (index: number) => {
    onChange(removeAt(list, index));
  };

  const updateAction = (index: number, patch: Partial<DraftAction>) => {
    onChange(updateAt(list, index, patch));
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
          registryTypes={registryTypes}
          registrySchemas={registrySchemas}
          onChange={(patch) => updateAction(index, patch)}
          onRemove={() => removeAction(index)}
        />
      ))}
      <button type="button" className="btn btn-secondary" onClick={addAction}>
        {t("actions.addAction")}
      </button>
    </fieldset>
  );
}

function ActionRow({
  action,
  fields,
  registryTypes,
  registrySchemas,
  onChange,
  onRemove,
}: {
  action: DraftAction;
  fields: DraftField[];
  registryTypes?: string[];
  registrySchemas?: Record<string, ConfigFieldDescriptor[]>;
  onChange: (patch: Partial<DraftAction>) => void;
  onRemove: () => void;
}) {
  const { validation } = useDraft();

  const output = action.output ?? {};

  const setOutput = (next: Partial<Record<FieldId, DraftOf<Expression>>>) => onChange({ output: next });

  // Narrowed to the held-back config-validation half (design.md's "Config
  // validation stays on the server, and the rail says so" decision): an
  // action whose type does not resolve gets its own registry issue from the
  // type-resolution half instead, via IssueList below — showing this badge
  // too would duplicate that signal for the same reason.
  const hasRegistryIssue = validation.issues.some((i) => i.source === "registry" && i.entityId === action.id);
  const isChainingSite = action.type === PROCESS_START_ACTION_TYPE;
  const chainingChecked = action.id !== undefined && validation.chainingSiteStatus[action.id] === "checked";

  return (
    <div className="action-row">
      <PluginEnvelopeEditor
        label={t("actions.pluginLabel")}
        value={action}
        onChange={onChange}
        typePlaceholder={t("actions.typePlaceholder")}
        registryTypes={registryTypes}
        registrySchemas={registrySchemas}
      />

      <FieldExpressionMapEditor
        legend={t("actions.outputMappingLabel")}
        addLabel={t("actions.addOutputMapping")}
        removeLabel={t("actions.removeOutputMapping")}
        placeholder={t("actions.resultCelPlaceholder")}
        mapping={output}
        fields={fields}
        onChange={setOutput}
      />

      {!hasRegistryIssue && <NotCheckedBadge label="registry config" />}
      {isChainingSite && !chainingChecked && <NotCheckedBadge label="chaining target" />}
      <IssueList entityId={action.id} />

      <button type="button" className="btn btn-secondary" onClick={onRemove}>
        {t("actions.removeAction")}
      </button>
    </div>
  );
}
