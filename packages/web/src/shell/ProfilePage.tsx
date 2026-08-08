import { useEffect, useState } from "react";
import { fetchAccount, patchAccount, AppClientError } from "../api/client.js";
import { t } from "./catalog.js";
import { accountChanges, editSeed, profileFields, type ProfileEdits, type ProfileRow } from "./profileFields.js";
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
 * values in the mono face. Two of those rows carry a control instead of printed
 * text, and one primary action commits both.
 *
 * Which rows exist and which of them the actor may change is decided in
 * `profileFields.ts`, not here. A federated actor gets the identity-only pair
 * and no form at all, because `profileFields` returns no editable row for one.
 */
export function ProfilePage({ token, locale, onSaved, onUnauthorized }: ProfilePageProps) {
  const [account, setAccount] = useState<AccountView | undefined>(undefined);
  const [edits, setEdits] = useState<ProfileEdits | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

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
        if (err instanceof AppClientError && err.status === 401) onUnauthorized();
        else setLoadFailed(true);
      });
    return () => {
      live = false;
    };
    // `locale` seeds the picker only for an account that never chose one, and a
    // language change mid-page must not refetch and discard a typed name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, onUnauthorized]);

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
      if (err instanceof AppClientError && err.status === 401) onUnauthorized();
      else setSaveFailed(true);
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

  const view = profileFields(account);
  const facts = (
    <dl className="shell-profile-facts">
      {view.rows.map((row) => (
        <div className="shell-profile-row" key={row.key}>
          <dt className="shell-profile-term">
            <ProfileTerm row={row} locale={locale} />
          </dt>
          <dd className={row.mono ? "shell-profile-value shell-profile-machine" : "shell-profile-value"}>
            <ProfileControl row={row} edits={edits} disabled={saving} onChange={setEdits} />
          </dd>
        </div>
      ))}
    </dl>
  );

  return (
    <main className="shell-screen shell-profile">
      <h1>{t(locale, "profile.title")}</h1>
      {view.editable ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(edits);
          }}
        >
          {facts}
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
          {facts}
          <p className="shell-profile-note">{t(locale, "profile.federated")}</p>
        </>
      )}
    </main>
  );
}

/** A row's term. An editable row's term is the control's label, so it carries the association a `<dt>` alone does not. */
function ProfileTerm({ row, locale }: { row: ProfileRow; locale: UiLocale }) {
  const text = t(locale, row.labelKey);
  return row.control === "read-only" ? <>{text}</> : <label htmlFor={`profile-${row.key}`}>{text}</label>;
}

/** The control the row asked for. The three cases are the three `control` values `profileFields` mints, and nothing else decides between them. */
function ProfileControl({
  row,
  edits,
  disabled,
  onChange,
}: {
  row: ProfileRow;
  edits: ProfileEdits;
  disabled: boolean;
  onChange: (next: ProfileEdits) => void;
}) {
  if (row.control === "text") {
    return (
      <input
        id={`profile-${row.key}`}
        type="text"
        value={edits.displayName}
        disabled={disabled}
        autoComplete="name"
        onChange={(e) => onChange({ ...edits, displayName: e.target.value })}
      />
    );
  }
  if (row.control === "locale") {
    return (
      <select
        id={`profile-${row.key}`}
        value={edits.locale}
        disabled={disabled}
        onChange={(e) => onChange({ ...edits, locale: e.target.value as UiLocale })}
      >
        <option value="en">EN</option>
        <option value="de">DE</option>
      </select>
    );
  }
  return <>{row.value}</>;
}
