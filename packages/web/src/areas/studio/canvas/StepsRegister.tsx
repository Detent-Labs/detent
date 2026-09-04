import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t, type CatalogKey } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import { registerOrder } from "../draft/registerOrder.js";
import { roleStampFor, type StampTone, type StepRole } from "../draft/roleStamp.js";
import { panelEntityCounts, stepIssueCount } from "../draft/panel-rail.js";
import { resolveDraftLocalizedText } from "../draft/localized-text.js";
import { PANEL_VIEWS, type PanelView } from "../routing.js";

/** The width below which the bench stands one column, so the register gives up
 * its own and becomes a disclosure. `PanelsScreen` turns its index rail at this
 * same width, for the same reason. */
const NARROW = "@media (max-width: 64rem)";

const styles = stylex.create({
  register: {
    minWidth: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    maxHeight: { default: "none", [NARROW]: "20rem" },
  },
  // Drawn only below the breakpoint, where the register loses its column and
  // would otherwise push the configuration pane a screen down. Above that
  // width `display: none` keeps it out of the tab order and out of the
  // accessibility tree, so no dead control stands over the list.
  disclosure: {
    display: { default: "none", [NARROW]: "flex" },
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: "inherit",
    borderWidth: 0,
    borderBottomWidth: 2,
    borderBottomStyle: "solid",
    borderBottomColor: colors.divider,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  // The one state the disclosure carries, read off the same `open` its
  // `aria-expanded` reports. Above the breakpoint the body always shows, so a
  // window widened while the register is closed does not lose it.
  bodyClosed: {
    display: { default: "block", [NARROW]: "none" },
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
  },
  // A register row: stamp, identity, right-aligned quantity in mono, ruled
  // with the 1px hairline between rows.
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    width: "100%",
    backgroundColor: { default: "transparent", ":hover": colors.surfaceMuted },
    color: "inherit",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    paddingBlock: space.s2,
    paddingInline: space.s3,
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  // Reads the same `aria-current` the row already carries, per
  // `design-language.md`'s rule against a hand-written state selector.
  rowCurrent: {
    backgroundColor: colors.surfaceMuted,
    fontWeight: 600,
  },
  rowName: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // The stamp, in the four tones `roleStamp.ts` picks among. Duplicated from
  // the masthead's own on purpose: no component reads another's style object.
  stamp: {
    flex: "none",
    display: "inline-block",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 2,
    paddingInline: 7,
  },
  stampOpen: {
    color: colors.accent,
  },
  stampSettled: {
    color: colors.text,
  },
  stampDormant: {
    color: { default: "#726e6e", "@media (prefers-color-scheme: dark)": colors.neutral500 },
  },
  stampRefusal: {
    color: colors.surface,
    backgroundColor: colors.refusal,
    borderColor: colors.refusal,
  },
  // The foot: the process links, and the add control on a draft holding no
  // step. The 2px divider is the structural rule between the steps above and
  // the process-wide entries below.
  foot: {
    borderTopWidth: 2,
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
    paddingBlock: space.s2,
    paddingInline: 0,
  },
  footHeading: {
    margin: 0,
    paddingTop: 0,
    paddingInline: space.s3,
    paddingBottom: space.s2,
  },
  count: {
    flex: "none",
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    color: colors.textMuted,
  },
  addStep: {
    marginTop: space.s2,
    marginInline: space.s3,
  },
});

const STAMP_TONE: Record<StampTone, typeof styles.stampOpen> = {
  open: styles.stampOpen,
  settled: styles.stampSettled,
  dormant: styles.stampDormant,
};

const ROLE_LABEL: Record<StepRole, CatalogKey> = {
  initial: "stepRole.initial",
  task: "stepRole.task",
  subprocess: "stepRole.subprocess",
  end: "stepRole.end",
};

const PROCESS_LINK_LABEL: Record<PanelView, CatalogKey> = {
  fields: "panelsScreen.linkFields",
  dataSources: "panelsScreen.linkDataSources",
  contract: "panelsScreen.linkContract",
  matrix: "panelsScreen.linkFieldMatrix",
  changes: "panelsScreen.linkChanges",
  paths: "panelsScreen.linkPaths",
};

interface Props {
  /** The step the configuration pane shows. `EditorArea` owns it, so the
   * ribbon's canvas and this register cannot disagree about which step is
   * current. */
  currentStepId: string | undefined;
  onSelectStep: (stepId: string) => void;
  /** Opens the panels screen at one view — the foot's six process links. */
  onOpenPanel: (view: PanelView) => void;
  /** Adds a step of type `task` to a draft holding none, through the same
   * draft-mutation method the palette's own drop calls. */
  onAddFirstStep: () => void;
}

/**
 * The bench's left column (`studio-canvas`'s "The steps register lists every
 * step in reachability order"). One ruled row per step, in `registerOrder`,
 * each carrying its role stamp, its label resolved for the content locale, and
 * its issue count where that count stands above zero.
 *
 * The foot carries the six process links, each with its own count, and — on a
 * draft holding no step — the add control. The collapsed ribbon shows no
 * palette, so this is the one always-reachable way to add a first step.
 */
export function StepsRegister({ currentStepId, onSelectStep, onOpenPanel, onAddFirstStep }: Props) {
  const { draft, validation, contentLocale } = useDraft();
  const baseLocale = draft.baseLocale ?? "en";
  const steps = draft.workflow?.steps ?? [];
  const ordered = registerOrder(steps, draft.workflow?.initialStep);
  const entityCount = panelEntityCounts(draft);

  // Whether the body shows below the breakpoint, where the register is a
  // disclosure rather than a column. It starts open: the register is this
  // screen's own navigation, unlike the panels screen's index rail, which
  // stands beside a view the developer came to read.
  const [open, setOpen] = useState(true);

  return (
    <nav {...stylex.props(styles.register)} aria-label={t("stepsRegister.label")}>
      <button
        type="button"
        {...stylex.props(styles.disclosure)}
        aria-expanded={open}
        aria-controls="studio-steps-register-body"
        onClick={() => setOpen((v) => !v)}
      >
        {t("stepsRegister.label")}
      </button>
      <div id="studio-steps-register-body" {...stylex.props(!open && styles.bodyClosed)}>
        <ul {...stylex.props(styles.list)}>
          {ordered.map((step, i) => {
            const { role, tone } = roleStampFor(step, draft.workflow?.initialStep);
            const issues = stepIssueCount(validation.issues, step);
            const current = step.id !== undefined && step.id === currentStepId;
            return (
              <li key={step.id ?? `unsaved-${i}`}>
                <button
                  type="button"
                  {...stylex.props(styles.row, current && styles.rowCurrent)}
                  aria-current={current ? "true" : undefined}
                  disabled={step.id === undefined}
                  onClick={() => step.id !== undefined && onSelectStep(step.id)}
                >
                  <span {...stylex.props(styles.stamp, STAMP_TONE[tone])}>{t(ROLE_LABEL[role])}</span>
                  <span {...stylex.props(styles.rowName)}>
                    {resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep")}
                  </span>
                  {issues > 0 && <span {...stylex.props(styles.stamp, styles.stampRefusal)}>{issues}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <section {...stylex.props(styles.foot)} aria-labelledby="studio-steps-register-process">
          <h2 {...stylex.props(styles.footHeading)} id="studio-steps-register-process">
            {t("app.processLegend")}
          </h2>
          <ul {...stylex.props(styles.list)}>
            {PANEL_VIEWS.map((view) => (
              <li key={view}>
                <button type="button" {...stylex.props(styles.row)} onClick={() => onOpenPanel(view)}>
                  <span {...stylex.props(styles.rowName)}>{t(PROCESS_LINK_LABEL[view])}</span>
                  <span {...stylex.props(styles.count)}>{entityCount[view]}</span>
                </button>
              </li>
            ))}
          </ul>
          {steps.length === 0 && (
            <button type="button" className="btn btn-secondary" {...stylex.props(styles.addStep)} onClick={onAddFirstStep}>
              {t("stepsRegister.addFirstStep")}
            </button>
          )}
        </section>
      </div>
    </nav>
  );
}
