import { useCallback, useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { listDataLists, createDataList } from "../api/client.js";
import type { DataListSummary } from "../api/types.js";
import { useRefresh } from "../useRefresh.js";
import { describeCaughtError } from "../errors.js";
import { useFail } from "../../../shell/useFail.js";
import { ErrorBanner } from "../../../shell/ErrorBanner.js";
import type { Route } from "../routing.js";
import { t } from "../catalog.js";
import type { UiLocale } from "../../../i18n/locale.js";

/** `app.css`'s screen/note/controls/table/row-link rules, as StyleX. */
const styles = stylex.create({
  screen: {
    maxWidth: "60rem",
    marginInline: "auto",
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  note: {
    color: colors.textMuted,
    fontSize: "0.85rem",
    maxWidth: "60ch",
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
  tr: {
    background: { default: "none", ":hover": colors.surfaceMuted },
  },
  rowLink: {
    background: "none",
    borderWidth: 0,
    margin: 0,
    padding: 0,
    font: "inherit",
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    textDecoration: { default: "none", ":hover": "underline" },
  },
});

interface DataListsScreenProps {
  token: string;
  locale: UiLocale;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/**
 * The overview: every data list, with how many values it currently offers.
 * Creating one takes a key and a label; the values are the detail screen's job,
 * and a list is allowed to exist with none.
 */
export function DataListsScreen({ token, locale, navigate, onUnauthorized }: DataListsScreenProps) {
  const [items, setItems] = useState<DataListSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [listKey, setListKey] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const { reloadToken, refresh } = useRefresh();
  const fail = useFail(onUnauthorized, (err) => setError(describeCaughtError(err, locale)));

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const page = await listDataLists(token);
      setItems(page.items);
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [token, locale, fail]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const create = async () => {
    setCreating(true);
    setError(undefined);
    try {
      await createDataList(listKey.trim(), label.trim(), null, token);
      setListKey("");
      setLabel("");
      refresh();
    } catch (err) {
      fail(err);
    } finally {
      setCreating(false);
    }
  };

  const canCreate = listKey.trim() !== "" && label.trim() !== "" && !creating;

  return (
    <main {...stylex.props(styles.screen)}>
      <h1>{t(locale, "dataLists.title")}</h1>
      <p {...stylex.props(styles.note)}>{t(locale, "dataLists.note")}</p>

      <form
        {...stylex.props(styles.controls)}
        onSubmit={(e) => {
          e.preventDefault();
          if (canCreate) void create();
        }}
      >
        {/* The key placeholder shows the slug grammar a `db.list` key follows, so it stays as the engine spells it. */}
        <input
          {...stylex.props(styles.controlsField)}
          value={listKey}
          onChange={(e) => setListKey(e.target.value)}
          placeholder="cost_centres…"
          aria-label={t(locale, "dataLists.keyAria")}
          autoComplete="off"
          spellCheck={false}
        />
        <input
          {...stylex.props(styles.controlsField)}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t(locale, "dataLists.namePlaceholder")}
          aria-label={t(locale, "dataLists.nameAria")}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary" disabled={!canCreate}>
          {creating ? t(locale, "dataLists.creating") : t(locale, "dataLists.create")}
        </button>
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={loading}>
          {t(locale, "common.refresh")}
        </button>
      </form>

      {error && <ErrorBanner error={error} locale={locale} onRetry={refresh} retryDisabled={loading} />}

      {items.length === 0 && !loading && !error && <p {...stylex.props(styles.empty)}>{t(locale, "dataLists.empty")}</p>}

      {items.length > 0 && (
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.th)}>{t(locale, "dataLists.colKey")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "dataLists.colName")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "dataLists.colActiveValues")}</th>
              <th {...stylex.props(styles.th)}>{t(locale, "dataLists.colLastChange")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((list) => (
              <tr key={list.listKey} {...stylex.props(styles.tr)}>
                <td {...stylex.props(styles.td)}>
                  <button type="button" {...stylex.props(styles.rowLink)} onClick={() => navigate({ name: "dataList", listKey: list.listKey })}>
                    {list.listKey}
                  </button>
                </td>
                <td {...stylex.props(styles.td)}>{list.label}</td>
                <td {...stylex.props(styles.td)}>{list.activeValueCount}</td>
                <td {...stylex.props(styles.td)}>
                  {new Date(list.updatedAt).toLocaleString(locale)} · {list.updatedBy}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
