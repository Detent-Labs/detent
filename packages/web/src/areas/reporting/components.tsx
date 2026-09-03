import type { ClientError } from "./api/types.js";
import type { UiLocale } from "../../i18n/locale.js";
import { t, tCount } from "./catalog.js";
import { describeError, toDateInput, fromDateInput, type DateRange } from "./screens/reportingLogic.js";
import * as stylex from "@stylexjs/stylex";
import { colors } from "../../shell/tokens.stylex";

/** `.rep-rule` and its fill from `app.css`, as StyleX. The fill length is the
 * one dynamic value: StyleX compiles the arrow function to a rule reading a
 * CSS variable and sets that variable through the inline `style` attribute. */
const rule = stylex.create({
  track: {
    flex: 1,
    minWidth: "3rem",
    height: "0.5rem",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    display: "flex",
    alignItems: "flex-end",
  },
  fill: (percent: number) => ({
    display: "block",
    height: "0.5rem",
    backgroundColor: colors.accent,
    opacity: 0.65,
    width: `${percent}%`,
  }),
  fillDanger: {
    backgroundColor: colors.refusal,
    opacity: 0.8,
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
    <span {...stylex.props(rule.track)} aria-hidden="true">
      <span {...stylex.props(rule.fill(Math.round(fraction * 100)), tone === "danger" && rule.fillDanger)} />
    </span>
  );
}

/** Shared by all three views: changing it reloads the current view, and it survives a view switch because App owns it. */
export function DateRangeControl({ range, onChange, locale }: { range: DateRange; onChange: (next: DateRange) => void; locale: UiLocale }) {
  return (
    <div className="rep-controls">
      <label>
        <span>{t(locale, "range.from")}</span>
        <input
          type="date"
          name="from"
          value={toDateInput(range.from)}
          max={toDateInput(range.to)}
          onChange={(e) => onChange({ ...range, from: fromDateInput(e.target.value, "start") })}
        />
      </label>
      <label>
        <span>{t(locale, "range.to")}</span>
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
  return <p className="rep-scope">{children}</p>;
}

/** An empty result is stated in words, never an empty table (reporting-app spec). */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rep-empty">{children}</p>;
}

/** One line where the content will appear: no skeleton, no spinner (design-language.md). */
export function WaitingNote({ locale }: { locale: UiLocale }) {
  return <p className="rep-scope">{t(locale, "common.loading")}</p>;
}

/** A failed load renders as a failure, never as an empty result (spa-error-reporting). */
export function ErrorNote({ error, locale }: { error: ClientError; locale: UiLocale }) {
  return (
    <p className="rep-error" role="alert">
      <span className="rep-stamp rep-stamp-danger">{t(locale, "error.failed")}</span> {describeError(error, locale)}
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
  return <p className="rep-scope">{tCount(locale, count === 1 ? "skipped.one" : "skipped.many", count)}</p>;
}
