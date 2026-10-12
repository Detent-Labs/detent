import { useId } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import type { Expression, FieldId, SubprocessSpec } from "workflow-engine/schema";

type VersionBinding = SubprocessSpec["versionBinding"];
import type { DraftOf } from "../draft/types";
import type { DraftField } from "../draft/fields";
import type { ProcessSummary } from "../api/types.js";
import { t } from "../catalog.js";
import { processLabel } from "../draft/guided-labels.js";
import { specForProcess } from "../draft/subprocessSpec";
import { FieldExpressionMapEditor } from "./shared/FieldExpressionMapEditor";
import type { ChildInputFields } from "./shared/useChildInputFields";

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
  /** The calling process's own fields: the `outputMapping` targets. */
  fields: DraftField[];
  /** The called process's input fields: the `inputMapping` targets. */
  childInputs: ChildInputFields;
  onChange: (next: DraftSpec) => void;
  /** The processes an author may call, from GET /processes. Empty until the
   * fetch resolves, and after a failed one. */
  processes: ProcessSummary[];
  /** The locale the studio is displaying authored content in, so a picker
   * entry reads the process's own label in that locale. */
  contentLocale: string;
}

/** The note under the `inputMapping` editor, when the child's fields are not a usable list. */
function childInputsNote(childInputs: ChildInputFields) {
  switch (childInputs.status) {
    case "loading":
      return t("subprocess.childInputsLoading");
    case "failed":
      return t("subprocess.childInputsFailed");
    case "ready":
      return childInputs.fields.length === 0 ? t("subprocess.childInputsNone") : undefined;
    default:
      return undefined;
  }
}

/** Call-and-return subprocess wiring on a `subprocess`-type step (design.md/CLAUDE.md "Subprocesses"). */
export function SubprocessSpecEditor({ value, fields, childInputs, onChange, processes, contentLocale }: Props) {
  const noteId = useId();
  const processId = value?.processId ?? "";
  // A stored id the list does not carry still has to keep its place in the
  // picker, or selecting the step would silently clear the call. It reads as
  // a process the author cannot open rather than as the raw id.
  const unlisted = processId !== "" && !processes.some((p) => p.processId === processId);

  const processPicker = (
    <label {...stylex.props(styles.field)}>
      {t("subprocess.processLabel")}
      <select
        value={processId}
        onChange={(e) => {
          if (!value && e.target.value === "") return;
          onChange(specForProcess(e.target.value, processes, value));
        }}
      >
        <option value="">{t("subprocess.selectProcess")}</option>
        {unlisted && <option value={processId}>{t("subprocess.unknownProcess")}</option>}
        {processes.map((process) => (
          <option key={process.processId} value={process.processId}>
            {processLabel(process, contentLocale)}
          </option>
        ))}
      </select>
    </label>
  );

  // A step with no spec shows the process select alone. The first pick writes
  // the whole spec, so no later control shows a state the draft lacks.
  // The picker prints a process label, never a `proc_` id
  // (`studio-guided-vocabulary`). The id itself stays one disclosure away, in
  // the step's raw JSON.
  if (!value) {
    return (
      <fieldset className="subprocess-spec">
        <legend>subprocess</legend>
        {processPicker}
      </fieldset>
    );
  }

  const update = (patch: Partial<DraftSpec>) => onChange({ ...value, ...patch });
  const binding = value.versionBinding ?? "pinned";
  const updateMapping = (kind: MappingKind, next: Partial<Record<FieldId, DraftOf<Expression>>>) =>
    update({ [kind]: next } as Partial<DraftSpec>);
  const note = childInputsNote(childInputs);

  return (
    <fieldset className="subprocess-spec">
      <legend>subprocess</legend>
      {processPicker}

      <label {...stylex.props(styles.field)}>
        {t("subprocess.bindingLegend")}
        <select
          value={binding}
          onChange={(e) => {
            const versionBinding = e.target.value as VersionBinding;
            update({
              versionBinding,
              pinnedVersion: versionBinding === "pinned" ? (value.pinnedVersion ?? 1) : undefined,
              contractRef: versionBinding === "latest-at-spawn" ? (value.contractRef ?? "") : undefined,
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
            value={value.pinnedVersion ?? ""}
            onChange={(e) => update({ pinnedVersion: e.target.value === "" ? undefined : Number(e.target.value) })}
          />
        </label>
      ) : (
        <label>
          contractRef (child contract hash)
          <input type="text" value={value.contractRef ?? ""} onChange={(e) => update({ contractRef: e.target.value })} />
        </label>
      )}

      <FieldExpressionMapEditor
        legend="inputMapping"
        addLabel={t("subprocess.addInputMapping")}
        removeLabel={t("subprocess.removeMappingEntry")}
        mapping={value.inputMapping}
        fields={childInputs.fields}
        addDisabled={childInputs.status !== "ready" || childInputs.fields.length === 0}
        addDescribedBy={note ? noteId : undefined}
        onChange={(next) => updateMapping("inputMapping", next)}
      />
      {/* The region stays in the DOM, so a change from loading to failed is announced. */}
      <div role="status" id={noteId}>
        {note && <p {...stylex.props(styles.note)}>{note}</p>}
      </div>
      <FieldExpressionMapEditor
        legend="outputMapping"
        addLabel={t("subprocess.addOutputMapping")}
        removeLabel={t("subprocess.removeMappingEntry")}
        mapping={value.outputMapping}
        fields={fields}
        onChange={(next) => updateMapping("outputMapping", next)}
      />
    </fieldset>
  );
}
