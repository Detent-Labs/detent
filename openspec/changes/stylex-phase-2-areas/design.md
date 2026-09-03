## Context

See proposal.md, Why. Phase 0 (archived) settled the tooling, the token
module and the test story. Phase 1 (archived) proved two patterns on
`packages/form-ui`. One is a fixed two-value ternary. It picks between
named styles.

The other is a `{ default, '@<rule>': ... }` conditional
value. Both patterns carry forward here, unmodified.

This change's own audit, not phase 0's original estimate, measured the
real scope. Four files hold 201 rule blocks: `shell.css` 37,
`areas/app/app.css` 38, `areas/admin/app.css` 65, `areas/reporting/app.css`
61. Their area-local `className` sites number 424: shell 58, app 72, admin
198, reporting 96. Phase 0's plan named "194 rules" and "about 250" sites.
The real count runs higher, mostly in admin. This design uses the measured
count, not the old estimate.

Three patterns in this phase's files did not exist in phase 0's pilot or
phase 1's form-ui:

- `.shell-menu:popover-open` (`shell.css:105`) styles the account menu's
  open state. It is live today. `Chrome.tsx`'s native
  `popover="auto"`/`popoverTarget` wiring drives it.
- `.app-task-link:hover .app-task-step` (`areas/app/app.css:124`) is a
  descendant selector. An ancestor's `:hover` reaches it. Three files
  render both classes: `InvolvedScreen.tsx`, `StartedScreen.tsx` and
  `TasksScreen.tsx`.
- A status or kind string carries an open-ended value. Phase 1's value was
  a fixed two-value choice; this one is not. Four examples: an outbox
  delivery status (`OutboxScreen.tsx`), an instance status
  (`InstanceScreen.tsx`, `InstancesScreen.tsx`), an enabled/disabled state
  (`DataListScreen.tsx`, `UsersScreen.tsx`), a report cell's data kind
  (`ReportTable.tsx`). `design-language.md`'s stamp rule bounds the
  outcome: "Five tones exist and no sixth."

`.btn`/`.app-back` (`tokens.css:107-179`) sit outside this design's actual
scope. Phase 0's D9 and phase 1's proposal both named them "phase 2's own
scope." Decision D1 explains why that call changes here.

## Goals / Non-Goals

**Goals:**

- Every rule in `shell.css` becomes a typed StyleX style. So does every
  rule in the three areas' own `app.css` files. Each reads the existing
  token module. All four stylesheets shrink to just the rules this change
  defers.
- Six files carry `shell.css`'s rules, and this phase migrates every
  file. One pair of rules stays behind; see D10. The chrome component
  carries the account group and menu. The app shell and each area's own
  root component carry the shared nav wrapper and the loading/forbidden
  empty state. The login
  screen, the error banner, the error boundary and the profile page each
  carry their own.
- `:popover-open` and one ancestor-hover rule get a real, build-verified
  answer. Neither rests on the assumption phase 0's plan carried.
- An open-ended status or kind value picks its style from a typed lookup.
  A status the lookup does not enumerate falls back to a named neutral
  style.
- Each area's probe in `docs/browser-checks.md` confirms seeded data still
  renders. It checks the outbox badge, the duration bar, an admin table
  row's status badge, and an app task's stamp.

**Non-Goals:**

- `.btn`/`.app-back`. See D1.
- `areas/studio/app.css`, `CanvasView.tsx`, `EditRail.tsx`. Phase 3 and 4's
  scope. Its `root.tsx` is not: its one `.shell-nav` wrapper moves with
  the other three areas' roots. `.shell-nav` belongs to `shell.css`, not
  to studio's own stylesheet. See D9.
- A shared cross-area stamp module. See D3.
- Any change to an area's rendered layout, copy or behavior beyond the
  styling mechanism.

## Decisions

**D1. `.btn`/`.app-back` stay in `tokens.css`, deferred past this phase.**
This corrects phase 0's D9 and phase 1's own proposal. Both named these
classes "phase 2's own scope." This change's own audit found 208
`className` sites referencing the `.btn` family, across 55 files. Roughly
half of those files, 28, sit under `packages/web/src/areas/studio/`.
Studio stays untouched until phase 3 or 4.

StyleX compiles a call site to a hashed class, scoped to that call site.
It produces no reusable literal selector another, unmigrated file can
still reference. Phase 2's own four areas hold 94 of the 208 call sites.
Deferring all of them still applies the same reasoning.

A phase may delete `tokens.css`'s `.btn` rule the moment it migrates its
own share. That would leave an unconverted file's still-literal
`className="btn btn-primary"` matching no CSS at all. That holds whether
the file sits in studio or in this phase's own scope.

`.btn`/`.app-back` migrate together with whichever phase converts the
last file still writing that literal string. That is most likely phase 3.
Phase 1's D5 already reasoned this way, one phase earlier, about
`PathButtons`' own button element. A shared class with an unconverted
consumer stays literal until that consumer converts too.

One test file in this change's audit asserts `.btn`-family classes:
`packages/web/test/studio-processHeaderBar-publishGate.test.tsx`. This
decision leaves it unchanged.

**D2. `:popover-open` is a StyleX conditional value.**
A real build verifies it. That check runs before any later task depends
on the assumption. Phase 0's plan named `:popover-open`/`::backdrop` as
"first use" in phase 3. That assumption was wrong. `shell.css`'s account
menu already uses `:popover-open` today, inside this phase's own scope.

The shape follows phase 1's D3 exactly: a `{ default, ':popover-open':
... }` conditional value, on the property that toggles the menu's
`display`. Task 2.2 writes this rule, then reads the emitted CSS right
after. That is the same "verify immediately" discipline phase 1's D3 used
for `@container`. The compiler may not emit a working `:popover-open`
selector. If so, the fallback is a literal, unhashed residual rule. Phase
1's own D3 risk names that same fallback for `@container`.

**D3. A typed lookup replaces an open-ended status string's class-name
construction.** Each area keeps its own lookup, rather than sharing one.
Phase 1's D2 covered a fixed two-value choice: `columns`, `span`. This
phase's status and kind values are open-ended instead. Four examples: an
outbox delivery status, an instance status, an enabled/disabled state, and
a report cell's data kind.

`design-language.md` bounds the outcome to five tones. The lookup's VALUE type therefore stays small
and closed, even where its KEY type does not.

Each area declares its own `Record<KnownStatus, StyleXStyles>`. It keys on
the exact status literals that area's CSS names today. Admin's
`running`/`pending`, for example, map to the "open" tone. A call site reads
`lookup[status] ?? styles.neutral`.

A status the lookup does not name falls back to the base stamp style, with
no color override. That preserves today's CSS cascade behavior: an
unmatched `.admin-badge-*` suffix already falls through to
`.admin-badge`'s own bare rule. No color, no throw, either way.

The lookup stays per area, not a shared cross-area module. Three area
stylesheets already carry near-identical `.app-stamp`/`.admin-badge`/
`.rep-stamp` rule blocks today. `design-language.md` already states the
reason: "An area never styles another area's prefix. Shared motifs move to
`shell/`, or engineers duplicate them on purpose." A shared module would be
an architecture change this proposal never asked for. It would trade an
already-endorsed duplication for a new cross-area dependency, and no
requirement here needs that trade.

**D4. `.app-task-link:hover .app-task-step` attempts `stylex.when.ancestor`.
A check verifies it immediately, with a literal-CSS fallback ready.**
`@stylexjs/stylex` 0.19.0 exports `when.ancestor`, confirmed in
`node_modules/.bun/@stylexjs+stylex@0.19.0/.../StyleXTypes.d.ts`. It is a
Babel-macro function: it throws if it ever runs uncompiled, the same
family as `stylex.create` itself. The link marks itself with
`stylex.defaultMarker()`. The child's style block keys one property on
`stylex.when.ancestor(':hover')`.

This is the one occurrence of this pattern in the whole audit. Three
files render it, though: `InvolvedScreen.tsx`, `StartedScreen.tsx` and
`TasksScreen.tsx` each render both `.app-task-link` and `.app-task-step`.
Task 3.2 converts all three call sites together, since they share one
rule.

The API sits at a newer, less-proven edge of the package: a function
whose only runtime job is to throw. Task 3.2 writes the rule, then checks
the compiled CSS and a real hover in the browser, right after. No later
task assumes it works first. The marker mechanism may not compile as
expected. If so, the fallback is the same literal-residual-rule shape D2
and phase 1's D3 both use.

**D5. The duration bar's numeric width stays a literal inline style.**
`DurationRule` (`areas/reporting/components.tsx`) sets `style={{ width:
`${Math.round(fraction * 100)}%` }}` today. That value comes from live
data, not a fixed enumeration. StyleX styles a fixed, known set of values
per call site, with no mechanism for an arbitrary runtime number.

Only `.rep-rule`/`.rep-rule-fill`/`.rep-rule-fill-danger`, the tone and
layout classes, become StyleX styles. The inline `style` prop stays
exactly as it renders today.

**D6. The bun:test stub preload gains a `when` export.**
`test/preload-stylex.ts` mocks `create`, `defineVars`, `props` and
`defaultMarker` today. No style object in the package called
`stylex.when.*` before this phase.

D4's rule would throw the moment a test imports the component. The real
export throws when uncompiled, and the mock supplies no replacement. The
stub gains a `when` object instead. Its methods return a plain string and
never throw, mirroring `defaultMarker`'s own identity-no-op shape. Task
1.2 makes this change before any component needs it, so the risk surfaces
at the stub, not mid-migration.

**D7. `Chrome.tsx`'s account button needs no change.** It carries
`className="btn btn-secondary shell-account-button"` today. `shell.css`
never declared a `.shell-account-button` rule. That class carries no
style, and never did. D1 keeps `.btn`/`.btn-secondary` literal. Nothing
on this element migrates, so its className string stays exactly as it
renders today.

This phase's own audit checked all four areas. It found no element that
mixes a still-literal `.btn`-family class with a class this phase
migrates.

One may still turn up during apply. The pattern to use is already
established: join a literal prefix and a compiled style's own className
by hand.

`stylex.props()` composes style objects, not a literal string plus one.
`PathButtons.tsx` already uses this shape. It composes its own compiled
wrapper style with a caller-supplied one, under phase 1's D5.
`web-styling`'s "A shared class stays literal" requirement records the
pattern, for this case or a later phase's.

**D8. This change stays one OpenSpec change, not two.** Phase 0's own
design.md left that open. It named phase 1's close as the point to
decide. The question still sits unresolved in `docs/decisions.md`. Phase
1 is now archived. This decision answers it.

Phase 1's own cycle, a much smaller migration, still paid the full
propose-review-apply-verify-archive overhead once. Splitting phase 2 by
area would pay that fixed overhead four times, for no independent-review
benefit.

All four areas share the same D1 through D7 decisions. Splitting them
would duplicate those decisions across two documents. Or it would force
one design to depend on the other's still-unreviewed choices.

Each area already forms its own commit boundary in the Migration Plan
below. This change may prove unwieldy in practice. A mid-flight split
would then cost little. The tasks for an unstarted area group move to a
new change, with no rework of a finished one.

**D9. The shared nav wrapper migrates everywhere at once.** That covers
studio too.

Four root components carry it: admin's, app's, reporting's and studio's
own, each on one identical nav wrapper. The class is `.shell-nav`, and it
belongs to `shell.css`. No area's own stylesheet owns it.

Studio's own call site is a single, self-contained line. Converting it
needs no other studio file, and no studio `app.css` rule.

This differs from D1's `.btn` deferral. There, an unconverted consumer
sits inside a large, untouched file this phase has no reason to open.
Here, studio's root component needs the same one-line swap the other
three areas' roots already need. Nothing else in that file changes.
Deferring it anyway would leave studio as the one area still carrying a
literal `shell-nav` class no compiled rule matches. No reason beyond an
artificial scope line would justify that.

**D10. `.shell` and `.shell > *` stay literal.** `Chrome.tsx`'s one
wrapper `<div>` renders `.shell`. Every area screen is its child.
`.shell > *` sets `width: 100%` on each one. That restores the block-box
width a flex item's auto margins would otherwise collapse. This child
set spans every area, studio included, and this phase does not touch
studio's own screens.

A compiled style could give the wrapper `<div>` a hashed class. Nothing
could then match `.shell > *`'s descendant rule to it. That rule targets
a literal string, not a per-call-site hash.

The two rules stay coupled: migrating one breaks the other.
`Chrome.tsx`'s wrapper keeps its literal `className="shell"`. Both rules
stay in `shell.css`, the same shape `web-styling`'s "Two class names
stay literal" requirement already covers.

**D11. Each area's `prefers-reduced-motion` reset stays literal, in its
own file.** Three files end in a near-identical block: `app.css`,
`admin/app.css` and `reporting/app.css`. Each reads `@media
(prefers-reduced-motion: reduce) { * { ... !important } }`.

All three reach every element on the page. That is the same "no single
component owns this" shape D10 already named for `.shell > *`.

`web-styling`'s own "One global stylesheet carries what the compiler
cannot" requirement already answers where this rule lives. It reads: "A
prefers-reduced-motion block belongs to the area whose animation it
suppresses." It continues: "Those blocks migrate with their areas, not
into this sheet." Migrating with the area means staying in that area's
own stylesheet. This phase does not delete that stylesheet outright; it
only removes what compiles. Each block stays exactly where it sits,
literal and unhashed, one rule per area.

This is not a StyleX limitation worth working around. A universal
selector styles the whole page, not one component's own call site. No
compiled style could express that, regardless of the property inside.

**D12. Four selectors, across two files, each carry two declarations.**
The merge happens in code, not by relying on cascade order. Each pair
splits non-overlapping properties across the same selector. The cascade
merges them today.

`admin/app.css` declares `.admin-field` twice (lines 304 and 424) and
`.admin-role-input` twice (lines 200 and 225). `reporting/app.css`
declares `.rep-empty` twice (lines 226 and 233) and, inside a
comma-joined selector, `.rep-table th[scope="row"]` twice (lines 185
and 191).

A `stylex.create` entry is one object. Tasks 4.1 and 5.1 SHALL combine
each selector's declarations into one style, in their own file. Each
verifies this by checking the compiled CSS carries every property every
source rule declared, for its own pair.

`.admin-role-input`'s first declaration is a joint one, shared with
`.admin-role-list`. That rule's own font-mono/0.8rem shape never
repeats, so it stays intact, unmerged. `.rep-table th[scope="row"]`'s
second declaration is joint too, shared with `.rep-table td`. That
selector's own padding/border/vertical-align shape names no
`th[scope="row"]`-only property, so it also stays intact, unmerged.

**D13. The current-tab condition moves to JS.** Each root already tracks
which tab is current, to set its `aria-current` attribute. Task 2.8
reads that same boolean and composes `navStyles.navCurrent` only then,
the way `Chrome.tsx` already composes `accountNameId`.

An unconditional `background` needs a `default` branch too. That
branch's boosted specificity would beat `.btn-secondary`'s own hover and
active rules, on every tab. The hover wash would stop appearing, even on
a tab that is not current.

`:popover-open` and `:hover` (D2, D4) key real browser states no JS
boolean tracks. This one already has a boolean. Branching on it in JS
needs no CSS condition, and collides with nothing. The `aria-current`
DOM attribute itself stays, for assistive technology. Only its CSS
selector goes.

## Risks / Trade-offs

- [`:popover-open` does not compile as expected] → D2's fallback: a
  literal, unhashed rule. Task 2.2 catches this early.
- [`when.ancestor`'s marker does not reach the child] → D4's fallback: the
  same residual-rule shape. Task 3.2 catches this early too.
- [An unaudited status literal reaches a lookup] → D3's fallback renders
  the base stamp style. No color override, matching today's behavior.
- [Admin's 198 sites hide a transcription error] → task 4.4's
  grep-for-zero check runs per area. It does not wait for the end.
- [A stale class-name substring passes untested] → the same grep-for-zero
  check stands in for a test assertion. Phase 1's task 4.4 set this
  precedent.

## Migration Plan

Order: the shared, small pieces first. D2 and D4 are the only genuinely
open technical questions in this change. Every other task's confidence
rests on their answer. D6's stub change lands before any task exercises
`when.ancestor` under `bun test`.

1. Pre-flight and the stub fix (D6).
2. `shell.css` and its six consumer files, including D2's
   `:popover-open` check and D9's four-root `.shell-nav` swap.
3. `areas/app/app.css`, including D4's `when.ancestor` check.
4. `areas/admin/app.css`, the largest file.
5. `areas/reporting/app.css`, including D5's inline-style carve-out.
6. Cleanup: delete each stylesheet's migrated rules. Each file keeps only
   what this change defers.
7. Docs and roadmap, including D8's split-question resolution.
8. Verification: typecheck, build, full suite, gates, and a browser probe
   per area.

Rollback: revert this change's commits. It touches no engine file. Its
one studio-side touch, D9's `.shell-nav` swap in `studio/root.tsx`, is a
single, standalone line. Nothing else in studio depends on it.
`tokens.css`'s
`.btn`/`.app-back` rules stay exactly as they are on `main` today. No
other phase's own plan needs to change if this one reverts.

## Open Questions

None left unaddressed. D2 and D4 are this change's only real technical
unknowns. Each names the task that answers it, immediately, before any
later task depends on the outcome. D8 closes the one process question
phase 0 deferred to this point: whether phase 2 splits into two changes.
It does not.
