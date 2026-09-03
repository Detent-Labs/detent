import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listUiStringOverrides, putUiStringOverride } from "../api/client.js";
import type { UiStringOverrideMap } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import { loadUiStringOverrides } from "../../../i18n/overrides.js";
import { OVERRIDABLE_AREAS, localesOf, rowsFor, pendingWrites } from "./uiStringsLogic.js";
import { t, tFill } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

/** `app.css`'s screen/controls/field/table/note rules, as StyleX. `field`
 * merges `.admin-field`'s two source declarations (design.md D12). */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s2,
    marginBottom: space.s3,
    alignItems: "center",
  },
  controlsField: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.75rem",
    fontFamily: fonts.body,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.9rem",
  },
  th: {
    textAlign: "left",
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
    padding: space.s2,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
  },
  td: {
    padding: space.s2,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    verticalAlign: "top",
  },
  note: {
    color: colors.textMuted,
    fontSize: "0.85rem",
    maxWidth: "60ch",
  },
});

interface UiStringsScreenProps {
  token: string;
  /** The chrome's locale. The locale being edited is `locale` state below, and the two are independent. */
  locale: UiLocale;
  onUnauthorized: () => void;
}

/**
 * One area's wording, one locale at a time: every key the shipped catalog
 * declares, its builtin value, and an input holding whatever this deployment
 * stored instead.
 *
 * An emptied input deletes its override rather than storing an empty string.
 * `resolveOverride(...) ?? builtin` does not fall back on `""`, so a stored one
 * would render a blank label. `pendingWrite` in `uiStringsLogic.ts` decides
 * that, and the route refuses `""` again on its own side.
 *
 * A save re-reads the public map and installs it, so the operator's own session
 * holds the new wording. Screens already rendered keep the old value until
 * React renders them again — the same reason the boot fetch sits in `main.tsx`.
 */
export function UiStringsScreen({ token, locale: uiLocale, onUnauthorized }: UiStringsScreenProps) {
  const [area, setArea] = useState<string>(OVERRIDABLE_AREAS[0]);
  const [locale, setLocale] = useState<string>(localesOf(OVERRIDABLE_AREAS[0])[0] ?? "en");
  const [overrides, setOverrides] = useState<UiStringOverrideMap>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, uiLocale)));

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setOverrides(await listUiStringOverrides(token));
      setDrafts({});
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [token, uiLocale, fail]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const locales = localesOf(area);
  const rows = rowsFor(area, locale, overrides);
  const writes = pendingWrites(rows, drafts);

  // Studio ships `en` alone, so switching to it from a `de` selection would
  // otherwise list a locale that area has no catalog for, and show no rows.
  const pickArea = (next: string) => {
    setArea(next);
    setDrafts({});
    setSaved(false);
    if (!localesOf(next).includes(locale)) setLocale(localesOf(next)[0] ?? "en");
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      for (const write of writes) {
        await putUiStringOverride(area, locale, write.key, write.value, token);
      }
      // The public map, not the admin one: this is what every `t()` reads.
      await loadUiStringOverrides();
      setSaved(true);
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main {...stylex.props(styles.screen)}>
      <h1>{t(uiLocale, "uiStrings.title")}</h1>

      {error && <ErrorBanner error={error} locale={uiLocale} onRetry={refresh} retryDisabled={loading} />}

      <div {...stylex.props(styles.controls)}>
        <label {...stylex.props(styles.field)}>
          {t(uiLocale, "uiStrings.area")}
          {/* The area name and the locale code below are stored keys, so both lists print them as stored. */}
          <select {...stylex.props(styles.controlsField)} value={area} onChange={(e) => pickArea(e.target.value)}>
            {OVERRIDABLE_AREAS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label {...stylex.props(styles.field)}>
          {t(uiLocale, "uiStrings.locale")}
          <select
            {...stylex.props(styles.controlsField)}
            value={locale}
            onChange={(e) => {
              setLocale(e.target.value);
              setDrafts({});
              setSaved(false);
            }}
          >
            {locales.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p {...stylex.props(styles.empty)}>{t(uiLocale, "uiStrings.emptyCatalog")}</p>
      ) : (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.th)}>{t(uiLocale, "uiStrings.colKey")}</th>
              <th {...stylex.props(styles.th)}>{t(uiLocale, "uiStrings.colShipped")}</th>
              <th {...stylex.props(styles.th)}>{t(uiLocale, "uiStrings.colDeployment")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td {...stylex.props(styles.td)}>{row.key}</td>
                <td {...stylex.props(styles.td)}>{row.builtin}</td>
                <td {...stylex.props(styles.td)}>
                  <input
                    value={drafts[row.key] ?? row.stored}
                    onChange={(e) => {
                      setSaved(false);
                      setDrafts((prev) => ({ ...prev, [row.key]: e.target.value }));
                    }}
                    aria-label={tFill(uiLocale, "uiStrings.overrideAria", { key: row.key })}
                    placeholder={row.builtin}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div {...stylex.props(styles.controls)}>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving || writes.length === 0}>
          {saving ? t(uiLocale, "common.saving") : t(uiLocale, "common.saveChanges")}
        </button>
        <span {...stylex.props(styles.note)} aria-live="polite">
          {saved ? t(uiLocale, "common.saved") : writes.length > 0 ? tFill(uiLocale, "uiStrings.unsaved", { n: writes.length }) : ""}
        </span>
      </div>

      <p {...stylex.props(styles.note)}>{t(uiLocale, "uiStrings.note")}</p>
    </main>
  );
}
