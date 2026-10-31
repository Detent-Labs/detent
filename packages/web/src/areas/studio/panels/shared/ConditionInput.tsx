import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";
import { ExpressionInput } from "./ExpressionInput";
import { ConditionBuilder } from "./ConditionBuilder";
import {
  buildOperands,
  commitDecision,
  conditionSentence,
  fromCel,
  operandSignature,
  toCel,
  type Condition,
} from "./conditionLogic";

const styles = stylex.create({
  conditionInput: {
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    minWidth: 0,
  },
  // A note (`DESIGN.md` Inputs / Fields): no box, a 2px hairline rule on its
  // left, 12px from the text, in the written face and in ink.
  conditionSentence: {
    margin: 0,
    paddingLeft: space.s3,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    fontFamily: fonts.body,
    color: colors.text,
    minWidth: 0,
    maxWidth: "60ch",
    overflowWrap: "anywhere",
  },
  conditionUnparseable: {
    margin: 0,
    color: colors.refusal,
    fontSize: "0.85rem",
  },
  // The authoring command (`DESIGN.md` Buttons): a ghost button in slate, mono
  // at 11px, equal to the change list's command. It composes over
  // `btn btn-ghost`, whose accent it replaces. Its label lists step labels, so
  // it wraps anywhere instead of clipping.
  conditionClear: {
    alignSelf: "flex-start",
    maxWidth: "100%",
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
  // The way out's own Developer view (`PathsPanel.tsx`), duplicated: an area's
  // component never reads another component's style object.
  developer: {
    paddingBlock: space.s2,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  developerSummary: {
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  celField: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    minWidth: 0,
  },
  celFieldInDeveloper: {
    marginBlockStart: space.s2,
  },
  celCaption: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
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
   * Where the CEL text input stands. `"disclosure"` (default) puts it in a
   * closed "Developer view" `<details>` at the site's foot. `"inline"` draws
   * the caption and the input with no disclosure, for a site that already
   * stands inside a Developer view: the form editor's flag override.
   */
  cel?: "disclosure" | "inline";
  /**
   * The label of a clear command above the Developer view. Its presence shows
   * the command. Pressing it calls `onChange(undefined)` and empties the local
   * rows. Only a site that can hold a condition the rows do not show passes
   * it: the Fields tab, where the referencing views can disagree and `value`
   * reads `undefined` for all of them.
   */
  clearLabel?: string;
  /**
   * The sentence in place of "No condition yet: this always matches." while
   * no row stands and no source is stored. The Fields tab passes it when the
   * referencing views disagree: `value` then reads `undefined`, though some
   * views hold a condition.
   */
  emptySentence?: string;
}

/**
 * The condition surface: a row builder, the condition read back as a sentence
 * under it, and the CEL text input in a Developer view at the foot. Source
 * that does not parse draws a notice in place of the rows and the sentence,
 * and opens the Developer view.
 *
 * `onChange` fires on an authoring action that settles the condition: a
 * complete row, the removal of a row that takes a stored source with it, an
 * edit of the CEL text, or the clear command. Mounting, reading, opening the
 * Developer view and an unfinished row never write, so a guard the author only
 * looks at stays byte for byte — the rule that keeps the database from filling
 * with flattened conditions.
 */
export function ConditionInput({
  value,
  onChange,
  stepId,
  placeholder,
  cel = "disclosure",
  clearLabel,
  emptySentence,
}: Props) {
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

  /**
   * Whether the Developer view stands open. It opens on a read that does not
   * parse, at mount or on a later re-seed (the JSON surface, or another field
   * of the same editor, can turn the source unreadable). Once the text parses
   * it stays open, so the input the author types in never moves; only the
   * author closes it. It never reaches the draft.
   */
  const [developerOpen, setDeveloperOpen] = useState(condition === null);

  const seeded = seededFrom.current;
  if (!seeded || seeded.src !== src || seeded.signature !== signature) {
    seededFrom.current = { src, signature };
    const read = fromCel(src, operands);
    setCondition(read);
    if (read === null) setDeveloperOpen(true);
  }

  const sentenceId = useId();

  // The clear press unmounts the clear command, which would drop focus to
  // <body>; the effect below runs once the next render has drawn the control
  // to land on.
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusAfterClear, setFocusAfterClear] = useState(false);

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
    setFocusAfterClear(true);
    onChange(undefined);
  };

  // The add-row button: a clear leaves no row and no source, so the rows draw.
  useEffect(() => {
    if (!focusAfterClear) return;
    setFocusAfterClear(false);
    rootRef.current?.querySelector<HTMLElement>("button.condition-add")?.focus();
  }, [focusAfterClear]);

  // `btn btn-ghost` plus the compiled style, joined in one `className`: a
  // `className` written after a spread of `stylex.props` would replace it.
  const clearCompiled = stylex.props(styles.conditionClear);

  const celField = (
    <label {...stylex.props(styles.celField, cel === "disclosure" && styles.celFieldInDeveloper)}>
      <span {...stylex.props(styles.celCaption)}>{t("condition.celCaption")}</span>
      <ExpressionInput
        value={value}
        placeholder={placeholder}
        onChange={(next) => {
          seededFrom.current = null; // let the builder re-read what was typed
          onChange(next);
        }}
      />
    </label>
  );

  return (
    <div ref={rootRef} {...stylex.props(styles.conditionInput)}>
      {condition === null ? (
        <p {...stylex.props(styles.conditionUnparseable)} role="status">
          {t("condition.unparseableRows")}
        </p>
      ) : (
        <>
          <ConditionBuilder condition={condition} operands={operands} onChange={commit} describedBy={sentenceId} />
          <p id={sentenceId} {...stylex.props(styles.conditionSentence)}>
            {emptySentence !== undefined && !condition.rows.length && !src?.trim()
              ? emptySentence
              : conditionSentence(condition, operands, src)}
          </p>
        </>
      )}
      {clearLabel !== undefined && (
        <button
          type="button"
          {...clearCompiled}
          className={`btn btn-ghost ${clearCompiled.className ?? ""}`.trim()}
          onClick={clear}
        >
          {clearLabel}
        </button>
      )}
      {cel === "inline" ? (
        celField
      ) : (
        <details
          {...stylex.props(styles.developer)}
          open={developerOpen}
          onToggle={(e) => setDeveloperOpen(e.currentTarget.open)}
        >
          <summary {...stylex.props(styles.developerSummary)}>{t("condition.developerView")}</summary>
          {celField}
        </details>
      )}
    </div>
  );
}
