import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import { t } from "../catalog.js";
import { useDraft } from "../draft/store.js";
import { formCardRows, type FormCardRow, type MiniatureEntry } from "./formCardRows.js";

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
    // this page (`design-language.md`). The control below takes the slack.
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
    gap: space.s2,
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
  // The miniature sits on the one muted surface, inset from the plate's edge.
  miniature: {
    display: "flex",
    flexDirection: "column",
    gap: space.s2,
    listStyle: "none",
    margin: 0,
    paddingBlock: space.s2,
    paddingInline: space.s2,
    backgroundColor: colors.surfaceMuted,
    // It carries no control and answers no gesture: it stands for the form,
    // it is not the form (`studio-forms-overview`: "The miniature takes no
    // keyboard focus and no pointer interaction").
    pointerEvents: "none",
    userSelect: "none",
  },
  miniatureEntry: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    minWidth: 0,
  },
  miniatureLabel: {
    fontSize: 11,
    color: colors.textMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // The asterisk sits at 11px on the miniature's muted ground, where the
  // plain accent role reads 4.17:1 light and 4.46:1 dark — both under the
  // 4.5:1 AA text minimum. `--color-accent-on-muted` is the accent step far
  // enough from that ground to clear it.
  miniatureRequired: {
    color: colors.accentOnMuted,
  },
  // The bar standing for the control. Its height is the field's kind, so the
  // miniature reads as a form's shape without drawing one input.
  miniatureBar: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  miniatureEmpty: {
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
  // The plate's own control sits on its foot, so every plate in a row puts it
  // on one line however many entries the miniature above it draws.
  openControl: {
    marginBlockStart: "auto",
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

function FormCard({ row, onOpenForm, onOpenChecks }: { row: FormCardRow } & Props) {
  const empty = row.fieldCount === 0;
  return (
    <li {...stylex.props(styles.card, empty && styles.cardEmpty)}>
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.identity)}>
          <span {...stylex.props(styles.kicker)}>{t(`stepRole.${row.role}`)}</span>
          <span {...stylex.props(styles.name)}>{row.label}</span>
          <span {...stylex.props(styles.count)}>
            {empty
              ? t("formsTab.emptyForm")
              : row.fieldCount === 1
                ? t("formsTab.fieldCountOne")
                : t("formsTab.fieldCount").replace("{count}", String(row.fieldCount))}
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
      <Miniature entries={row.entries} />
      <button
        type="button"
        className={`btn btn-secondary ${stylex.props(styles.openControl).className ?? ""}`}
        onClick={() => onOpenForm(row.stepId)}
      >
        {t(empty ? "formsTab.startForm" : "formsTab.openForm")}
      </button>
    </li>
  );
}

function Miniature({ entries }: { entries: readonly MiniatureEntry[] }) {
  if (entries.length === 0) return <p {...stylex.props(styles.miniatureEmpty)}>{t("formsTab.emptyForm")}</p>;
  return (
    <ul {...stylex.props(styles.miniature)}>
      {entries.map((entry) => (
        <li key={entry.index} {...stylex.props(styles.miniatureEntry)}>
          <span {...stylex.props(styles.miniatureLabel)}>
            {entry.label}
            {entry.required && (
              <span {...stylex.props(styles.miniatureRequired)} aria-label={t("formsTab.requiredMark")}>
                {" *"}
              </span>
            )}
          </span>
          <span {...stylex.props(styles.miniatureBar)} style={{ height: entry.height }} />
        </li>
      ))}
    </ul>
  );
}
