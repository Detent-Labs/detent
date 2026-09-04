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
import { diffJson, type DiffEntry, type DiffKind } from "../screens/versionDiffLogic.js";
import type { Draft } from "../draft/types.js";

/**
 * The `.studio-empty` and `.studio-error-banner*` shapes, plus the three
 * `.studio-diff*` ones, all from `app.css`. Duplicated on purpose (D9) rather
 * than shared: `.studio-empty` and the error-banner shape each appear
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
  diff: {
    listStyle: "none",
    marginBlockStart: space.s3,
    marginBlockEnd: 0,
    marginInline: 0,
    padding: 0,
    fontSize: "0.85rem",
  },
  diffItem: {
    paddingBlock: space.s1,
    paddingInline: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  diffCode: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
  },
  diffAdded: {
    color: colors.neutral900,
  },
  diffRemoved: {
    color: colors.refusal,
  },
});

// `DiffKind` is a closed three-value union (D3): `changed` gets no color
// override, matching `.studio-diff-changed code:first-child`'s absence from
// `app.css` today.
const DIFF_KIND_STYLE: Record<DiffKind, stylex.StyleXStyles | undefined> = {
  added: styles.diffAdded,
  removed: styles.diffRemoved,
  changed: undefined,
};

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
  /** Reports the difference's entry count to the index rail, which has no
   * other way to reach it: the count is a fetch away and `panelEntityCounts`
   * derives from the draft alone. `undefined` while nothing has been
   * compared. */
  onCount: (count: number | undefined) => void;
}

export function ChangesView({ processId, token, draft, baseVersion, onCount }: Props) {
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

  // Base FIRST. `diffJson` reports a key present in its second argument alone
  // as "added" and reads `from` off the first, so base-first runs every entry
  // from the published value toward the draft — the direction a publish
  // moves. `VersionsScreen` passes the draft first, which suits its neutral
  // A-against-B framing beside `diffSelected` and would read a newly added
  // field here as removed.
  const diff = useMemo<DiffEntry[] | null>(() => {
    if (state.kind !== "loaded") return null;
    return diffJson(stripCompiledContent(state.body as ProcessBody), draft);
  }, [state, draft]);

  useEffect(() => {
    onCount(diff?.length);
  }, [diff, onCount]);

  if (baseVersion === null) return <p {...stylex.props(styles.empty)}>{t("dock.changesFirstPublish")}</p>;
  if (state.kind === "loading") return <p {...stylex.props(styles.empty)}>{t("dock.changesLoading")}</p>;
  if (state.kind === "error")
    return (
      <div {...stylex.props(styles.errorBanner)} role="alert">
        <span {...stylex.props(styles.errorBannerStamp)}>{t("error.failed")}</span>
        <span {...stylex.props(styles.errorBannerMessage)}>{state.message}</span>
      </div>
    );
  if (!diff) return null;
  if (diff.length === 0) return <p {...stylex.props(styles.empty)}>{t("dock.changesNone")}</p>;

  return (
    <ul {...stylex.props(styles.diff)}>
      {diff.map((d, i) => (
        <li key={i} {...stylex.props(styles.diffItem)}>
          <code {...stylex.props(styles.diffCode, DIFF_KIND_STYLE[d.kind])}>{d.path}</code> — {d.kind}
          {d.kind !== "added" && (
            <>
              {" "}
              from <code {...stylex.props(styles.diffCode)}>{JSON.stringify(d.from)}</code>
            </>
          )}
          {d.kind !== "removed" && (
            <>
              {" "}
              to <code {...stylex.props(styles.diffCode)}>{JSON.stringify(d.to)}</code>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
