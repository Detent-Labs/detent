import { useEffect, useId, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, space } from "form-ui/tokens.stylex";
import type { ConfigFieldDescriptor } from "../api/types.js";
import { t } from "../catalog.js";
import { btn } from "./shared/btn.js";
import { LinesInput } from "./shared/LinesInput.js";
import { validateField } from "./shared/PluginEnvelopeEditor.js";
import { StudioSelect } from "./shared/StudioSelect.js";
import { useAssignableGroups } from "./shared/useAssignableGroups.js";
import { canAddField, groupPickerState, type GroupPickerState, type PersonPickerState, type PickerOption } from "./whoActsLogic.js";

const MEASURE = "68ch";

const styles = stylex.create({
  stack: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space.s2,
    minWidth: 0,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    minWidth: 0,
  },
  label: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  line: {
    color: colors.textMuted,
    marginBlock: 0,
    maxWidth: MEASURE,
  },
  failed: {
    color: colors.refusal,
    marginBlock: 0,
    maxWidth: MEASURE,
  },
  // A note: no box, a 2px hairline on its left, 12px from the text (`DESIGN.md`, Inputs / Fields).
  note: {
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    paddingLeft: space.s3,
    marginBlock: 0,
    maxWidth: MEASURE,
  },
  // A warning callout (`DESIGN.md`): the strategy finds no one as it stands.
  warning: {
    color: colors.refusal,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: colors.advisory,
    paddingLeft: space.s2,
    marginBlock: 0,
    maxWidth: MEASURE,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
  },
  addOpen: {
    alignSelf: "flex-start",
  },
});

/** The descriptor `validateField` reads, so the error stands with no registry. */
const CANDIDATES: ConfigFieldDescriptor = { key: "candidates", kind: "string-array", required: true };

/** The fixed-list strategy's editor. It writes through the envelope, so other config keys stay. */
export function FixedListEditor({
  config,
  onChange,
}: {
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  return (
    <LinesInput
      label={t("steps.assignmentLabel")}
      caption={t("whoActs.listCaption")}
      value={config.candidates}
      error={validateField(CANDIDATES, config.candidates)}
      onChange={(candidates) => onChange({ ...config, candidates })}
    />
  );
}

/** A label above one select. The placeholder stands only while `value` is empty. */
function PickerSelect({
  caption,
  placeholder,
  value,
  options,
  onPick,
}: {
  caption: string;
  placeholder: string;
  value: string;
  options: PickerOption[];
  onPick: (id: string) => void;
}) {
  const id = useId();
  return (
    <div {...stylex.props(styles.field)}>
      <label htmlFor={id} {...stylex.props(styles.label)}>
        {caption}
      </label>
      <StudioSelect id={id} value={value} onChange={(e) => onPick(e.target.value)}>
        {value === "" && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </StudioSelect>
    </div>
  );
}

/** The group picker's markup for one state. */
export function GroupPickerBody({ state, onPick }: { state: GroupPickerState; onPick: (groupId: string) => void }) {
  if (state.kind === "loading") {
    return (
      <p role="status" {...stylex.props(styles.line)}>
        {t("whoActs.groupsLoading")}
      </p>
    );
  }
  if (state.kind === "failed") {
    return (
      <p role="alert" {...stylex.props(styles.failed)}>
        {state.message}
      </p>
    );
  }
  if (state.kind === "empty") return <p {...stylex.props(styles.line)}>{t("whoActs.groupsEmpty")}</p>;
  return (
    <div {...stylex.props(styles.stack)}>
      <PickerSelect
        caption={t("whoActs.groupCaption")}
        placeholder={t("whoActs.groupChoose")}
        value={state.value}
        options={state.options}
        onPick={onPick}
      />
      {state.peopleNote && <p {...stylex.props(styles.note)}>{t("whoActs.groupAlsoPeople")}</p>}
      {state.emptyUnder && <p {...stylex.props(styles.line)}>{t("whoActs.groupsEmpty")}</p>}
    </div>
  );
}

/** The group strategy's picker, over the groups open to this process. One read per mount. */
export function GroupPicker({
  token,
  processId,
  held,
  allowedGroups,
  barePerson,
  onPick,
}: {
  token: string;
  processId: string;
  held: unknown;
  allowedGroups: readonly string[] | undefined;
  barePerson: boolean;
  onPick: (groupId: string) => void;
}) {
  const read = useAssignableGroups(token, processId);
  return <GroupPickerBody state={groupPickerState(read, held, allowedGroups, barePerson)} onPick={onPick} />;
}

/** The inline name's markup. The name is the caller's state. */
export function AddFieldEditor({
  name,
  onName,
  onConfirm,
  onCancel,
}: {
  name: string;
  onName: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  return (
    <div {...stylex.props(styles.stack)}>
      <div {...stylex.props(styles.field)}>
        <label htmlFor={id} {...stylex.props(styles.label)}>
          {t("whoActs.addFieldName")}
        </label>
        {/* autoFocus: the single input of an editor the author just opened by an explicit press. */}
        <input
          id={id}
          type="text"
          autoFocus
          value={name}
          onChange={(e) => onName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== "Escape") return;
            e.preventDefault();
            if (e.key === "Enter") onConfirm();
            else onCancel();
          }}
        />
      </div>
      <div {...stylex.props(styles.actions)}>
        <button type="button" className="btn btn-secondary" disabled={!canAddField(name)} onClick={onConfirm}>
          {t("whoActs.addFieldConfirm")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {t("dialog.cancel")}
        </button>
      </div>
    </div>
  );
}

/** The inline field control: a name taken in place. It leaves the forms alone, since it cannot know which step should ask. */
export function AddPersonField({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState<string | null>(null);
  const openRef = useRef<HTMLButtonElement | null>(null);
  const returnFocus = useRef(false);

  // The button mounts again once the name closes, so the focus goes back to it after that commit.
  useEffect(() => {
    if (name !== null || !returnFocus.current) return;
    returnFocus.current = false;
    openRef.current?.focus();
  }, [name]);

  const close = () => {
    returnFocus.current = true;
    setName(null);
  };

  if (name === null) {
    return (
      <button ref={openRef} type="button" {...btn("btn btn-secondary", styles.addOpen)} onClick={() => setName("")}>
        {t("whoActs.addField")}
      </button>
    );
  }
  return (
    <AddFieldEditor
      name={name}
      onName={setName}
      onConfirm={() => {
        if (!canAddField(name)) return;
        onAdd(name);
        close();
      }}
      onCancel={close}
    />
  );
}

/** The person-field strategy's picker and its notes. */
export function PersonFieldPicker({
  state,
  onPick,
  onAdd,
}: {
  state: PersonPickerState;
  onPick: (fieldId: string) => void;
  onAdd: (name: string) => void;
}) {
  return (
    <div {...stylex.props(styles.stack)}>
      <PickerSelect
        caption={t("whoActs.fieldCaption")}
        placeholder={t("whoActs.fieldChoose")}
        value={state.value}
        options={state.options}
        onPick={onPick}
      />
      {state.severalNote && <p {...stylex.props(styles.warning)}>{t("whoActs.fieldSeveralNote")}</p>}
      {state.unwrittenNote && <p {...stylex.props(styles.warning)}>{t("whoActs.fieldUnwritten")}</p>}
      <AddPersonField onAdd={onAdd} />
    </div>
  );
}
