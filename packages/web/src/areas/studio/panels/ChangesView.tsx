/**
 * The panels screen's Changes view: what a publish would change
 * (`studio-app`'s Changes-view requirements).
 *
 * It reads the draft as the editor holds it — unsaved edits included.
 * `VersionsScreen.diffAgainstBase()` reads the SAVED draft from the server
 * instead; a developer reading this view is mid-edit, so the live one is the
 * useful left side.
 *
 * The dock hosted this until the bench replaced it. Only the host moved: the
 * fetch still re-runs when `baseVersion` moves, and every rule about the
 * difference's direction holds.
 */
import { useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { ProcessBody } from "workflow-engine/schema";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { getVersionBody } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { describeChanges, type ChangeRow } from "../draft/changeSet.js";
import { ChangeList } from "./ChangeList.js";
import type { Draft } from "../draft/types.js";

/**
 * The `.studio-empty` and `.studio-error-banner*` shapes, both from
 * `app.css`. Duplicated on purpose (D9) rather than shared: they each appear
 * near-identically in ten other studio files.
 */
const styles = stylex.create({
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: 0,
  },
  errorBanner: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s3,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.refusal,
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
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
    transform: "rotate(-2deg)",
  },
  errorBannerMessage: {
    flex: 1,
    color: colors.text,
  },
});

type BaseState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; body: unknown }
  | { kind: "error"; message: string };

interface Props {
  processId: string;
  token: string;
  draft: Draft;
  /** The published version this draft sits on, already folded over
   * `publishResult.version` by `EditorArea`, so a publish moves it and this
   * view refetches with no reload. */
  baseVersion: number | null;
  /** The editor's content locale: the locale a `LocalizedText` reads in
   * (D5), the same one `PathsView` takes. */
  contentLocale: string;
  /** Reports the difference's entry count to the index rail, which has no
   * other way to reach it: the count is a fetch away and `panelEntityCounts`
   * derives from the draft alone. `undefined` while nothing has been
   * compared. */
  onCount: (count: number | undefined) => void;
  /** What a row's open command does. Without it no row offers one. */
  onOpenRow?: (row: ChangeRow) => void;
}

export function ChangesView({ processId, token, draft, baseVersion, contentLocale, onCount, onOpenRow }: Props) {
  const [state, setState] = useState<BaseState>({ kind: "idle" });

  useEffect(() => {
    if (baseVersion === null) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    getVersionBody(processId, baseVersion, token)
      .then((body) => {
        if (!cancelled) setState({ kind: "loaded", body });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ kind: "error", message: describeCaughtError(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [processId, token, baseVersion]);

  // Base FIRST. `describeChanges` reads its `before` argument as the
  // published value and its `after` argument as the draft, so base-first runs
  // every row from the published value toward the draft — the direction a
  // publish moves. `VersionsScreen` also passes its base or its side A first
  // (D7), so both screens agree on which side reads as before.
  // `describeChanges` JSON-copies both arguments, so memoizing on `state` and
  // `draft` (rather than recomputing on every render) matters.
  const rows = useMemo<ChangeRow[] | null>(() => {
    if (state.kind !== "loaded") return null;
    return describeChanges(stripCompiledContent(state.body as ProcessBody), draft, contentLocale);
  }, [state, draft, contentLocale]);

  useEffect(() => {
    onCount(rows?.length);
  }, [rows, onCount]);

  if (baseVersion === null) return <p {...stylex.props(styles.empty)}>{t("changesView.firstPublish")}</p>;
  if (state.kind === "loading") return <p {...stylex.props(styles.empty)}>{t("changesView.loading")}</p>;
  if (state.kind === "error")
    return (
      <div {...stylex.props(styles.errorBanner)} role="alert">
        <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
        <span {...stylex.props(styles.errorBannerMessage)}>{state.message}</span>
      </div>
    );
  if (!rows) return null;
  if (rows.length === 0) return <p {...stylex.props(styles.empty)}>{t("changesView.none")}</p>;

  const heading = t("changeList.heading.base").replace("{version}", () => String(baseVersion));
  return <ChangeList rows={rows} heading={heading} onOpenRow={onOpenRow} />;
}
