import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import type { Expression, FieldId, ProcessId, SubprocessSpec } from "workflow-engine/schema";

type VersionBinding = SubprocessSpec["versionBinding"];
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import type { ProcessSummary } from "../api/types.js";
import { t } from "../catalog.js";
import { processLabel } from "../draft/guided-labels.js";
import { FieldExpressionMapEditor } from "./shared/FieldExpressionMapEditor";

type DraftSpec = DraftOf<SubprocessSpec>;
type MappingKind = "inputMapping" | "outputMapping";

const styles = stylex.create({
  field: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
  },
  note: {
    color: colors.textMuted,
    fontSize: "0.8rem",
    marginBlock: space.s1,
    marginInline: 0,
  },
});

interface Props {
  value: DraftSpec | undefined;
  fields: DraftField[];
  onChange: (next: DraftSpec) => void;
  /** The processes an author may call, from GET /processes. Empty until the
   * fetch resolves, and after a failed one. */
  processes: ProcessSummary[];
  /** The locale the studio is displaying authored content in, so a picker
   * entry reads the process's own label in that locale. */
  contentLocale: string;
}

/** Call-and-return subprocess wiring on a `subprocess`-type step (design.md/CLAUDE.md "Subprocesses"). */
export function SubprocessSpecEditor({ value, fields, onChange, processes, contentLocale }: Props) {
  const update = (patch: Partial<DraftSpec>) => onChange({ ...value, ...patch });
  const binding = value?.versionBinding ?? "pinned";
  const processId = value?.processId ?? "";
  // A stored id the list does not carry still has to keep its place in the
  // picker, or selecting the step would silently clear the call. It reads as
  // a process the author cannot open rather than as the raw id.
  const unlisted = processId !== "" && !processes.some((p) => p.processId === processId);

  const updateMapping = (kind: MappingKind, next: Partial<Record<FieldId, DraftOf<Expression>>>) =>
    update({ [kind]: next } as Partial<DraftSpec>);

  return (
    <fieldset className="subprocess-spec">
      <legend>subprocess</legend>
      {/* The picker prints a process label, never a `proc_` id
          (`studio-guided-vocabulary`). The id itself stays one disclosure
          away, in the step's raw JSON. */}
      <label {...stylex.props(styles.field)}>
        {t("subprocess.processLabel")}
        <select value={processId} onChange={(e) => update({ processId: e.target.value as ProcessId })}>
          <option value="">{t("subprocess.selectProcess")}</option>
          {unlisted && <option value={processId}>{t("subprocess.unknownProcess")}</option>}
          {processes.map((process) => (
            <option key={process.processId} value={process.processId}>
              {processLabel(process, contentLocale)}
            </option>
          ))}
        </select>
      </label>

      <label {...stylex.props(styles.field)}>
        {t("subprocess.bindingLegend")}
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
          <option value="pinned">{t("subprocess.bindingPinned")}</option>
          <option value="latest-at-spawn">{t("subprocess.bindingLatest")}</option>
        </select>
      </label>
      {binding === "latest-at-spawn" && <p {...stylex.props(styles.note)}>{t("subprocess.bindingNote")}</p>}
      {binding === "pinned" ? (
        <label {...stylex.props(styles.field)}>
          {t("subprocess.pinnedVersionLabel")}
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
