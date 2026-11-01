import { useMemo, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import type { DraftField } from "../../draft/fields";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";
import { ExpressionInput } from "./ExpressionInput";
import { RuleBuilder } from "./RuleBuilder";
import { commitDecision } from "./conditionLogic";
import { buildRuleOperands, fromRuleCel, ruleOperandSignature, ruleSentence, toRuleCel, type RuleCondition } from "./ruleLogic";

const styles = stylex.create({
  conditionInput: {
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    minWidth: 0,
  },
  // A note (`DESIGN.md` Inputs / Fields): no box, a 2px hairline rule on its
  // left, 12px from the text, in the written face and in ink. The same note
  // `ConditionInput` draws under its rows.
  ruleSentence: {
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
  ruleUnparseable: {
    margin: 0,
    color: colors.refusal,
    fontSize: "0.85rem",
  },
  // The condition input's Developer view, duplicated: an area's component
  // never reads another component's style object.
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
    marginBlockStart: space.s2,
    minWidth: 0,
  },
  celCaption: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
});

interface Props {
  /** The field whose `validation.rule` this edits — supplies "this answer"'s
   * own key and CEL type, which no path-guard or view-override site has. */
  field: DraftField;
  value: DraftOf<Expression> | undefined;
  onChange: (next: DraftOf<Expression> | undefined) => void;
}

/**
 * `rule`'s surface (`studio-field-validation-form`), in `ConditionInput`'s
 * shape: the row builder, the rule read back as a sentence under it, and the
 * CEL input in a closed "Developer view" disclosure at the foot. Source that
 * does not parse draws a notice in place of the rows and the sentence, and
 * opens the disclosure. Stays a separate component: this site's default
 * operand and its field-against-field comparison have no counterpart on a
 * path guard or a view override.
 */
export function RuleInput({ field, value, onChange }: Props) {
  const { draft, contentLocale } = useDraft();

  const operands = useMemo(
    () =>
      buildRuleOperands({
        field,
        fields: draft.fields,
        locale: contentLocale,
        baseLocale: draft.baseLocale ?? contentLocale,
        thisAnswerLabel: t("ruleBuilder.thisAnswer"),
      }),
    [field, draft.fields, draft.baseLocale, contentLocale],
  );

  const src = value?.src;

  // Re-seeded only when what it was read FROM changes — the same rule
  // `ConditionInput` follows, and for the same reason: a half-filled row
  // `toRuleCel` deliberately omits must not vanish on the next render.
  const signature = ruleOperandSignature(operands);
  const seededFrom = useRef<{ src: string | undefined; signature: string } | null>(null);
  const [condition, setCondition] = useState<RuleCondition | null>(() => fromRuleCel(src, operands));

  // Opens on a read that does not parse, at mount or on a later re-seed. Once
  // the text parses it stays open, so the input the author types in never
  // moves; only the author closes it.
  const [developerOpen, setDeveloperOpen] = useState(condition === null);

  const seeded = seededFrom.current;
  if (!seeded || seeded.src !== src || seeded.signature !== signature) {
    seededFrom.current = { src, signature };
    const read = fromRuleCel(src, operands);
    setCondition(read);
    if (read === null) setDeveloperOpen(true);
  }

  const commit = (next: RuleCondition) => {
    setCondition(next);
    const written = toRuleCel(next, operands);
    const decision = commitDecision(written, condition?.rows.length ?? 0, next.rows.length, src);
    // `seededFrom` stays put on a hold, so the unfinished row survives the render.
    if (decision === "hold") return;
    seededFrom.current = { src: written, signature };
    onChange(written === undefined ? undefined : { lang: "cel", src: written });
  };

  return (
    <div {...stylex.props(styles.conditionInput)}>
      {condition === null ? (
        <p {...stylex.props(styles.ruleUnparseable)} role="status">
          {t("condition.unparseable")}
        </p>
      ) : (
        <>
          <RuleBuilder condition={condition} operands={operands} onChange={commit} />
          <p {...stylex.props(styles.ruleSentence)}>
            {ruleSentence(condition, operands, src)}
          </p>
        </>
      )}
      <details
        {...stylex.props(styles.developer)}
        open={developerOpen}
        onToggle={(e) => setDeveloperOpen(e.currentTarget.open)}
      >
        <summary {...stylex.props(styles.developerSummary)}>{t("condition.developerView")}</summary>
        <label {...stylex.props(styles.celField)}>
          <span {...stylex.props(styles.celCaption)}>{t("condition.celCaption")}</span>
          <ExpressionInput
            value={value}
            onChange={(next) => {
              seededFrom.current = null; // let the builder re-read what was typed
              onChange(next);
            }}
          />
        </label>
      </details>
    </div>
  );
}
