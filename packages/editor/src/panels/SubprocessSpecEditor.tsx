import type { Expression, FieldId, ProcessId, SubprocessSpec } from "workflow-engine/schema";

type VersionBinding = SubprocessSpec["versionBinding"];
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import { t } from "../i18n/catalog";
import { ExpressionInput } from "./shared/ExpressionInput";

type DraftSpec = DraftOf<SubprocessSpec>;
type MappingKind = "inputMapping" | "outputMapping";

interface Props {
  value: DraftSpec | undefined;
  fields: DraftField[];
  onChange: (next: DraftSpec) => void;
}

function MappingEditor({
  label,
  mapping,
  fields,
  onChange,
}: {
  label: string;
  mapping: Partial<Record<FieldId, DraftOf<Expression>>> | undefined;
  fields: DraftField[];
  onChange: (next: Partial<Record<FieldId, DraftOf<Expression>>>) => void;
}) {
  const entries = Object.entries(mapping ?? {});

  const setEntry = (fieldId: string, expr: DraftOf<Expression> | undefined) => {
    const next = { ...(mapping ?? {}) };
    if (expr === undefined) delete next[fieldId as FieldId];
    else next[fieldId as FieldId] = expr;
    onChange(next);
  };

  const addEntry = () => {
    const used = new Set(entries.map(([k]) => k));
    const target = fields.find((f) => f.id !== undefined && !used.has(f.id));
    if (!target?.id) return;
    setEntry(target.id, { lang: "cel", src: "" });
  };

  return (
    <fieldset>
      <legend>{label}</legend>
      {entries.map(([fieldId, expr]) => (
        <div key={fieldId} className="mapping-row">
          <select
            value={fieldId}
            onChange={(e) => {
              setEntry(fieldId, undefined);
              setEntry(e.target.value, expr);
            }}
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.key ?? f.id}
              </option>
            ))}
          </select>
          <ExpressionInput value={expr} onChange={(v) => setEntry(fieldId, v)} />
          <button type="button" onClick={() => setEntry(fieldId, undefined)}>
            {t("subprocess.removeMappingEntry")}
          </button>
        </div>
      ))}
      <button type="button" onClick={addEntry} disabled={fields.length === 0}>
        {label === "inputMapping" ? t("subprocess.addInputMapping") : t("subprocess.addOutputMapping")}
      </button>
    </fieldset>
  );
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

      <MappingEditor
        label="inputMapping"
        mapping={value?.inputMapping}
        fields={fields}
        onChange={(next) => updateMapping("inputMapping", next)}
      />
      <MappingEditor
        label="outputMapping"
        mapping={value?.outputMapping}
        fields={fields}
        onChange={(next) => updateMapping("outputMapping", next)}
      />
    </fieldset>
  );
}
