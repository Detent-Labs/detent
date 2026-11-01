import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import { resolveBaseLocaleChange } from "../screens/processHeaderLogic.js";
import { AddLocaleControl, ContentLocaleSelect } from "./shared/ContentLocaleSwitcher.js";

const styles = stylex.create({
  // One column of labelled controls, capped at a reading width.
  column: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: space.s4,
    maxWidth: "40rem",
  },
  // The design language's field: label above control, 4px apart.
  fieldLabel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.9rem",
  },
  fieldLabelText: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  // A checkbox and its sentence on one line.
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: space.s2,
    fontSize: "0.9rem",
  },
  // DESIGN.md: "A checkbox or radio drops the border and takes `accent-color`."
  checkbox: {
    accentColor: colors.accent,
  },
  // A bare fieldset draws UA chrome: a groove border, its own margin and
  // padding. The longhand resets clear it, so the group reads as one more
  // field of this column.
  fieldset: {
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    borderStyle: "none",
    margin: 0,
    padding: 0,
    minWidth: 0,
  },
  legend: {
    padding: 0,
    marginBlockEnd: space.s1,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  // The step page's Developer view: a divider above, a muted summary.
  developer: {
    paddingBlockStart: space.s3,
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
  },
  developerSummary: {
    cursor: "pointer",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  developerKey: {
    marginBlockStart: space.s2,
  },
  developerId: {
    fontSize: "0.8rem",
    color: colors.textMuted,
    marginBlock: space.s2,
  },
  // The key and the process id are values the engine matches exactly.
  mono: {
    fontFamily: fonts.mono,
    fontSize: "0.8rem",
  },
  // A hash is long and has no break point, so it wraps anywhere.
  hash: {
    overflowWrap: "anywhere",
  },
});

/**
 * The Settings tab's Process view: the process-wide settings a draft carries
 * (`studio-process-tabs`: "The Settings tab gathers the process-wide
 * settings"). Each control writes the draft body. No control takes
 * `disabled`: the Settings tab body hides while the JSON surface is open, so
 * none is reachable then.
 *
 * The content-locale select stands between the base language and the
 * add-a-language control. The key, the process id, the draft's revision and,
 * after a publish in this session, the published version and its definition
 * hash stand in a closed Developer view, so the view prints no machine value
 * until an author opens it.
 */
export function ProcessSettingsPanel({
  processId,
  revision,
  lastPublish,
}: {
  processId: string;
  /** The draft's current revision. */
  revision: number;
  /** The last publish of this session, or absent before one. */
  lastPublish?: { version: number; definitionHash: string };
}) {
  const { draft, mutate, contentLocale, setContentLocale } = useDraft();

  /** The typed value writes through unvalidated, and a well-formed one also
   * becomes the content locale (see `resolveBaseLocaleChange`). */
  const changeBaseLocale = (typed: string) => {
    const change = resolveBaseLocaleChange(typed, contentLocale);
    mutate((d) => {
      d.baseLocale = change.baseLocale;
    });
    setContentLocale(change.contentLocale);
  };

  return (
    <div {...stylex.props(styles.column)}>
      <label {...stylex.props(styles.fieldLabel)}>
        <span {...stylex.props(styles.fieldLabelText)}>{t("settings.baseLocale")}</span>
        <input type="text" value={draft.baseLocale ?? ""} onChange={(e) => changeBaseLocale(e.target.value)} />
      </label>
      <ContentLocaleSelect />
      <AddLocaleControl />
      {/* Checked when the draft carries no key: the engine reads an absent
          `cancellable` as true. */}
      <label {...stylex.props(styles.checkboxRow)}>
        <input
          type="checkbox"
          {...stylex.props(styles.checkbox)}
          checked={draft.cancellable ?? true}
          onChange={(e) =>
            mutate((d) => {
              d.cancellable = e.target.checked;
            })
          }
        />
        {t("settings.cancellable")}
      </label>
      <fieldset {...stylex.props(styles.fieldset)}>
        <legend {...stylex.props(styles.legend)}>{t("settings.collaborationLegend")}</legend>
        <label {...stylex.props(styles.checkboxRow)}>
          <input
            type="checkbox"
            {...stylex.props(styles.checkbox)}
            checked={draft.collaboration?.comments ?? true}
            onChange={(e) =>
              mutate((d) => {
                d.collaboration ??= {};
                d.collaboration.comments = e.target.checked;
              })
            }
          />
          {t("settings.comments")}
        </label>
        <label {...stylex.props(styles.checkboxRow)}>
          <input
            type="checkbox"
            {...stylex.props(styles.checkbox)}
            checked={draft.collaboration?.attachments ?? true}
            onChange={(e) =>
              mutate((d) => {
                d.collaboration ??= {};
                d.collaboration.attachments = e.target.checked;
              })
            }
          />
          {t("settings.attachments")}
        </label>
      </fieldset>
      <details {...stylex.props(styles.developer)}>
        <summary {...stylex.props(styles.developerSummary)}>{t("settings.developerView")}</summary>
        <label {...stylex.props(styles.fieldLabel, styles.developerKey)}>
          <span {...stylex.props(styles.fieldLabelText)}>{t("settings.key")}</span>
          <input
            type="text"
            {...stylex.props(styles.mono)}
            value={draft.key ?? ""}
            onChange={(e) =>
              mutate((d) => {
                d.key = e.target.value;
              })
            }
          />
        </label>
        <p {...stylex.props(styles.developerId)}>
          {t("settings.processId")} <code {...stylex.props(styles.mono)}>{processId}</code>
        </p>
        <p {...stylex.props(styles.developerId)}>
          {t("settings.revision")} <code {...stylex.props(styles.mono)}>{revision}</code>
        </p>
        {lastPublish && (
          <>
            <p {...stylex.props(styles.developerId)}>
              {t("settings.publishedVersion")} <code {...stylex.props(styles.mono)}>{`v${lastPublish.version}`}</code>
            </p>
            <p {...stylex.props(styles.developerId)}>
              {t("settings.definitionHash")} <code {...stylex.props(styles.mono, styles.hash)}>{lastPublish.definitionHash}</code>
            </p>
          </>
        )}
      </details>
    </div>
  );
}
