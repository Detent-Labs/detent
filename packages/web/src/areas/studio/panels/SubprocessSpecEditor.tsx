import type { Expression, FieldId, ProcessId, SubprocessSpec } from "workflow-engine/schema";

type VersionBinding = SubprocessSpec["versionBinding"];
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { t } from "../catalog.js";
import { FieldExpressionMapEditor } from "./shared/FieldExpressionMapEditor";

type DraftSpec = DraftOf<SubprocessSpec>;
type MappingKind = "inputMapping" | "outputMapping";

interface Props {
  value: DraftSpec | undefined;
  fields: DraftField[];
  onChange: (next: DraftSpec) => void;
}

/** Call-and-return subprocess wiring on a `subprocess`-type step (design.md/CLAUDE.md "Subprocesses"). */
export function SubprocessSpecEditor({ value, fields, onChange }: Props) {
  const update = (patch: Partial<DraftSpec>) => onChange({ ...value, ...patch });
  const binding = value?.versionBinding ?? "pinned";

  const updateMapping = (kind: MappingKind, next: Partial<Record<FieldId, DraftOf<Expression>>>) =>
    update({ [kind]: next } as Partial<DraftSpec>);

  return (
    <fieldset className="subprocess-spec">
      <legend>subprocess</legend>
      <label>
        child processId
        <input
          type="text"
          placeholder={t("subprocess.processIdPlaceholder")}
          value={value?.processId ?? ""}
          onChange={(e) => update({ processId: e.target.value as ProcessId })}
        />
      </label>
      <label>
        versionBinding
        <select
          value={binding}
          onChange={(e) => {
            const versionBinding = e.target.value as VersionBinding;
            update({
              versionBinding,
              pinnedVersion: versionBinding === "pinned" ? (value?.pinnedVersion ?? 1) : undefined,
              contractRef: versionBinding === "latest-at-spawn" ? (value?.contractRef ?? "") : undefined,
            });
          }}
        >
          <option value="pinned">pinned</option>
          <option value="latest-at-spawn">latest-at-spawn</option>
        </select>
      </label>
      {binding === "pinned" ? (
        <label>
          pinnedVersion
          <input
            type="number"
            value={value?.pinnedVersion ?? ""}
            onChange={(e) => update({ pinnedVersion: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </label>
      ) : (
        <label>
          contractRef (child contract hash)
          <input type="text" value={value?.contractRef ?? ""} onChange={(e) => update({ contractRef: e.target.value })} />
        </label>
      )}

      <FieldExpressionMapEditor
        legend="inputMapping"
        addLabel={t("subprocess.addInputMapping")}
        removeLabel={t("subprocess.removeMappingEntry")}
        mapping={value?.inputMapping}
        fields={fields}
        onChange={(next) => updateMapping("inputMapping", next)}
      />
      <FieldExpressionMapEditor
        legend="outputMapping"
        addLabel={t("subprocess.addOutputMapping")}
        removeLabel={t("subprocess.removeMappingEntry")}
        mapping={value?.outputMapping}
        fields={fields}
        onChange={(next) => updateMapping("outputMapping", next)}
      />
    </fieldset>
  );
}
