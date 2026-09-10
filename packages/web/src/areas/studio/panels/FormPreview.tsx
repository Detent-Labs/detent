import * as stylex from "@stylexjs/stylex";
import { FieldForm, PathButtons, resolveTabsLocale } from "form-ui";
import type { AvailablePath } from "form-ui";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { Step } from "workflow-engine/schema";
import type { DraftOf } from "../draft/types.js";
import type { DraftField } from "../draft/fields.js";
import { previewViewEntries } from "../draft/field-preview.js";
import { resolveDraftLocalizedText } from "../draft/localized-text.js";
import { t } from "../catalog.js";

type DraftStep = DraftOf<Step>;

/** The width below which the preview stands under the canvas rather than
 * beside it. Its host turns at the same width, so the rule separating the two
 * turns with it: down the gutter above the breakpoint, across the top below. */
const NARROW = "@media (max-width: 64rem)";

const styles = stylex.create({
  pane: {
    display: "flex",
    flexDirection: "column",
    gap: space.s3,
    minWidth: 0,
    borderLeftWidth: { default: 2, [NARROW]: 0 },
    borderLeftStyle: "solid",
    borderLeftColor: colors.divider,
    borderTopWidth: { default: 0, [NARROW]: 2 },
    borderTopStyle: "solid",
    borderTopColor: colors.divider,
    paddingBlock: space.s3,
    paddingInline: space.s3,
  },
  heading: {
    margin: 0,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: colors.textMuted,
  },
  // The preview answers no gesture and takes no focus. `inert` carries both,
  // and takes the whole subtree out of the accessibility tree with them
  // (`studio-form-editor`: "The preview SHALL take no keyboard focus and no
  // pointer interaction").
  body: {
    display: "flex",
    flexDirection: "column",
    gap: space.s3,
    minWidth: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: space.s3,
    paddingInline: space.s3,
    backgroundColor: colors.surface,
  },
  masthead: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    minWidth: 0,
  },
  process: {
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: colors.textMuted,
  },
  step: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: 800,
  },
});

interface Props {
  step: DraftStep;
  /** The flat field catalog, the same list the form canvas draws from. */
  fields: DraftField[];
  processLabel: string;
  contentLocale: string;
  baseLocale: string;
  /** The tab the canvas is showing. One selected-tab value drives both
   * halves of the editor (`studio-form-editor`), so this pane holds none of
   * its own and the two can never disagree about which tab is open. */
  activeTab: string | undefined;
  /** `FieldForm`'s own controlled shape, wired and silent: the strip this
   * pane draws sits inside the `inert` container below, so a click there
   * reaches no tab and this never fires. The canvas carries the strip an
   * author operates (`studio-form-editor`: "The strip the preview draws
   * SHALL NOT be interactive"). */
  onTabChange: (tabKey: string) => void;
  /** Composed after the pane's own style, so the editor can place the pane in
   * its grid without this component knowing the grid. The pattern
   * `PathButtons` already sets in `form-ui`. */
  style?: stylex.StyleXStyles;
}

/**
 * The form editor's trailing pane (`studio-form-editor`: "A live participant
 * preview stands beside the form canvas").
 *
 * It mounts `packages/form-ui`'s own `FieldForm` and `PathButtons`, the two
 * the Player mounts against a real instance. No second renderer exists, so
 * what an author reads here is what a participant gets.
 *
 * It reads the step straight off the draft, so every change in the canvas
 * beside it reaches the preview on the same render, with no reload.
 */
export function FormPreview({ step, fields, processLabel, contentLocale, baseLocale, activeTab, onTabChange, style }: Props) {
  const { entries, values, tabs } = previewViewEntries(step.view, fields, contentLocale, baseLocale);
  const columns: 1 | 2 = step.view?.columns === 2 ? 2 : 1;
  const stepLabel = resolveDraftLocalizedText(step.label, contentLocale, baseLocale) || step.key || t("steps.unnamedStep");

  return (
    <aside {...stylex.props(styles.pane, style)} aria-label={t("formPreview.heading")}>
      <h3 {...stylex.props(styles.heading)}>{t("formPreview.heading")}</h3>
      <div {...stylex.props(styles.body)} inert>
        <div {...stylex.props(styles.masthead)}>
          <span {...stylex.props(styles.process)}>{processLabel}</span>
          <p {...stylex.props(styles.step)}>{stepLabel}</p>
        </div>
        {/* `resolveTabsLocale` beside the entries `previewViewEntries`
            already resolved, so this pane applies the same base-locale
            fallback the Player and the Task screen apply to a tab label. */}
        <FieldForm
          fields={entries}
          values={values}
          onChange={() => {}}
          locale={contentLocale}
          columns={columns}
          tabs={resolveTabsLocale(tabs, contentLocale, baseLocale)}
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
        <PathButtons paths={previewPaths(step)} onSubmit={() => {}} />
      </div>
    </aside>
  );
}

/**
 * The controls under the fields: one per manual path the step declares,
 * taking that path's own label (`studio-form-editor`).
 *
 * A step declaring only automatic paths carries one submit control instead —
 * a participant still submits such a step, and the engine picks the path
 * afterwards, so the preview must not draw a form with no way out. A path
 * mid-edit, carrying no id yet, draws no control: `PathButtons` keys on the
 * id.
 */
function previewPaths(step: DraftStep): AvailablePath[] {
  const manual = (step.paths ?? [])
    .filter((p) => p.trigger === "manual" && p.id !== undefined)
    .map((p) => ({ id: p.id!, key: p.key ?? "", label: p.label }));
  if (manual.length > 0) return manual;
  return [{ id: "preview-submit", key: "submit", label: t("formPreview.submit") }];
}
