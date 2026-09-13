import { useId } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import { formCardRows, type FormCardRow, type MiniatureEntry } from "./formCardRows.js";

/** Forced-colors mode maps an ordinary `background-color` to `Canvas`, so the
 * required mark's fill and the group break's line both need a system-color
 * declaration under this query to stay visible. */
const FORCED_COLORS = "@media (forced-colors: active)";

const styles = stylex.create({
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
  name: {
    fontWeight: 800,
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
  // `DESIGN.md` records) to 4px.
  openControl: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
    paddingBlock: space.s1,
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
    <ul {...stylex.props(styles.grid)} aria-label={t("formsTab.gridLabel")}>
      {rows.map((row) => (
        <FormCard key={row.stepId} row={row} onOpenForm={onOpenForm} onOpenChecks={onOpenChecks} />
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
  const nameId = useId();
  const controlId = useId();
  return (
    <li {...stylex.props(styles.card, empty && styles.cardEmpty)}>
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.identity)}>
          <span {...stylex.props(styles.kicker)}>{t(`stepRole.${row.role}`)}</span>
          <span id={nameId} {...stylex.props(styles.name)}>
            {row.label}
          </span>
        </span>
        {row.issues.count > 0 && (
          <button
            type="button"
            {...stylex.props(styles.badge, row.issues.blocker ? styles.badgeBlocker : styles.badgeAdvisory)}
            aria-label={`${row.issues.count} ${t(row.issues.count === 1 ? "formsTab.issueMarkOne" : "formsTab.issueMark")}`}
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
      {row.entries.map((entry: MiniatureEntry) =>
        entry.groupBreak ? (
          <span key={entry.index} {...stylex.props(styles.miniatureGroupBreak)} style={{ height: entry.height }} />
        ) : (
          <span
            key={entry.index}
            {...stylex.props(styles.miniatureMark, entry.required && styles.miniatureRequired)}
            style={{ height: entry.height }}
          />
        ),
      )}
    </div>
  );
}
