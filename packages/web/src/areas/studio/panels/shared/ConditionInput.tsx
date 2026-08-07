import { useMemo, useRef, useState } from "react";
import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";
import { ExpressionInput } from "./ExpressionInput";
import { ConditionBuilder } from "./ConditionBuilder";
import { buildOperands, fromCel, operandSignature, toCel, type Condition } from "./conditionLogic";

interface Props {
  value: DraftOf<Expression> | undefined;
  onChange: (next: DraftOf<Expression> | undefined) => void;
  /** The step this condition sits on. Supplies `child.*` when its child resolved. */
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
}

/**
 * The condition surface: a row builder, the CEL it produces on a read-only
 * line, and a toggle to the raw CEL input.
 *
 * `onChange` fires on an authoring action alone. Mounting, reading and
 * switching the mode never write, so a guard the author only looks at stays
 * byte for byte — the rule that keeps the database from filling with
 * flattened conditions.
 */
export function ConditionInput({ value, onChange, stepId, placeholder, toggleVariant = "link" }: Props) {
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
  const preview = condition ? toCel(condition, operands) : src;

  const commit = (next: Condition) => {
    setCondition(next);
    const written = toCel(next, operands);
    seededFrom.current = { src: written, signature };
    onChange(written === undefined ? undefined : { lang: "cel", src: written });
  };

  const toggleButton = (expanded: boolean, onClick: () => void, disabled?: boolean) =>
    toggleVariant === "disclosure" ? (
      <button
        type="button"
        className="condition-mode condition-mode-disclosure"
        aria-expanded={expanded}
        onClick={onClick}
        disabled={disabled}
      >
        {t("condition.developerView")}
      </button>
    ) : (
      <button type="button" className="condition-mode" onClick={onClick} disabled={disabled}>
        {expanded ? t("condition.useBuilder") : t("condition.editAsCel")}
      </button>
    );

  if (celMode || unparseable) {
    return (
      <div className="condition-input">
        <ExpressionInput
          value={value}
          placeholder={placeholder}
          onChange={(next) => {
            seededFrom.current = null; // let the builder re-read what was typed
            onChange(next);
          }}
        />
        <div className="condition-footer">
          {unparseable && (
            <p className="condition-parse-error" role="status">
              {t("condition.unparseable")}
            </p>
          )}
          {toggleButton(true, () => setCelMode(false), unparseable)}
        </div>
      </div>
    );
  }

  return (
    <div className="condition-input">
      <ConditionBuilder condition={condition} operands={operands} onChange={commit} />
      <div className="condition-footer">
        <p className="condition-readout">
          <span className="condition-readout-label">{t("condition.celReadout")}</span>
          <code>{preview ?? t("condition.celEmpty")}</code>
        </p>
        {toggleButton(false, () => setCelMode(true))}
      </div>
    </div>
  );
}
