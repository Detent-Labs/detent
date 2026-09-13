import { useId } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import { FORMS_LEGEND, formCardRows, type FormCardRow, type MiniatureEntry } from "./formCardRows.js";

/** Forced-colors mode maps an ordinary `background-color` to `Canvas`, so the
 * required mark's fill and the group break's line both need a system-color
 * declaration under this query to stay visible. The dashed mark declares the
 * same system color on its border, so all three read one color there. */
const FORCED_COLORS = "@media (forced-colors: active)";

const styles = stylex.create({
  // The legend above the grid (`studio-forms-overview`: "The Forms tab
  // explains the miniature's marks"). It is the grid's sibling in the tab
  // body, so it keeps its place while the grid scrolls under it. Where one
  // line cannot hold it, it wraps onto a further line and clips nothing. Its
  // inline padding puts its left edge on the cards' 12px inset. The words
  // take the empty form sentence's type: 11px, slate, the body face.
  legend: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    columnGap: space.s4,
    rowGap: space.s1,
    listStyle: "none",
    margin: 0,
    paddingBlock: 0,
    paddingInline: space.s3,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textMuted,
  },
  // One legend item: its sample group, then its words 4px later on the
  // group's bottom edge. The item stands at the group's own 24px, where a
  // default list item would set the group on a text baseline.
  legendItem: {
    display: "flex",
    alignItems: "flex-end",
    columnGap: space.s1,
  },
  // One sample group: the miniature's own marks, 4px apart on the bottom
  // edge of a 24px box. A mark is an empty span, and an inline span ignores a
  // width and a height, so the group lays its marks out as flex items.
  legendSample: {
    display: "flex",
    alignItems: "flex-end",
    columnGap: space.s1,
    height: 24,
  },
  // The grid reflows on a 280px minimum track (design.md: "The form card is a
  // bordered plate"). No fixed column count: the tab holds ten plates in a
  // wide window and one in a narrow one, from the same declaration.
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: space.s3,
    listStyle: "none",
    margin: 0,
    paddingBlock: space.s3,
    paddingInline: space.s3,
    // Stretch, not start: a row of plates that ends at different heights puts
    // its open controls on different lines, and alignment is what organizes
    // this page (`design-language.md`). The foot row takes the slack.
    alignItems: "stretch",
    // The grid scrolls, not the tab body, so the legend above it stays in
    // view. A scroll container's automatic minimum height is zero, so the
    // grid shrinks to the height the legend leaves.
    overflowY: "auto",
    overscrollBehavior: "contain",
  },
  // A bordered ledger plate, not a floating card: a 1px hairline, zero radius,
  // no shadow at rest and none on hover. Nothing on this surface floats
  // (`design-language.md`), so the Forms tab must not be the one screen that
  // leaves the page.
  card: {
    display: "flex",
    flexDirection: "column",
    // 4px, not 8: the height budget in design.md ("The height budget") needs
    // it to fit four rows of IT Offboarding's cards in the tab body.
    gap: space.s1,
    minWidth: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    paddingBlock: space.s3,
    paddingInline: space.s3,
    backgroundColor: colors.surface,
  },
  // An empty form marks itself with the border weight alone — a 2px box in
  // the advisory color the checks rail's own dot already uses. No fill and no
  // tint: the weight carries the whole difference.
  cardEmpty: {
    borderWidth: 2,
    borderColor: colors.accent400,
  },
  head: {
    display: "flex",
    alignItems: "baseline",
    gap: space.s2,
    minWidth: 0,
  },
  identity: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    flex: "1 1 auto",
    minWidth: 0,
  },
  // The kicker: the step's role, in the tracked mono face every machine-named
  // value on this surface takes.
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: colors.textMuted,
  },
  // The step label, a level-2 heading that prints as body text at weight 800.
  // `shell/global.css` gives every `h2` the heading face, a size, uppercase,
  // tracking, a muted color and margins; each declaration below but the
  // weight and the wrap resets one of them. The compiled class outranks that
  // element selector.
  name: {
    margin: 0,
    fontFamily: fonts.body,
    fontSize: "inherit",
    fontWeight: 800,
    textTransform: "none",
    letterSpacing: "normal",
    color: colors.text,
    overflowWrap: "anywhere",
  },
  count: {
    fontSize: "0.85rem",
    color: colors.textMuted,
  },
  badge: {
    flex: "none",
    alignSelf: "center",
    backgroundColor: "transparent",
    fontFamily: fonts.mono,
    fontVariantNumeric: "tabular-nums",
    fontSize: 11,
    fontWeight: 600,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "currentcolor",
    paddingBlock: 0,
    paddingInline: space.s1,
    cursor: "pointer",
  },
  badgeBlocker: {
    color: colors.refusal,
  },
  badgeAdvisory: {
    color: colors.textMuted,
  },
  // The miniature: a row of marks standing for the form's fields, on the one
  // muted surface (`studio-forms-overview`: "A card draws a miniature of its
  // form for the eye alone"). It draws no label per mark, wraps rather than
  // overruns the card, and clips nothing that wraps. It stays out of the
  // accessibility tree — the card's foot states the counts in text.
  miniature: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: space.s1,
    minHeight: 32,
    paddingBlock: space.s1,
    paddingInline: space.s2,
    backgroundColor: colors.surfaceMuted,
    // It carries no control and answers no gesture: it stands for the form,
    // it is not the form (`studio-forms-overview`: "The miniature takes no
    // keyboard focus and no pointer interaction").
    pointerEvents: "none",
    userSelect: "none",
  },
  // One field entry's mark, 4px wide. `boxSizing: "border-box"` keeps the
  // outline inside that width and the entry's own height.
  miniatureMark: {
    boxSizing: "border-box",
    width: 4,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.textMuted,
  },
  // A required entry's mark fills solid instead of drawing an outline, so the
  // difference carries in fill as well as color (WCAG 1.4.1). Both colors
  // clear the 3:1 minimum a graphic needs against the muted ground; see the
  // `--color-accent-on-muted` comment in `tokens.css` for why accentOnMuted is
  // the role read here.
  miniatureRequired: {
    backgroundColor: { default: colors.accentOnMuted, [FORCED_COLORS]: "CanvasText" },
    borderColor: colors.accentOnMuted,
    // `none` under forced colors stops the UA from replacing this fill with
    // its own forced background.
    forcedColorAdjust: { default: "auto", [FORCED_COLORS]: "none" },
  },
  // A CEL-conditional entry's mark: a dashed outline in the required color,
  // with no fill. It stacks on `miniatureMark`, which keeps the 4px width,
  // the 1px border and the box sizing. Forced colors keep a border's style and
  // replace its color, so under `CanvasText` the outline, the fill and the
  // dash differ by shape alone.
  miniatureConditional: {
    borderStyle: "dashed",
    borderColor: { default: colors.accentOnMuted, [FORCED_COLORS]: "CanvasText" },
    forcedColorAdjust: { default: "auto", [FORCED_COLORS]: "none" },
  },
  // A group entry's group break: a 1px line marking where a section of the
  // form opens, in place of a mark. Under forced colors a background alone
  // is erased, so a 1px system-color border stands in for it there.
  miniatureGroupBreak: {
    width: 1,
    backgroundColor: colors.textMuted,
    borderWidth: { default: 0, [FORCED_COLORS]: 1 },
    borderStyle: "solid",
    borderColor: { default: "transparent", [FORCED_COLORS]: "CanvasText" },
    forcedColorAdjust: { default: "auto", [FORCED_COLORS]: "none" },
  },
  // Stands where the miniature would on an empty form, at the miniature's own
  // height so a grid row of one-line miniatures still ends level.
  miniatureEmpty: {
    display: "flex",
    alignItems: "center",
    minHeight: 32,
    paddingInline: space.s2,
    backgroundColor: colors.surfaceMuted,
    fontSize: 11,
    color: colors.textMuted,
    margin: 0,
  },
  empty: {
    color: colors.textMuted,
    paddingBlock: space.s4,
    paddingInline: space.s3,
    marginBlock: 0,
  },
  // The foot row: the count on the left, the authoring command on the right
  // (design.md: "The count moves to the foot"). `marginBlockStart: "auto"`
  // sits on the row rather than on the button alone, so every plate in a row
  // puts its foot on one line however many entries the miniature above it
  // draws.
  foot: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.s2,
    marginBlockStart: "auto",
    minWidth: 0,
  },
  // The authoring command (design.md: "The open control becomes an
  // authoring command"). The same treatment `FormTabStrip.tsx` calls
  // `control` — mono face at 11px in `textMuted`, a `surfaceMuted` hover
  // wash and an ink-14% press wash — copied here rather than exported,
  // since `design-language.md` allows a deliberate duplicate and exporting
  // it would tie a Forms tab restyle to the form editor's own file. One
  // value departs from that treatment: block padding drops from 8px
  // (`.btn`'s default, which the `button-authoring` token's `8px 4px` in
  // `DESIGN.md` records) to 4px. `minHeight: 24` keeps the control at WCAG
  // 2.5.8's minimum target size; `shell/global.css` sets `box-sizing:
  // border-box` on every element, so 24px bounds the border box.
  openControl: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    paddingBlock: space.s1,
    minHeight: 24,
    // A lone control on an empty card's foot keeps the row's trailing edge
    // this way; beside a count the row's own `space-between` already puts it
    // there (design.md: "The empty card's foot holds the control alone").
    marginInlineStart: "auto",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceMuted,
      ":active": `color-mix(in srgb, ${colors.text} 14%, transparent)`,
    },
  },
});

interface Props {
  /** Opens the form editor for one step, at `edit/form/:stepId`. */
  onOpenForm: (stepId: string) => void;
  /** Opens the Checks tab on one step's own issues. */
  onOpenChecks: (stepId: string) => void;
}

/**
 * The Forms tab (`studio-forms-overview`): every form the process asks a
 * participant to fill in, one plate each, in the draft's own order, the same
 * order the steps rail lists.
 *
 * Reads the draft off `useDraft()`, the way every other tab body does, so
 * a form edit anywhere reaches these plates with no reload.
 */
export function FormsTab({ onOpenForm, onOpenChecks }: Props) {
  const { draft, validation, contentLocale } = useDraft();
  const rows = formCardRows(draft, validation.issues, contentLocale);

  if (rows.length === 0) return <p {...stylex.props(styles.empty)}>{t("formsTab.empty")}</p>;

  return (
    <>
      <Legend />
      <ul {...stylex.props(styles.grid)} aria-label={t("formsTab.gridLabel")}>
        {rows.map((row) => (
          <FormCard key={row.stepId} row={row} onOpenForm={onOpenForm} onOpenChecks={onOpenChecks} />
        ))}
      </ul>
    </>
  );
}

/**
 * The legend line above the grid, one item per entry of `FORMS_LEGEND`
 * (`studio-forms-overview`: "The Forms tab explains the miniature's marks").
 * Each sample group draws through `MiniatureMark` and carries
 * `aria-hidden="true"`, so a screen reader reads a named list of the words
 * alone. WebKit drops a list's role under `listStyle: "none"`; the explicit
 * `role="list"` keeps it. The legend holds no control and takes no focus.
 */
function Legend() {
  return (
    <ul {...stylex.props(styles.legend)} role="list" aria-label={t("formsTab.legendLabel")}>
      {FORMS_LEGEND.map((item) => (
        <li key={item.key} {...stylex.props(styles.legendItem)}>
          <span {...stylex.props(styles.legendSample)} aria-hidden="true">
            {item.samples.map((sample) => (
              <MiniatureMark key={sample.index} entry={sample} />
            ))}
          </span>
          {t(item.key)}
        </li>
      ))}
    </ul>
  );
}

/**
 * The foot's count text (`studio-forms-overview`: "A card names its step and
 * counts the fields it draws"). Undefined where the view draws no mark, and
 * `FormCard` then renders no count span, so the foot holds the open control
 * alone.
 */
function footCountText(row: FormCardRow): string | undefined {
  if (row.fieldCount === 0) return undefined;
  if (row.requiredCount > 0) {
    return (row.fieldCount === 1 ? t("formsTab.miniatureLabelOne") : t("formsTab.miniatureLabel"))
      .replace("{count}", String(row.fieldCount))
      .replace("{required}", String(row.requiredCount));
  }
  return row.fieldCount === 1
    ? t("formsTab.fieldCountOne")
    : t("formsTab.fieldCount").replace("{count}", String(row.fieldCount));
}

function FormCard({ row, onOpenForm, onOpenChecks }: { row: FormCardRow } & Props) {
  const empty = row.fieldCount === 0;
  const countText = footCountText(row);
  // The check badge's accessible name (`studio-forms-overview`: "A card
  // reports its step's form issues"): one whole sentence that leads with the
  // visible count and names the step as the heading prints it. `{step}` fills
  // through a function, so a label holding `$&` prints as the author typed it.
  const badgeName = t(row.issues.count === 1 ? "formsTab.issueMarkOne" : "formsTab.issueMark")
    .replace("{count}", String(row.issues.count))
    .replace("{step}", () => row.label);
  const nameId = useId();
  const controlId = useId();
  return (
    <li {...stylex.props(styles.card, empty && styles.cardEmpty)}>
      <div {...stylex.props(styles.head)}>
        <div {...stylex.props(styles.identity)}>
          <span {...stylex.props(styles.kicker)}>{t(`stepRole.${row.role}`)}</span>
          <h2 id={nameId} {...stylex.props(styles.name)}>
            {row.label}
          </h2>
        </div>
        {row.issues.count > 0 && (
          <button
            type="button"
            {...stylex.props(styles.badge, row.issues.blocker ? styles.badgeBlocker : styles.badgeAdvisory)}
            aria-label={badgeName}
            onClick={() => onOpenChecks(row.stepId)}
          >
            {row.issues.count}
          </button>
        )}
      </div>
      <Miniature row={row} />
      <div {...stylex.props(styles.foot)}>
        {countText !== undefined && <span {...stylex.props(styles.count)}>{countText}</span>}
        <button
          type="button"
          id={controlId}
          aria-labelledby={`${controlId} ${nameId}`}
          className={`btn btn-ghost ${stylex.props(styles.openControl).className ?? ""}`}
          onClick={() => onOpenForm(row.stepId)}
        >
          {t(empty ? "formsTab.startForm" : "formsTab.openForm")}
        </button>
      </div>
    </li>
  );
}

/**
 * A card's miniature: one mark per field entry, a group break per group
 * entry, drawn without a label (`studio-forms-overview`: "A card draws a
 * miniature of its form for the eye alone"). It carries `aria-hidden="true"`
 * and no role: the card's foot states the field count and the required
 * count in text, so the miniature adds nothing a screen reader needs. On an
 * empty form the sentence standing in its place stays in the accessibility
 * tree instead.
 */
function Miniature({ row }: { row: FormCardRow }) {
  if (row.fieldCount === 0) return <p {...stylex.props(styles.miniatureEmpty)}>{t("formsTab.miniatureEmpty")}</p>;
  return (
    <div {...stylex.props(styles.miniature)} aria-hidden="true">
      {row.entries.map((entry: MiniatureEntry) => (
        <MiniatureMark key={entry.index} entry={entry} />
      ))}
    </div>
  );
}

/**
 * One mark or one group break, drawn from a `MiniatureEntry`: an outline, a
 * solid fill for a `"required"` entry, a dashed outline for a
 * `"conditional"` one, or a group break. The miniature and the legend's
 * samples both draw through it, so a sample cannot drift from the mark it
 * names. The span is empty; its flex parent gives it the width and the
 * height an inline span would ignore.
 */
function MiniatureMark({ entry }: { entry: MiniatureEntry }) {
  if (entry.groupBreak) {
    return <span {...stylex.props(styles.miniatureGroupBreak)} style={{ height: entry.height }} />;
  }
  return (
    <span
      {...stylex.props(
        styles.miniatureMark,
        entry.requirement === "required" && styles.miniatureRequired,
        entry.requirement === "conditional" && styles.miniatureConditional,
      )}
      style={{ height: entry.height }}
    />
  );
}
