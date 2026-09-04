import { useCallback, useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { checkAgainstFields } from "workflow-engine/cel/check";
import { getRegistry, listProcesses, listVersions, getDraft, getVersionBody } from "../api/client.js";
import type { ProcessSummary, VersionSummary, RegistryInfo } from "../api/types.js";
import type { FieldDef } from "workflow-engine/schema";
import type { Route } from "../routing.js";
import { describeCaughtError } from "../errors.js";
import { t } from "../catalog.js";
import { useFail } from "../../../shell/useFail.js";

const styles = stylex.create({
  studioScreen: {
    maxWidth: "60rem",
    marginInline: "auto",
    marginBlock: 0,
    paddingTop: space.s4,
    paddingInline: space.s3,
    paddingBottom: space.s6,
  },
  studioBack: {
    display: "block",
    paddingLeft: 0,
    marginBottom: space.s3,
  },
  errorBanner: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    border: `2px solid ${colors.refusal}`,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    marginBlock: space.s3,
    marginInline: 0,
  },
  errorBannerStamp: {
    flex: "none",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: colors.refusal,
    border: "2px solid currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
    transform: "rotate(-2deg)",
  },
  errorBannerMessage: {
    flex: 1,
    color: colors.text,
  },
  studioEmpty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  studioError: {
    color: colors.refusal,
  },
  studioJsonEditor: {
    display: "block",
    width: "100%",
    marginTop: space.s1,
    fontFamily: fonts.mono,
    fontSize: "0.85rem",
    border: `1px solid ${colors.border}`,
    padding: space.s2,
    background: colors.surface,
    resize: "vertical",
  },
});

interface ToolsScreenProps {
  token: string;
  navigate: (route: Route) => void;
  onUnauthorized: () => void;
}

/** studio-tools spec: a read-only registry view plus a static CEL scratchpad. Neither writes anything. */
export function ToolsScreen({ token, navigate, onUnauthorized }: ToolsScreenProps) {
  const [registry, setRegistry] = useState<RegistryInfo | undefined>(undefined);
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  const [processId, setProcessId] = useState<string>("");
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [catalogSource, setCatalogSource] = useState<string>(""); // "draft" or a version number as a string
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [catalogError, setCatalogError] = useState<string | undefined>(undefined);
  const [expression, setExpression] = useState("");
  const failLoad = useFail(onUnauthorized, (e) => setLoadError(describeCaughtError(e)));
  const failCatalog = useFail(onUnauthorized, (e) => setCatalogError(describeCaughtError(e)));

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(undefined);
    Promise.all([getRegistry(token), listProcesses(token)])
      .then(([r, ps]) => {
        if (cancelled) return;
        setRegistry(r);
        setProcesses(ps);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        failLoad(e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, failLoad]);

  useEffect(() => load(), [load]);

  const selectProcess = useCallback(
    (id: string) => {
      setProcessId(id);
      setCatalogSource("");
      setFields([]);
      setCatalogError(undefined);
      if (!id) {
        setVersions([]);
        setHasDraft(false);
        return;
      }
      Promise.all([listVersions(id, token), getDraft(id, token)])
        .then(([vs, draft]) => {
          setVersions(vs);
          setHasDraft(!!draft);
        })
        .catch(failCatalog);
    },
    [token, failCatalog],
  );

  const selectCatalog = useCallback(
    (source: string) => {
      setCatalogSource(source);
      setCatalogError(undefined);
      if (!source) {
        setFields([]);
        return;
      }
      const fetchBody = source === "draft" ? getDraft(processId, token).then((d) => d?.body) : getVersionBody(processId, Number(source), token);
      fetchBody
        .then((body: unknown) => {
          // Both `DraftRecord.body` and `getVersionBody`'s result are opaque,
          // unparsed JSON client-side (same convention `JsonView`/
          // `migrationPlanLogic` already follow) — this reads out only the
          // one array `checkAgainstFields` needs, defensively, rather than
          // trusting the shape.
          const rawFields = typeof body === "object" && body !== null ? (body as { fields?: unknown }).fields : undefined;
          setFields(Array.isArray(rawFields) ? (rawFields as FieldDef[]) : []);
        })
        .catch(failCatalog);
    },
    [processId, token, failCatalog],
  );

  const checkResult = useMemo(() => {
    if (!expression.trim() || catalogSource === "") return undefined;
    return checkAgainstFields(expression, fields);
  }, [expression, fields, catalogSource]);

  return (
    <main {...stylex.props(styles.studioScreen)}>
      <button type="button" className="btn btn-ghost" {...stylex.props(styles.studioBack)} onClick={() => navigate({ name: "processes" })}>
        ← Back to processes
      </button>
      <h1>Tools</h1>
      {loadError && (
        <div {...stylex.props(styles.errorBanner)} role="alert">
          <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
          <span {...stylex.props(styles.errorBannerMessage)}>{loadError}</span>
          <button type="button" className="btn btn-secondary" onClick={() => load()} disabled={loading}>
            {t("error.retry")}
          </button>
        </div>
      )}
      {loading ? (
        <p {...stylex.props(styles.studioEmpty)}>Loading…</p>
      ) : (
        <>
          <fieldset>
            <legend>Registered plugin types</legend>
            <h2>Action handlers</h2>
            {registry && registry.actionTypes.length > 0 ? (
              <ul>
                {registry.actionTypes.map((t2) => (
                  <li key={t2}>
                    <code>{t2}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p {...stylex.props(styles.studioEmpty)}>No action-handler types registered.</p>
            )}
            <h2>Data sources</h2>
            {registry && registry.dataSourceTypes.length > 0 ? (
              <ul>
                {registry.dataSourceTypes.map((t2) => (
                  <li key={t2}>
                    <code>{t2}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p {...stylex.props(styles.studioEmpty)}>No data-source types registered.</p>
            )}
            <h2>Assignment strategies</h2>
            {registry && registry.assignmentStrategyTypes.length > 0 ? (
              <ul>
                {registry.assignmentStrategyTypes.map((t2) => (
                  <li key={t2}>
                    <code>{t2}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p {...stylex.props(styles.studioEmpty)}>No assignment-strategy types registered.</p>
            )}
          </fieldset>

          <fieldset>
            <legend>CEL scratchpad</legend>
            <label>
              Process
              <select value={processId} onChange={(e) => selectProcess(e.target.value)}>
                <option value="">Choose a process…</option>
                {processes.map((p) => (
                  <option key={p.processId} value={p.processId}>
                    {p.key}
                  </option>
                ))}
              </select>
            </label>
            {processId && (
              <label>
                Field catalog
                <select value={catalogSource} onChange={(e) => selectCatalog(e.target.value)}>
                  <option value="">Choose a catalog…</option>
                  {hasDraft && <option value="draft">Current draft</option>}
                  {versions.map((v) => (
                    <option key={v.version} value={String(v.version)}>
                      Published v{v.version}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {catalogError && <p {...stylex.props(styles.studioError)}>{catalogError}</p>}
            <label>
              Expression
              <textarea
                {...stylex.props(styles.studioJsonEditor)}
                rows={4}
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                spellCheck={false}
                disabled={catalogSource === ""}
                placeholder="data.field_key == 'value'"
              />
            </label>
            {checkResult &&
              (checkResult.ok ? (
                <p {...stylex.props(styles.studioEmpty)}>Parses and type-checks against this catalog.</p>
              ) : (
                <p {...stylex.props(styles.studioError)}>{checkResult.message}</p>
              ))}
          </fieldset>
        </>
      )}
    </main>
  );
}
