import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { fetchAccount, patchAccount } from "../api/client.js";
import { useFail } from "./useFail.js";
import { t } from "./catalog.js";
import { ABSENT, accountChanges, editSeed, rolesText, type ProfileEdits } from "./profileFields.js";
import type { AccountView } from "../api/types.js";
import type { UiLocale } from "../i18n/locale.js";
import { colors, fonts, space } from "form-ui/tokens.stylex";

/** `.shell-screen` (duplicated locally, same shape as `LoginScreen.tsx`'s —
 * the two share no component) plus `.shell-error` and every `.shell-profile-*`
 * rule from `shell.css`. `.shell-profile` itself carries no rule of its own;
 * it stays a literal hook class beside the compiled `screen` style. The
 * `.shell-profile-value input` descendant selector becomes a style applied
 * directly to this file's one `<input>`, since this component owns it. */
const styles = stylex.create({
  screen: {
    maxWidth: "46rem",
    marginInline: "auto",
    paddingBlock: space.s6,
    paddingInline: space.s3,
  },
  error: {
    color: colors.refusal,
  },
  facts: {
    margin: 0,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
  },
  row: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(7rem, 11rem) 1fr",
      "@media (max-width: 30rem)": "1fr",
    },
    gap: `${space.s1} ${space.s4}`,
    alignItems: "baseline",
    paddingBlock: space.s3,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  term: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  value: {
    margin: 0,
    overflowWrap: "anywhere",
  },
  machine: {
    fontFamily: fonts.mono,
  },
  valueInput: {
    width: "100%",
    maxWidth: "22rem",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: space.s3,
    marginTop: space.s4,
  },
  status: {
    margin: 0,
    fontSize: "0.85rem",
    color: colors.textMuted,
  },
  note: {
    maxWidth: "34rem",
    color: colors.textMuted,
  },
});

interface ProfilePageProps {
  token: string;
  locale: UiLocale;
  /** The saved account, so the shell can refresh the session and the active language from it. */
  onSaved: (account: AccountView) => void;
  onUnauthorized: () => void;
}

/**
 * One case in the register, and the case is the actor. The page is a column of
 * ruled rows: the term on the left, the value on the right of the rule, machine
 * values in the mono face. Two branches exist and each renders its own fixed
 * set of rows directly: a federated actor gets the identity-only pair (id,
 * roles) and no form; a local account gets four read-only rows (email, roles,
 * manager) plus a name box and a locale picker, and one primary action commits
 * both.
 */
export function ProfilePage({ token, locale, onSaved, onUnauthorized }: ProfilePageProps) {
  const [account, setAccount] = useState<AccountView | undefined>(undefined);
  const [edits, setEdits] = useState<ProfileEdits | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const failLoad = useFail(onUnauthorized, () => setLoadFailed(true));
  const failSave = useFail(onUnauthorized, () => setSaveFailed(true));

  useEffect(() => {
    let live = true;
    void fetchAccount(token)
      .then((loaded) => {
        if (!live) return;
        setAccount(loaded);
        setEdits(editSeed(loaded, locale));
      })
      .catch((err: unknown) => {
        if (!live) return;
        failLoad(err);
      });
    return () => {
      live = false;
    };
    // `locale` seeds the picker only for an account that never chose one, and a
    // language change mid-page must not refetch and discard a typed name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, failLoad]);

  const submit = async (current: ProfileEdits) => {
    setSaving(true);
    setSaved(false);
    setSaveFailed(false);
    try {
      const updated = await patchAccount(token, accountChanges(current));
      setAccount(updated);
      setEdits(editSeed(updated, locale));
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      failSave(err);
    } finally {
      setSaving(false);
    }
  };

  const screenProps = stylex.props(styles.screen);

  if (loadFailed) {
    return (
      <main className={`shell-profile ${screenProps.className}`} style={screenProps.style}>
        <h1>{t(locale, "profile.title")}</h1>
        <p {...stylex.props(styles.error)}>{t(locale, "error.generic")}</p>
      </main>
    );
  }

  if (!account || !edits) {
    return (
      <main className={`shell-profile ${screenProps.className}`} style={screenProps.style}>
        <h1>{t(locale, "profile.title")}</h1>
        <p {...stylex.props(styles.status)}>{t(locale, "area.loading")}</p>
      </main>
    );
  }

  return (
    <main className={`shell-profile ${screenProps.className}`} style={screenProps.style}>
      <h1>{t(locale, "profile.title")}</h1>
      {account.editable ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(edits);
          }}
        >
          <dl {...stylex.props(styles.facts)}>
            <div {...stylex.props(styles.row)}>
              <dt {...stylex.props(styles.term)}>{t(locale, "profile.email")}</dt>
              <dd {...stylex.props(styles.value)}>{account.email ?? ABSENT}</dd>
            </div>
            <div {...stylex.props(styles.row)}>
              <dt {...stylex.props(styles.term)}>{t(locale, "profile.roles")}</dt>
              <dd {...stylex.props(styles.value, styles.machine)}>{rolesText(account.roles)}</dd>
            </div>
            <div {...stylex.props(styles.row)}>
              <dt {...stylex.props(styles.term)}>{t(locale, "profile.manager")}</dt>
              <dd {...stylex.props(styles.value, styles.machine)}>{account.managerUserId ?? ABSENT}</dd>
            </div>
            <div {...stylex.props(styles.row)}>
              <dt {...stylex.props(styles.term)}>
                <label htmlFor="profile-displayName">{t(locale, "profile.displayName")}</label>
              </dt>
              <dd {...stylex.props(styles.value)}>
                <input
                  id="profile-displayName"
                  type="text"
                  value={edits.displayName}
                  disabled={saving}
                  autoComplete="name"
                  onChange={(e) => setEdits({ ...edits, displayName: e.target.value })}
                  {...stylex.props(styles.valueInput)}
                />
              </dd>
            </div>
            <div {...stylex.props(styles.row)}>
              <dt {...stylex.props(styles.term)}>
                <label htmlFor="profile-locale">{t(locale, "profile.locale")}</label>
              </dt>
              <dd {...stylex.props(styles.value)}>
                <select
                  id="profile-locale"
                  value={edits.locale}
                  disabled={saving}
                  onChange={(e) => setEdits({ ...edits, locale: e.target.value as UiLocale })}
                >
                  <option value="en">EN</option>
                  <option value="de">DE</option>
                </select>
              </dd>
            </div>
          </dl>
          <div {...stylex.props(styles.actions)}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {t(locale, "profile.save")}
            </button>
            <p {...stylex.props(styles.status)} role="status">
              {saved ? t(locale, "profile.saved") : ""}
            </p>
          </div>
          {saveFailed ? <p {...stylex.props(styles.error)}>{t(locale, "profile.saveFailed")}</p> : null}
        </form>
      ) : (
        <>
          <dl {...stylex.props(styles.facts)}>
            <div {...stylex.props(styles.row)}>
              <dt {...stylex.props(styles.term)}>{t(locale, "profile.id")}</dt>
              <dd {...stylex.props(styles.value, styles.machine)}>{account.id}</dd>
            </div>
            <div {...stylex.props(styles.row)}>
              <dt {...stylex.props(styles.term)}>{t(locale, "profile.roles")}</dt>
              <dd {...stylex.props(styles.value, styles.machine)}>{rolesText(account.roles)}</dd>
            </div>
          </dl>
          <p {...stylex.props(styles.note)}>{t(locale, "profile.federated")}</p>
        </>
      )}
    </main>
  );
}
