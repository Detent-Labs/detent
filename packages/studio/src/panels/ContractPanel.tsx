import { useState } from "react";
import type { FieldId } from "workflow-engine/schema";
import { useDraft } from "../draft/store";
import { t } from "../i18n/catalog";
import { draftFields } from "../draft/fields";
import { IssueList } from "./shared/IssueList";

/** Input/output fields and outcomes for a process authored as a subprocess-callable child. */
export function ContractPanel() {
  const { draft, mutate } = useDraft();
  const fields = draftFields(draft);
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
      d.contract.outcomes ??= [];
      if (!d.contract.outcomes.includes(newOutcome)) d.contract.outcomes.push(newOutcome);
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
      <h3>{t("contract.heading")}</h3>
      <label>
        {t("contract.callableCheckbox")}
        <input type="checkbox" checked={contract !== undefined} onChange={(e) => enableContract(e.target.checked)} />
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
                {f.key ?? f.id}
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
                {f.key ?? f.id}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend>{t("contract.outcomesLegend")}</legend>
            {(contract.outcomes ?? []).map((o) => (
              <div key={o} className="outcome-row">
                <span>{o}</span>
                <button type="button" onClick={() => removeOutcome(o)}>
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
            <button type="button" onClick={addOutcome}>
              {t("contract.addOutcome")}
            </button>
          </fieldset>
        </>
      )}

      <IssueList entityId="contract" />
    </div>
  );
}
