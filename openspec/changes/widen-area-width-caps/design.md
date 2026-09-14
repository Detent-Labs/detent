## Context

See `proposal.md` - Why. Two DESIGN.md-documented, area-wide caps (46rem for
participant/shell screens, 60rem for operator screens: admin, reporting,
studio) are each hardcoded as a literal `maxWidth` string inside a screen's
own outer container style (named `screen`, `studioScreen`, `empty` or
`fallback` depending on the file) — 30 occurrences across 30 files, no
shared token today.

A plain `grep -rn 'maxWidth: "46rem"\|maxWidth: "60rem"' packages/web/src`
finds 37 occurrences across 33 files, not 30 across 30 — seven of those
occurrences are a different, unrelated pattern that happens to share the
46rem value: a small, left-aligned caption/note-text block (`marginTop: 0,
marginInline: 0, marginBottom: space.s3, maxWidth: "46rem"`, no centering)
capped for its own readability, not for the screen's own layout. It appears
in `components.tsx` (×2), `ColumnEditor.tsx` (×2) and `ShareEditor.tsx`
(×1) — none of which carries a genuine screen-level cap at all — and twice
more inside `ReportBuilderScreen.tsx`, alongside that file's own genuine
`screen` occurrence. The reliable signal that separates the two patterns:
every genuine screen-level occurrence pairs `maxWidth` with
`marginInline: "auto"` on the same style object (it centers itself); every
note-text occurrence pairs it with `marginInline: 0` (it does not). Verified
by reading every one of the 37 matches with its full surrounding style
object. `components.tsx`, `ColumnEditor.tsx` and `ShareEditor.tsx` are
excluded from this change entirely — they have nothing for it to touch.

`packages/web/src/shell/tokens.css` is the one authoritative source of
design tokens, as CSS custom properties. `packages/form-ui/src/tokens.stylex.ts`
mirrors it 1:1 as StyleX `defineVars` groups (`colors`, `fonts`, `space`,
`radius`, `shadow`), and every screen across all four areas already imports
from `form-ui/tokens.stylex` for its existing tokens — see, for example,
`PlayerScreen.tsx`'s own import list.

The process surface (`EditScreen.tsx`'s ten-tab body) is explicitly uncapped
per DESIGN.md and stays that way. `EditScreen.tsx`'s own `60rem` occurrence
is confirmed, by the comment beside it ("`.studio-edit-screen` widens past
`.studio-screen`'s 60rem cap"), to be the screen's ordinary bare-studio-screen
style — a fallback, not the process surface's own layout — so it takes the
shared token exactly like every other bare studio screen, with no special
case.

The Player's `@container studio-player (max-width: 64rem)` breakpoint is
architecturally distinct from the area cap: it is a container query against
the Player screen's own element. The process surface's five
`NARROW = "@media (max-width: 64rem)"` breakpoints (`EditScreen.tsx`,
`StepsRail.tsx`, `StepPage.tsx`, `FieldCatalogPanel.tsx`, `EntityTabs.tsx`)
are viewport-relative media queries instead, unaffected by any area cap
because the process surface carries none. `MigrationSpecEditor.tsx`'s own
`maxWidth: "64rem"` is an unrelated block-level cap inside that same
uncapped process surface. None of these five files change in this change.

## Goals / Non-Goals

**Goals:**
- Raise both area caps by the approved amounts (60rem→80rem, 46rem→61rem)
  everywhere they apply.
- Converge the 37 hardcoded literals onto one shared, reusable token pair.
- Leave the Player's own reflow-threshold requirement text untouched; let
  the cap increase alone make its already-specified side-by-side state
  reachable.

**Non-Goals:**
- Touching the process surface's own uncapped layout, its five `NARROW`
  viewport breakpoints, or `MigrationSpecEditor.tsx`'s block cap.
- Introducing any new intermediate breakpoint or a third cap tier.
- Any change to `packages/form-ui`'s own components — only `packages/web`
  screens carry a `maxWidth` area cap.

## Decisions

**Token placement and naming.** Add a `layout` group to both `tokens.css`
(`--layout-cap-narrow: 61rem`, `--layout-cap-wide: 80rem`) and
`form-ui/src/tokens.stylex.ts` (`layout.capNarrow`, `layout.capWide`),
aliasing the custom properties exactly the way `space`, `radius` and
`shadow` already do. Alternative considered: a bare shared TS constant with
no CSS custom property — rejected, since it would fork the pattern every
other token in this codebase follows, and DESIGN.md already documents these
two values as design tokens, not incidental numbers.

**Values.** 61rem for the narrow cap (exact 1/3 over 46rem is 61.33rem;
rounded down to a whole rem, matching every existing cap being a whole
number). 80rem for the wide cap (exact 1/3 over 60rem, already whole).

**Scope of the sweep.** All 30 files carrying a genuine screen-level
occurrence get the same mechanical edit: replace the literal string with
the matching token reference. `EditScreen.tsx` is not special-cased (see
Context above) — its one occurrence is genuine. `ReportBuilderScreen.tsx`
is partially special-cased: only its `screen` style's `60rem` changes; its
`scope` and `empty` styles' `46rem` note-text caps stay exactly as they
are. `components.tsx`, `ColumnEditor.tsx` and `ShareEditor.tsx` are not
touched at all.

**No `/impeccable shape` pass.** CLAUDE.md's convention runs `/impeccable
shape <screen>` during the proposal to decide a screen's UX and layout
before any code exists. This change makes no new layout decision — every
screen's composition, hierarchy and content are unchanged; only the
existing, already-shaped column's outer bound grows by a fixed ratio.
`shape`'s purpose (deciding what goes where) does not apply to a change
that moves nothing. `/impeccable critique` and `/impeccable audit` at the
verification stage (`tasks.md`) are the applicable checks here — they
catch anything that reads sparse, misaligned or newly out-of-measure at
the wider caps, which is the actual risk this change carries.

**Player fix.** No code change beyond picking up `layout.capWide` like
every other studio screen. The `@container studio-player (max-width:
64rem)` breakpoint itself is untouched — raising the outer cap past it is
what makes it reachable. Verified in the browser check (`tasks.md`) rather
than by a new automated assertion, since `studio-player`'s own spec
deliberately avoids naming the threshold as a fixed number.

## Risks / Trade-offs

[Risk] A screen relying on `packages/form-ui`'s own internal
column-collapse measure (`studio-player`'s requirement: "the threshold
SHALL come from the form's own comfortable measure") could show an
awkward in-between state if that internal measure doesn't line up with the
Player's 64rem container query once the outer cap widens. → Mitigation:
this change touches neither value; the relationship between them is
exactly what it was before. Confirm visually in the browser check that the
Player's own fold and the form's internal fold, if any, don't fight each
other above and below 64rem.

[Risk] 30 mechanically-edited files is a wide surface for a stray literal
to survive the sweep unnoticed in one file, and the note-text exception
(above) is exactly the kind of detail a mechanical sweep glosses over. →
Mitigation: grep-verify zero remaining `"46rem"` / `"60rem"` literals
across the 30 genuine files specifically (not a blanket repo-wide grep,
which would wrongly flag the 7 untouched note-text occurrences as
leftovers), and separately confirm those 7 are still present and
unchanged, as explicit tasks.

[Risk] German label text (up to ~40% longer than English, per
`design-language.md`) at the new, wider caps could look sparse on a short
form. → Mitigation: not a regression — a wider cap only gives existing
content more room. DESIGN.md's per-block caps (60ch prose, 34rem dialogs,
22rem single inputs) are untouched, so nothing already well-measured gets
stretched.

## Migration Plan

Pure `packages/web` presentation change; no data migration. Deploys as an
ordinary build — no instance data, no API surface, no feature flag.
Rollback is a plain revert of the commit(s): the two token values and the
33 call sites are the entire diff.

## Open Questions

None — the two cap values, the token location, and the sweep's scope were
all settled during proposal.
