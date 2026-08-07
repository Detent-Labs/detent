import { useMemo, useRef, useState } from "react";
import type { Expression } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import type { DraftField } from "../../draft/fields";
import { useDraft } from "../../draft/store";
import { t } from "../../catalog.js";
import { ExpressionInput } from "./ExpressionInput";
import { RuleBuilder } from "./RuleBuilder";
import { buildRuleOperands, fromRuleCel, ruleOperandSignature, toRuleCel, type RuleCondition } from "./ruleLogic";

interface Props {
  /** The field whose `validation.rule` this edits — supplies "this answer"'s
   * own key and CEL type, which no path-guard or view-override site has. */
  field: DraftField;
  value: DraftOf<Expression> | undefined;
  onChange: (next: DraftOf<Expression> | undefined) => void;
}

/**
 * `rule`'s surface (task 4.5, `studio-field-validation-form`): the row
 * builder, its CEL readout, and a "Developer view" disclosure holding the
 * raw CEL input — `ConditionInput`'s own shape, over `ruleLogic` instead of
 * `conditionLogic`. Stays a separate component per design.md: this site's
 * default operand and its field-against-field comparison have no
 * counterpart on a path guard or a view override.
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

  const seeded = seededFrom.current;
  if (!seeded || seeded.src !== src || seeded.signature !== signature) {
    seededFrom.current = { src, signature };
    setCondition(fromRuleCel(src, operands));
  }

  // Seeded from whether the source parsed at mount, the same reasoning
  // `ConditionInput`'s `celMode` state carries. `unparseable` stays the null
  // guard below: `src` can also turn unreadable from outside, through the
  // JSON surface.
  const [devOpen, setDevOpen] = useState(condition === null);
  const unparseable = condition === null;
  const preview = condition ? toRuleCel(condition, operands) : src;

  const commit = (next: RuleCondition) => {
    setCondition(next);
    const written = toRuleCel(next, operands);
    seededFrom.current = { src: written, signature };
    onChange(written === undefined ? undefined : { lang: "cel", src: written });
  };

  if (devOpen || unparseable) {
    return (
      <div className="condition-input rule-input">
        <ExpressionInput
          value={value}
          onChange={(next) => {
            seededFrom.current = null; // let the builder re-read what was typed
            onChange(next);
          }}
        />
        <div className="condition-footer">
          {unparseable && (
            <p className="condition-parse-error" role="status">
              {t("ruleBuilder.unparseable")}
            </p>
          )}
          <button
            type="button"
            className="condition-mode condition-mode-disclosure"
            aria-expanded={true}
            onClick={() => setDevOpen(false)}
            disabled={unparseable}
          >
            {t("ruleBuilder.developerView")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="condition-input rule-input">
      <RuleBuilder condition={condition} operands={operands} onChange={commit} />
      <div className="condition-footer">
        <p className="condition-readout">
          <span className="condition-readout-label">{t("ruleBuilder.celReadout")}</span>
          <code>{preview ?? t("ruleBuilder.celEmpty")}</code>
        </p>
        <button type="button" className="condition-mode condition-mode-disclosure" aria-expanded={false} onClick={() => setDevOpen(true)}>
          {t("ruleBuilder.developerView")}
        </button>
      </div>
    </div>
  );
}
