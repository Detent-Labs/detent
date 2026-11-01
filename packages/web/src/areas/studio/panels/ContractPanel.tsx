import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { fonts } from "form-ui/tokens.stylex";
import type { FieldId } from "workflow-engine/schema";
import { resolveDraftLocalizedText } from "../draft/localized-text";
import { useDraft } from "../draft/store";
import { t } from "../catalog.js";
import { appendOutcome } from "../draft/contractOutcomes";
import { draftFields } from "../draft/fields";
import { IssueList } from "./shared/IssueList";

const styles = stylex.create({
  // An ending's name is a value a caller's guard matches exactly
  // (`child.outcome == "approved"`), so it prints in the mono face.
  ending: {
    fontFamily: fonts.mono,
  },
});

/** Input/output fields and outcomes for a process authored as a subprocess-callable child. */
export function ContractPanel() {
  const { draft, mutate, contentLocale } = useDraft();
  const fields = draftFields(draft);
  const baseLocale = draft.baseLocale ?? "en";
  const fieldName = (f: (typeof fields)[number]) =>
    resolveDraftLocalizedText(f.label, contentLocale, baseLocale) || t("panelsScreen.unnamedField");
  const contract = draft.contract;
  const [newOutcome, setNewOutcome] = useState("");

  const toggleFieldRef = (list: "inputFields" | "outputFields", fieldId: FieldId) => {
    mutate((d) => {
      d.contract ??= {};
      const current = d.contract[list] ?? [];
      d.contract[list] = current.includes(fieldId) ? current.filter((f) => f !== fieldId) : [...current, fieldId];
    });
  };

  const addOutcome = () => {
    if (!newOutcome.trim()) return;
    mutate((d) => {
      d.contract ??= {};
      const current = d.contract.outcomes ?? [];
      const next = appendOutcome(current, newOutcome);
      if (next !== current) d.contract.outcomes = [...next];
    });
    setNewOutcome("");
  };

  const removeOutcome = (outcome: string) => {
    mutate((d) => {
      if (d.contract?.outcomes) d.contract.outcomes = d.contract.outcomes.filter((o) => o !== outcome);
    });
  };

  const enableContract = (enabled: boolean) => {
    mutate((d) => {
      if (enabled) d.contract ??= {};
      else d.contract = undefined;
    });
  };

  return (
    <div className="contract-panel">
      <label>
        <input type="checkbox" checked={contract !== undefined} onChange={(e) => enableContract(e.target.checked)} />
        {t("contract.callableCheckbox")}
      </label>

      {contract && (
        <>
          <fieldset>
            <legend>{t("contract.inputFieldsLegend")}</legend>
            {fields.map((f) => (
              <label key={f.id}>
                <input
                  type="checkbox"
                  checked={f.id !== undefined && (contract.inputFields ?? []).includes(f.id)}
                  onChange={() => f.id !== undefined && toggleFieldRef("inputFields", f.id)}
                />
                {fieldName(f)}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>{t("contract.outputFieldsLegend")}</legend>
            {fields.map((f) => (
              <label key={f.id}>
                <input
                  type="checkbox"
                  checked={f.id !== undefined && (contract.outputFields ?? []).includes(f.id)}
                  onChange={() => f.id !== undefined && toggleFieldRef("outputFields", f.id)}
                />
                {fieldName(f)}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>{t("contract.outcomesLegend")}</legend>
            {(contract.outcomes ?? []).map((o) => (
              <div key={o} className="outcome-row">
                <span {...stylex.props(styles.ending)}>{o}</span>
                <button type="button" className="btn btn-secondary" onClick={() => removeOutcome(o)}>
                  {t("contract.removeOutcome")}
                </button>
              </div>
            ))}
            <input
              type="text"
              value={newOutcome}
              placeholder={t("contract.newOutcomePlaceholder")}
              onChange={(e) => setNewOutcome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addOutcome()}
            />
            <button type="button" className="btn btn-secondary" onClick={addOutcome}>
              {t("contract.addOutcome")}
            </button>
          </fieldset>
        </>
      )}

      <IssueList entityId="contract" />
    </div>
  );
}
