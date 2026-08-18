import { useEffect, useState } from "react";
import { fetchAccount, patchAccount } from "../api/client.js";
import { useFail } from "./useFail.js";
import { t } from "./catalog.js";
import { ABSENT, accountChanges, editSeed, rolesText, type ProfileEdits } from "./profileFields.js";
import type { AccountView } from "../api/types.js";
import type { UiLocale } from "../i18n/locale.js";

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

  if (loadFailed) {
    return (
      <main className="shell-screen shell-profile">
        <h1>{t(locale, "profile.title")}</h1>
        <p className="shell-error">{t(locale, "error.generic")}</p>
      </main>
    );
  }

  if (!account || !edits) {
    return (
      <main className="shell-screen shell-profile">
        <h1>{t(locale, "profile.title")}</h1>
        <p className="shell-profile-status">{t(locale, "area.loading")}</p>
      </main>
    );
  }

  return (
    <main className="shell-screen shell-profile">
      <h1>{t(locale, "profile.title")}</h1>
      {account.editable ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(edits);
          }}
        >
          <dl className="shell-profile-facts">
            <div className="shell-profile-row">
              <dt className="shell-profile-term">{t(locale, "profile.email")}</dt>
              <dd className="shell-profile-value">{account.email ?? ABSENT}</dd>
            </div>
            <div className="shell-profile-row">
              <dt className="shell-profile-term">{t(locale, "profile.roles")}</dt>
              <dd className="shell-profile-value shell-profile-machine">{rolesText(account.roles)}</dd>
            </div>
            <div className="shell-profile-row">
              <dt className="shell-profile-term">{t(locale, "profile.manager")}</dt>
              <dd className="shell-profile-value shell-profile-machine">{account.managerUserId ?? ABSENT}</dd>
            </div>
            <div className="shell-profile-row">
              <dt className="shell-profile-term">
                <label htmlFor="profile-displayName">{t(locale, "profile.displayName")}</label>
              </dt>
              <dd className="shell-profile-value">
                <input
                  id="profile-displayName"
                  type="text"
                  value={edits.displayName}
                  disabled={saving}
                  autoComplete="name"
                  onChange={(e) => setEdits({ ...edits, displayName: e.target.value })}
                />
              </dd>
            </div>
            <div className="shell-profile-row">
              <dt className="shell-profile-term">
                <label htmlFor="profile-locale">{t(locale, "profile.locale")}</label>
              </dt>
              <dd className="shell-profile-value">
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
          <div className="shell-profile-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {t(locale, "profile.save")}
            </button>
            <p className="shell-profile-status" role="status">
              {saved ? t(locale, "profile.saved") : ""}
            </p>
          </div>
          {saveFailed ? <p className="shell-error">{t(locale, "profile.saveFailed")}</p> : null}
        </form>
      ) : (
        <>
          <dl className="shell-profile-facts">
            <div className="shell-profile-row">
              <dt className="shell-profile-term">{t(locale, "profile.id")}</dt>
              <dd className="shell-profile-value shell-profile-machine">{account.id}</dd>
            </div>
            <div className="shell-profile-row">
              <dt className="shell-profile-term">{t(locale, "profile.roles")}</dt>
              <dd className="shell-profile-value shell-profile-machine">{rolesText(account.roles)}</dd>
            </div>
          </dl>
          <p className="shell-profile-note">{t(locale, "profile.federated")}</p>
        </>
      )}
    </main>
  );
}
