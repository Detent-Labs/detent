import * as stylex from "@stylexjs/stylex";
import { colors, fonts, space } from "form-ui/tokens.stylex";
import type { ClientError } from "./api/types.js";
import type { UiLocale } from "../../i18n/locale.js";
import { t, tCount } from "./catalog.js";
import { describeError, toDateInput, fromDateInput, type DateRange } from "./screens/reportingLogic.js";

/** `app.css`'s duration-rule, controls, scope-note and error/stamp rules,
 * as StyleX. `.rep-empty` merges its two source declarations (design.md
 * D12); `.rep-error`'s two call sites choose between `error` (this
 * file's, always paired with a stamp) and `root.tsx`'s own unpaired
 * `errorRefusal` style, the same two-way choice phase 1's D2 established
 * (design.md's per-call-site bucket-2 rule). The bar's numeric width
 * stays a literal inline style (design.md D5). */
const styles = stylex.create({
  rule: {
    flex: 1,
    minWidth: "3rem",
    height: "0.5rem",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    display: "flex",
    alignItems: "flex-end",
  },
  ruleFill: {
    display: "block",
    height: "0.5rem",
    backgroundColor: colors.accent,
    opacity: 0.65,
  },
  ruleFillDanger: {
    backgroundColor: colors.refusal,
    opacity: 0.8,
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    gap: space.s3,
    alignItems: "flex-end",
    paddingBottom: space.s3,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  controlsLabel: {
    display: "flex",
    flexDirection: "column",
    gap: space.s1,
    fontSize: "0.9rem",
  },
  controlsLabelSpan: {
    fontFamily: fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: colors.textMuted,
  },
  scope: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s3,
    maxWidth: "46rem",
  },
  empty: {
    fontSize: "0.85rem",
    color: colors.textMuted,
    marginTop: 0,
    marginInline: 0,
    marginBottom: space.s3,
    maxWidth: "46rem",
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    paddingLeft: space.s3,
  },
  error: {
    fontSize: "0.9rem",
    color: colors.text,
    marginBlock: space.s3,
    marginInline: 0,
  },
  stamp: {
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
  stampDanger: {
    color: colors.refusal,
  },
});

/**
 * The duration rule — this package's one visual device, reused by all three
 * views with a different quantity bound to it. It reads as the ruled line of
 * ledger paper (the family the admin area established) and as a measuring
 * scale (this package's subject, which is time rather than state).
 *
 * `aria-hidden`: the value it depicts is always printed as text beside it, so
 * announcing the bar too would just repeat the figure.
 */
export function DurationRule({ fraction, tone = "neutral" }: { fraction: number; tone?: "neutral" | "danger" }) {
  return (
    <span {...stylex.props(styles.rule)} aria-hidden="true">
      <span {...stylex.props(styles.ruleFill, tone === "danger" && styles.ruleFillDanger)} style={{ width: `${Math.round(fraction * 100)}%` }} />
    </span>
  );
}

/** Shared by all three views: changing it reloads the current view, and it survives a view switch because App owns it. */
export function DateRangeControl({ range, onChange, locale }: { range: DateRange; onChange: (next: DateRange) => void; locale: UiLocale }) {
  return (
    <div {...stylex.props(styles.controls)}>
      <label {...stylex.props(styles.controlsLabel)}>
        <span {...stylex.props(styles.controlsLabelSpan)}>{t(locale, "range.from")}</span>
        <input
          type="date"
          name="from"
          value={toDateInput(range.from)}
          max={toDateInput(range.to)}
          onChange={(e) => onChange({ ...range, from: fromDateInput(e.target.value, "start") })}
        />
      </label>
      <label {...stylex.props(styles.controlsLabel)}>
        <span {...stylex.props(styles.controlsLabelSpan)}>{t(locale, "range.to")}</span>
        <input
          type="date"
          name="to"
          value={toDateInput(range.to)}
          min={toDateInput(range.from)}
          onChange={(e) => onChange({ ...range, to: fromDateInput(e.target.value, "end") })}
        />
      </label>
    </div>
  );
}

/** Each view states which instances it counts — the numbers differ between views by design, and the reader has to be able to tell why. */
export function ScopeNote({ children }: { children: React.ReactNode }) {
  return <p {...stylex.props(styles.scope)}>{children}</p>;
}

/** An empty result is stated in words, never an empty table (reporting-app spec). */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p {...stylex.props(styles.empty)}>{children}</p>;
}

/** One line where the content will appear: no skeleton, no spinner (design-language.md). */
export function WaitingNote({ locale }: { locale: UiLocale }) {
  return <p {...stylex.props(styles.scope)}>{t(locale, "common.loading")}</p>;
}

/** A failed load renders as a failure, never as an empty result (spa-error-reporting). */
export function ErrorNote({ error, locale }: { error: ClientError; locale: UiLocale }) {
  return (
    <p {...stylex.props(styles.error)} role="alert">
      <span {...stylex.props(styles.stamp, styles.stampDanger)}>{t(locale, "error.failed")}</span> {describeError(error, locale)}
    </p>
  );
}

/**
 * Instances whose pinned version no longer resolves shrink the population; a
 * partial view says so rather than quietly reporting less.
 *
 * One key per grammatical form, each holding the whole sentence. German splits
 * a count-bearing sentence differently from English, so a concatenation of
 * fragments does not survive translation.
 */
export function SkippedNote({ count, locale }: { count: number; locale: UiLocale }) {
  if (count === 0) return null;
  return <p {...stylex.props(styles.scope)}>{tCount(locale, count === 1 ? "skipped.one" : "skipped.many", count)}</p>;
}
