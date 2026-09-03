import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { canRemovePrincipal } from "./reportsLogic.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

/**
 * One principal list (`viewers` or `editors`): add by id/role/group name,
 * remove — except the owner's own editor entry, which the UI blocks rather
 * than letting a request the server would reject reach it (spec: "Removing
 * the owner from editors is prevented in the UI").
 */
/** `app.css`'s sharing rules, as StyleX. */
const styles = stylex.create({
  shareList: {
    marginBottom: space.s4,
  },
  principalList: {
    listStyle: "none",
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s2,
    padding: 0,
  },
  principalRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
    paddingBlock: space.s1,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
  },
  stamp: {
    display: "inline-block",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
  },
  shareAdd: {
    display: "flex",
    gap: space.s2,
  },
  scope: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s3,
    maxWidth: "46rem",
  },
});

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
    <div {...stylex.props(styles.shareList)}>
      <h3>{label}</h3>
      <ul {...stylex.props(styles.principalList)}>
        {values.map((principal) => (
          <li key={principal} {...stylex.props(styles.principalRow)}>
            <span translate="no">{principal}</span>
            {canRemovePrincipal(list, principal, owner) ? (
              <button type="button" className="btn btn-secondary" onClick={() => onChange(values.filter((v) => v !== principal))}>
                {t(locale, "builder.shareRemove")}
              </button>
            ) : (
              <span {...stylex.props(styles.stamp)}>{t(locale, "builder.shareOwnerLocked")}</span>
            )}
          </li>
        ))}
      </ul>
      <form
        {...stylex.props(styles.shareAdd)}
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
      {values.length > 0 && <p {...stylex.props(styles.scope)}>{t(locale, "builder.shareHint")}</p>}
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
