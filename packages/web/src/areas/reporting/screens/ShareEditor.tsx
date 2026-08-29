import { useState } from "react";
import { canRemovePrincipal } from "./reportsLogic.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

/**
 * One principal list (`viewers` or `editors`): add by id/role/group name,
 * remove — except the owner's own editor entry, which the UI blocks rather
 * than letting a request the server would reject reach it (spec: "Removing
 * the owner from editors is prevented in the UI").
 */
function PrincipalList({
  label,
  list,
  values,
  owner,
  onChange,
  locale,
}: {
  label: string;
  list: "viewers" | "editors";
  values: string[];
  owner: string;
  onChange: (next: string[]) => void;
  locale: UiLocale;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="rep-share-list">
      <h3>{label}</h3>
      <ul className="rep-principal-list">
        {values.map((principal) => (
          <li key={principal} className="rep-principal-row">
            <span translate="no">{principal}</span>
            {canRemovePrincipal(list, principal, owner) ? (
              <button type="button" className="btn btn-secondary" onClick={() => onChange(values.filter((v) => v !== principal))}>
                {t(locale, "builder.shareRemove")}
              </button>
            ) : (
              <span className="rep-stamp">{t(locale, "builder.shareOwnerLocked")}</span>
            )}
          </li>
        ))}
      </ul>
      <form
        className="rep-share-add"
        onSubmit={(e) => {
          e.preventDefault();
          const value = draft.trim();
          if (value && !values.includes(value)) onChange([...values, value]);
          setDraft("");
        }}
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t(locale, "builder.shareAddPlaceholder")}
          aria-label={label}
        />
        <button type="submit" className="btn btn-secondary">
          {t(locale, "builder.shareAdd")}
        </button>
      </form>
      {values.length > 0 && <p className="rep-scope">{t(locale, "builder.shareHint")}</p>}
    </div>
  );
}

export function ShareEditor({
  owner,
  viewers,
  editors,
  onViewersChange,
  onEditorsChange,
  locale,
}: {
  owner: string;
  viewers: string[];
  editors: string[];
  onViewersChange: (next: string[]) => void;
  onEditorsChange: (next: string[]) => void;
  locale: UiLocale;
}) {
  return (
    <section>
      <h2>{t(locale, "builder.share")}</h2>
      <PrincipalList label={t(locale, "builder.shareEditors")} list="editors" values={editors} owner={owner} onChange={onEditorsChange} locale={locale} />
      <PrincipalList label={t(locale, "builder.shareViewers")} list="viewers" values={viewers} owner={owner} onChange={onViewersChange} locale={locale} />
    </section>
  );
}
