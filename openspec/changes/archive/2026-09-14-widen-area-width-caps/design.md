## Context

See `proposal.md` - Why. DESIGN.md documents two area-wide caps. A
participant or shell screen caps at 46rem. An operator screen (admin,
reporting, studio) caps at 60rem.

Each cap sits inside a screen's own outer container style, hardcoded as a
literal `maxWidth` string. Depending on the file, that style carries the name
`screen`, `studioScreen`, `empty` or `fallback`. Today the codebase holds 30
such occurrences across 30 files and no shared token.

A plain `grep -rn 'maxWidth: "46rem"\|maxWidth: "60rem"' packages/web/src`
finds more than those 30: 37 occurrences across 33 files. Seven of them
follow a different, unrelated pattern that happens to share the 46rem value.
That pattern is a small, left-aligned caption/note-text block with no
centering:
`marginTop: 0, marginInline: 0, marginBottom: space.s3, maxWidth: "46rem"`.
Its cap serves the note's own readability rather than the screen's layout.

That pattern appears in `components.tsx` (×2), `ColumnEditor.tsx` (×2) and
`ShareEditor.tsx` (×1), none of which carries a genuine screen-level cap at
all. It appears twice more inside `ReportBuilderScreen.tsx`, alongside that
file's own genuine `screen` occurrence.

One reliable signal separates the two patterns. Every genuine screen-level
occurrence pairs `maxWidth` with `marginInline: "auto"` on the same style
object, so it centers itself. Every note-text occurrence pairs `maxWidth`
with `marginInline: 0`, so it does not center. Reading every one of the 37
matches with its full surrounding style object confirmed the split. This
change therefore skips `components.tsx`, `ColumnEditor.tsx` and
`ShareEditor.tsx` altogether: they have nothing for it to touch.

Design tokens have one authoritative source: the CSS custom properties in
`packages/web/src/shell/tokens.css`. Its StyleX mirror,
`packages/form-ui/src/tokens.stylex.ts`, reproduces it 1:1 as `defineVars`
groups (`colors`, `fonts`, `space`, `radius`, `shadow`). Every screen across
all four areas already imports from `form-ui/tokens.stylex` for its existing
tokens. The import list in `PlayerScreen.tsx` is one example.

DESIGN.md leaves the process surface (`EditScreen.tsx`'s ten-tab body)
explicitly uncapped, and this change keeps it that way. A comment sits beside
that file's own `60rem` occurrence: "`.studio-edit-screen` widens past
`.studio-screen`'s 60rem cap". It confirms the occurrence as the screen's
ordinary bare-studio-screen style, a fallback rather than the process
surface's own layout. That occurrence therefore takes the shared token
exactly like every other bare studio screen, with no special case.

The Player's `@container studio-player (max-width: 64rem)` breakpoint stays
architecturally distinct from the area cap. It is a container query against
the Player screen's own element.

The process surface's five
`NARROW = "@media (max-width: 64rem)"` breakpoints sit in `EditScreen.tsx`,
`StepsRail.tsx`, `StepPage.tsx`, `FieldCatalogPanel.tsx` and
`EntityTabs.tsx`. They are viewport-relative media queries instead. No area
cap reaches them, because the process surface carries none. The
`maxWidth: "64rem"` in `MigrationSpecEditor.tsx` is an unrelated block-level
cap inside that same uncapped process surface. None of these five breakpoints change in this change.

## Goals / Non-Goals

**Goals:**
- Raise both area caps by the approved amounts (60rem→80rem, 46rem→61rem)
  everywhere they apply.
- Converge the 30 hardcoded literals onto one shared, reusable token pair.
- Leave the Player's own reflow-threshold requirement text untouched; let
  the cap increase alone make its already-specified side-by-side state
  reachable.

**Non-Goals:**
- Touching the process surface's own uncapped layout, its five `NARROW`
  viewport breakpoints, or `MigrationSpecEditor.tsx`'s block cap.
- Introducing any new intermediate breakpoint or a third cap tier.
- Any change to `packages/form-ui`'s own components. Only `packages/web`
  screens carry a `maxWidth` area cap.

## Decisions

**Token placement and naming.** This change adds a `layout` group to both
`tokens.css` (`--layout-cap-narrow: 61rem`, `--layout-cap-wide: 80rem`) and
`form-ui/src/tokens.stylex.ts` (`layout.capNarrow`, `layout.capWide`). The
group aliases the custom properties exactly the way `space`, `radius` and
`shadow` already do.

The alternative this change considered and rejected: a bare shared TS
constant with no CSS custom property. It would fork the pattern every other
token in this codebase follows. DESIGN.md already documents these two values
as design tokens rather than incidental numbers.

**Values.** The narrow cap becomes 61rem. Exact 1/3 over 46rem is 61.33rem,
rounded down to a whole rem, matching every existing cap being a whole
number. The wide cap becomes 80rem, which is exact 1/3 over 60rem and
already whole.

**Scope of the sweep.** All 30 files carrying a genuine screen-level
occurrence get the same mechanical treatment. The matching token reference
replaces the literal string. This change does not special-case
`EditScreen.tsx` (see Context above), because its one occurrence is genuine.
It special-cases `ReportBuilderScreen.tsx` in part: only that file's `screen`
style's `60rem` changes. Its `scope` and `empty` styles' `46rem` note-text
caps stay exactly as they are. The sweep leaves `components.tsx`,
`ColumnEditor.tsx` and `ShareEditor.tsx` alone.

**No `/impeccable shape` pass.** CLAUDE.md's convention runs
`/impeccable shape <screen>` during the proposal. That pass decides a
screen's UX and layout before any code exists.

This change makes no new layout decision. Every screen's composition,
hierarchy and content stay the same. Only the existing, already-shaped
column's outer bound grows, by a fixed ratio. The purpose of `shape`,
deciding what goes where, does not apply to a change that moves nothing.

At the verification stage (`tasks.md`), two other checks do apply here:
`/impeccable critique` and `/impeccable audit`. They catch anything that
reads sparse, misaligned or newly out-of-measure at the wider caps. That is
the actual risk this change carries.

**Player fix.** No code change beyond picking up `layout.capWide` like every
other studio screen. The `@container studio-player (max-width: 64rem)`
breakpoint stays exactly as it is. Raising the outer cap past it is what
makes it reachable. The browser check (`tasks.md`) covers this rather than a
new automated assertion. That choice follows from the `studio-player` spec,
which deliberately avoids naming the threshold as a fixed number.

## Risks / Trade-offs

[Risk] `packages/form-ui` carries its own internal column-collapse measure.
Once the outer cap widens, that measure might fail to line up with the
Player's 64rem container query. A screen would then land in an awkward
in-between state. The `studio-player` requirement states the measure this
way: "the threshold SHALL come from the form's own comfortable measure".

→ Mitigation: this change touches neither value, so the relationship between
them stays exactly what it was before. The browser check confirms this
visually. The Player's own fold and the form's internal fold, if any, must
agree above and below 64rem.

[Risk] 30 mechanically-edited files are a wide surface. A stray literal could
survive the sweep unnoticed in one of them. The note-text exception (above)
is exactly the kind of detail a mechanical sweep glosses over.

→ Mitigation: two explicit tasks. One greps the 30 genuine files for any
remaining `"46rem"` or `"60rem"` literal, scoped to those files rather than
repo-wide. A blanket repo-wide grep would wrongly flag the 7 untouched
note-text occurrences as leftovers. The other task confirms those 7 are still
there, unchanged.

[Risk] German label text runs up to ~40% longer than English, per
`design-language.md`. At the new, wider caps it could look sparse on a short
form.

→ Mitigation: this is no regression, because a wider cap only gives existing
content more room. This change leaves DESIGN.md's per-block caps (60ch prose,
34rem dialogs, 22rem single inputs) alone. So nothing already well-measured
gets stretched.

## Migration Plan

Pure `packages/web` presentation change; no data migration. It deploys as an
ordinary build, with no instance data, no API surface and no feature flag.
Rollback is a plain revert of the commit(s). The two token values and the 30
call sites are the entire diff.

## Open Questions

None. The two cap values, the token location, and the sweep's scope were all
settled during proposal.
