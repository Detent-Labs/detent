import { useMemo, useRef, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";
import { ExpressionInput } from "./ExpressionInput";
import { ConditionBuilder } from "./ConditionBuilder";
import { buildOperands, commitDecision, fromCel, operandSignature, toCel, type Condition } from "./conditionLogic";

const styles = stylex.create({
  conditionInput: {
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    minWidth: 0,
  },
  conditionFooter: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space.s2,
  },
  conditionParseError: {
    margin: 0,
    color: colors.refusal,
    fontSize: "0.85rem",
  },
  conditionMode: {
    backgroundColor: "transparent",
    color: colors.accent,
    padding: 0,
    flex: "none",
  },
  // `.condition-mode-disclosure[aria-expanded="true"]`: a JS-computed choice
  // reading the same `aria-expanded` the button already carries.
  conditionModeExpanded: {
    color: colors.text,
  },
  conditionActions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: space.s2,
    minWidth: 0,
  },
  // The authoring command (`DESIGN.md` Buttons): a ghost button in slate, mono
  // at 11px, equal to the change list's command. It composes over
  // `btn btn-ghost`, whose accent it replaces. Its label lists step labels, so
  // it wraps anywhere instead of clipping.
  conditionClear: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: {
      default: colors.textMuted,
      ":hover": colors.text,
      ":active": colors.text,
    },
    textAlign: "left",
    overflowWrap: "anywhere",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceMuted,
      ":active": `color-mix(in srgb, ${colors.text} 14%, transparent)`,
    },
  },
  conditionReadout: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    margin: 0,
    minWidth: 0,
    flex: "1 1 20ch",
  },
  conditionReadoutLabel: {
    fontFamily: fonts.body,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    flex: "none",
  },
  // `.condition-readout code`: a descendant selector on a bare `<code>`.
  conditionReadoutCode: {
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
});

interface Props {
  value: DraftOf<Expression> | undefined;
  onChange: (next: DraftOf<Expression> | undefined) => void;
  /** The subprocess step whose path guard this is. Supplies `child.*` when its
   * child resolved. A view override passes none: the runtime resolves a view
   * flag with no child in scope, so the authoring check rejects `child` there. */
  stepId?: string;
  placeholder?: string;
  /**
   * The CEL toggle's presentation. `"link"` (default) keeps today's plain
   * "Edit as CEL" / "Use the builder" buttons — every view-override site
   * (`visible`/`required`/`readonly`) keeps this, unchanged, per
   * `studio-condition-builder`'s "path-guard site only" scope. `"disclosure"`
   * relabels the same toggle "Developer view" with `aria-expanded`, for the
   * path-guard site alone (task 6.3). Neither variant changes the toggle's
   * behavior: the mode still does not persist to the draft or the published
   * body.
   */
  toggleVariant?: "link" | "disclosure";
  /**
   * The label of a clear command in the footer, beside the CEL toggle. Its
   * presence shows the command. Pressing it calls `onChange(undefined)` and
   * empties the local rows. Only a site that can hold a condition the rows do
   * not show passes it: the Fields tab, where the referencing views can
   * disagree and `value` reads `undefined` for all of them.
   */
  clearLabel?: string;
}

/**
 * The condition surface: a row builder, the CEL it produces on a read-only
 * line, and a toggle to the raw CEL input.
 *
 * `onChange` fires on an authoring action that settles the condition: a
 * complete row, the removal of a row that takes a stored source with it, or the
 * clear command. Mounting, reading, switching the mode and an unfinished row
 * never write, so a guard the author only looks at stays byte for byte — the
 * rule that keeps the database from filling with flattened conditions.
 */
export function ConditionInput({ value, onChange, stepId, placeholder, toggleVariant = "link", clearLabel }: Props) {
  const { draft, loadedChildren, contentLocale } = useDraft();

  const operands = useMemo(
    () =>
      buildOperands({
        fields: draft.fields,
        locale: contentLocale,
        baseLocale: draft.baseLocale ?? contentLocale,
        child: stepId ? loadedChildren[stepId] : undefined,
      }),
    [draft.fields, draft.baseLocale, contentLocale, loadedChildren, stepId],
  );

  const src = value?.src;

  /**
   * Builder state is local, and re-seeded only when what it was read FROM
   * changes: the source text, or the operand set that decides how the text
   * reads. Without the first guard a half-filled row — which `toCel`
   * deliberately omits — would vanish on the first re-render. Without the
   * second, a guard read before its child process resolved would stay a raw
   * row for the rest of the session.
   *
   * A write of the builder's own records itself here too, so it reads as
   * already-seeded rather than as an external change to re-read.
   */
  const signature = operandSignature(operands);
  const seededFrom = useRef<{ src: string | undefined; signature: string } | null>(null);
  const [condition, setCondition] = useState<Condition | null>(() => fromCel(src, operands));

  const seeded = seededFrom.current;
  if (!seeded || seeded.src !== src || seeded.signature !== signature) {
    seededFrom.current = { src, signature };
    setCondition(fromCel(src, operands));
  }

  /**
   * Which surface shows. Seeded from whether the source parsed at mount, so a
   * guard that opens unreadable stays on the CEL input while the author repairs
   * it: deriving the surface from `unparseable` alone would swap the field out
   * mid-keystroke, the moment the text first parses. The author leaves by the
   * toggle, which frees itself as soon as there is something to toggle to.
   *
   * `unparseable` stays in the branch below as the null guard: `src` can also
   * turn unreadable from outside, through the JSON surface.
   */
  const [celMode, setCelMode] = useState(condition === null);

  const unparseable = condition === null;
  // While no row contributes, the draft may still hold a source: an unfinished
  // edit leaves it standing, and the readout says so.
  const preview = condition ? (toCel(condition, operands) ?? src) : src;

  const commit = (next: Condition) => {
    setCondition(next);
    const written = toCel(next, operands);
    const decision = commitDecision(written, condition?.rows.length ?? 0, next.rows.length, src);
    // `seededFrom` stays put on a hold, so the unfinished row survives the render.
    if (decision === "hold") return;
    seededFrom.current = { src: written, signature };
    onChange(written === undefined ? undefined : { lang: "cel", src: written });
  };

  // The explicit clear. `src` reads `undefined` in the divergent state before
  // and after, so the seed would not change and the rows are reset here.
  const clear = () => {
    setCondition({ joiner: "&&", rows: [] });
    seededFrom.current = { src: undefined, signature };
    onChange(undefined);
  };

  // `btn btn-ghost` plus the compiled style, joined in one `className`: a
  // `className` written after a spread of `stylex.props` would replace it.
  const clearCompiled = stylex.props(styles.conditionClear);
  const clearButton = clearLabel !== undefined && (
    <button
      type="button"
      {...clearCompiled}
      className={`btn btn-ghost ${clearCompiled.className ?? ""}`.trim()}
      onClick={clear}
    >
      {clearLabel}
    </button>
  );

  /** The footer's trailing controls: the clear command, when the site passes
   * one, then the CEL toggle. */
  const actions = (toggle: ReactNode) =>
    clearButton ? (
      <span {...stylex.props(styles.conditionActions)}>
        {clearButton}
        {toggle}
      </span>
    ) : (
      toggle
    );

  const toggleButton = (expanded: boolean, onClick: () => void, disabled?: boolean) =>
    toggleVariant === "disclosure" ? (
      <button
        type="button"
        {...stylex.props(styles.conditionMode, expanded && styles.conditionModeExpanded)}
        aria-expanded={expanded}
        onClick={onClick}
        disabled={disabled}
      >
        {t("condition.developerView")}
      </button>
    ) : (
      <button type="button" {...stylex.props(styles.conditionMode)} onClick={onClick} disabled={disabled}>
        {expanded ? t("condition.useBuilder") : t("condition.editAsCel")}
      </button>
    );

  if (celMode || unparseable) {
    return (
      <div {...stylex.props(styles.conditionInput)}>
        <ExpressionInput
          value={value}
          placeholder={placeholder}
          onChange={(next) => {
            seededFrom.current = null; // let the builder re-read what was typed
            onChange(next);
          }}
        />
        <div {...stylex.props(styles.conditionFooter)}>
          {unparseable && (
            <p {...stylex.props(styles.conditionParseError)} role="status">
              {t("condition.unparseable")}
            </p>
          )}
          {actions(toggleButton(true, () => setCelMode(false), unparseable))}
        </div>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.conditionInput)}>
      <ConditionBuilder condition={condition} operands={operands} onChange={commit} />
      <div {...stylex.props(styles.conditionFooter)}>
        <p {...stylex.props(styles.conditionReadout)}>
          <span {...stylex.props(styles.conditionReadoutLabel)}>{t("condition.celReadout")}</span>
          <code {...stylex.props(styles.conditionReadoutCode)}>{preview ?? t("condition.celEmpty")}</code>
        </p>
        {actions(toggleButton(false, () => setCelMode(true)))}
      </div>
    </div>
  );
}
