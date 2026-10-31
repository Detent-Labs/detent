/**
 * The publish dialog's Changes row (`studio-publish`: "The publish dialog
 * states the changes since the base version"; `studio-app`: "The change list
 * states what a publish would change").
 *
 * One `<dt>` with its `<dd>` entries, so the row sits inside the dialog's own
 * facts grid. It reads the draft as the editor holds it, unsaved edits
 * included: an author publishing mid-edit publishes those edits too.
 *
 * The dialog mounts only while pending, so the base body's read runs once per
 * opening. A failed read never blocks the publish: the sentence states it and
 * the dialog's two controls work as before.
 */
import { useEffect, useId, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { ProcessBody } from "workflow-engine/schema";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { getVersionBody } from "../api/client.js";
import { describeCaughtError } from "../errors.js";
import { describeChanges, type ChangeRow } from "../draft/changeSet.js";
import type { Draft } from "../draft/types.js";
import { ChangeList } from "./ChangeList.js";
import { changesSentence, type ChangesState } from "./publishChangesLogic.js";

/** The `<dt>` and `<dd>` looks repeat `ProcessHeaderBar.tsx`'s
 * `dialogFactsDt` and `dialogFactsDd`: a component style compiles per file. */
const styles = stylex.create({
  dt: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textMuted,
  },
  dd: {
    margin: 0,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  // The reading line and a failed read take the dialog's note tone, never the
  // refusal tone: neither one stops the publish.
  quiet: {
    color: colors.textMuted,
  },
  // The disclosure spans both columns of the facts grid, so the change list
  // takes the dialog's full width.
  listEntry: {
    gridColumn: "1 / -1",
    margin: 0,
    minWidth: 0,
  },
  summary: {
    width: "fit-content",
    paddingBlock: space.s1,
    cursor: "pointer",
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
  /** The published version the draft sits on, or null before a first publish. */
  baseVersion: number | null;
  /** The draft as the editor holds it. */
  draft: Draft;
  /** The editor's content locale, the locale a localized text reads in. */
  contentLocale: string;
}

export function PublishChanges({ processId, token, baseVersion, draft, contentLocale }: Props) {
  const [base, setBase] = useState<BaseState>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  // The summary reads "Show" or "Hide" alone; the sentence's id names what it
  // shows, so a screen reader hears the count with it.
  const sentenceId = useId();

  useEffect(() => {
    if (baseVersion === null) {
      setBase({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setBase({ kind: "loading" });
    getVersionBody(processId, baseVersion, token)
      .then((body) => {
        if (!cancelled) setBase({ kind: "loaded", body });
      })
      .catch((e: unknown) => {
        if (!cancelled) setBase({ kind: "error", message: describeCaughtError(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [processId, token, baseVersion]);

  // Base first: `describeChanges` reads its first argument as before and its
  // second as after, the direction a publish moves. It JSON-copies both
  // arguments, so the rows recompute only when one of the inputs moves.
  const body = base.kind === "loaded" ? base.body : undefined;
  const rows = useMemo<ChangeRow[]>(
    () => (body === undefined ? [] : describeChanges(stripCompiledContent(body as ProcessBody), draft, contentLocale)),
    [body, draft, contentLocale],
  );

  const state: ChangesState =
    baseVersion === null
      ? { kind: "first" }
      : base.kind === "error"
        ? { kind: "failed", message: base.message }
        : base.kind === "loaded"
          ? { kind: "loaded", count: rows.length }
          : { kind: "reading" };
  const quiet = state.kind === "reading" || state.kind === "failed";

  return (
    <>
      <dt {...stylex.props(styles.dt)}>{t("draftToolbar.publishDialogChanges")}</dt>
      <dd id={sentenceId} {...stylex.props(styles.dd, quiet && styles.quiet)}>{changesSentence(state, baseVersion)}</dd>
      {state.kind === "loaded" && rows.length > 0 && (
        <dd {...stylex.props(styles.listEntry)}>
          <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary aria-describedby={sentenceId} {...stylex.props(styles.summary)}>
              {t(open ? "draftToolbar.publishDialogChangesHide" : "draftToolbar.publishDialogChangesShow")}
            </summary>
            <ChangeList rows={rows} heading={t("changeList.heading.base").replace("{version}", () => String(baseVersion))} />
          </details>
        </dd>
      )}
    </>
  );
}
