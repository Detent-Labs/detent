## Context

`packages/web/src/shell/tokens.css` already uses a two-tier structure. A
handful of primitives (`--paper-50`, `--ledger-100`, `--ink-900`,
`--slate-500`, `--stamp-blue-600`, `--seal-700`, `--alert-700`) feed
semantic aliases that component CSS reads: `--color-surface`,
`--color-text`, `--color-accent`, `--color-success`, `--color-danger`.
Dark mode overrides only the primitives, so every semantic alias flips for
free. That structure stays.

The current file has no radius scale and no shadow scale. Radius is a
literal `3px` in two rules today. It also has no 9-step ramp per color
role. Two things the new language changes outright. `--font-display` is
monospace today, and drives `h1`/`h2`. The new language moves headings to
Archivo and keeps mono strictly for engine-matched values. `--space-1..5`
is a 5-step rem scale today. The document specifies a 6-step px scale:
`--space-1` at 4px through `--space-8` at 32px, skipping 5 and 7.

A repo-wide grep for the tokens and patterns this change touches
(`--color-success`, `--color-danger`, `--font-display`, `border-radius`,
`--color-accent-contrast`, `--color-surface-muted`, `--color-text-muted`,
`--color-border`) returns 256 occurrences across the six `packages/web`
CSS files. That count is the real size of the mechanical migration inside
each area's restyle pass. It is separate from the token-file rewrite
itself.

A repo-wide check found zero `className` containing `btn` anywhere in
`packages/web/src`. The codebase carries no button-variant class today.
Every `<button>` element relies on one unclassed rule
(`tokens.css:81-88`). See the button-classification decision below.

See `proposal.md` for why this replaces the current system.

## Goals / Non-Goals

**Goals:**
- Land the exact token values, ramps, and component rules the reviewed
  design document specifies. Use the variable names this codebase already
  uses wherever a role matches 1:1.
- Leave every non-visual behavior, DOM attachment point, and area boundary
  exactly as it is today.
- Carry the new ramps through the existing primitive-to-semantic
  indirection, the same way it carries today's seven primitives. Dark mode
  keeps working through that same mechanism.
- Verify the new ramps meet WCAG AA contrast on the surfaces they render
  against. The reviewed document already supplies the visual direction
  CLAUDE.md's design-skill routing exists to give a change like this one.
  That routing also requires a contrast check. Nobody has run one against
  these live components yet, so this change still runs it (task 9.7).

**Non-Goals:**
- Rewriting component markup (TSX) to change structure. A markup change is
  in scope to swap a class, or to fix a hardcoded value that blocks a
  token. It is also in scope for one specific addition: a
  button-variant className (`.btn-primary`, `.btn-secondary`, or
  `.btn-ghost`) on an existing `<button>` element. No button-variant class
  exists anywhere yet, so this addition is unavoidable; nothing else about
  a button's markup changes.
- Introducing a CSS-in-JS layer, a design-token build step, or a new
  styling method. Plain CSS custom properties on plain classes, as today.
- Reconciling every visual difference between the source `.dc.html`
  document's static mockup and the live React components. The document is
  the source of truth for tokens and component rules. The live area
  screens are the source of truth for what markup exists to restyle.

## Decisions

**Keep existing semantic names where a role matches 1:1. Add new semantic
names for roles the file lacks.** `--color-surface` stays `--color-surface`
(the document's "Ground" role). `--color-text` stays (the document's
"Ink" role). New semantic variables cover roles with no current
equivalent. `--color-divider` is one. Two 9-step ramps are new too:
`--color-neutral-100..900` and `--color-accent-100..900`. A third ramp,
`--color-accent-2-100..900`, covers a second tag tone.
`--radius-sm/md/lg` and `--shadow-sm/md/lg` are new as well.

Alternative considered: rename every semantic variable to match the
document's own names (`--color-bg`, `--color-neutral-700`). Rejected. That
forces a find-and-replace across all 250 existing references for no
behavioral gain. The document treats role and token name as the same
concept, not a literal API to copy.

**Drop `--color-success` and `--color-danger` as distinct roles.** Sort
every call site into one of three buckets first. A repo-wide grep of
these two variables turns up three different jobs, not one:

1. **Stamp/badge tone color**: `.admin-badge-*`, `.rep-stamp-danger`,
   `.app-stamp-case`. The document defines five stamp tones: Open,
   Settled, Dormant, Caution, Refusal. Together they cover every state
   these badges name today. A "success" state (completed, delivered,
   enabled) becomes the ink-outlined Settled tone, never green. A
   "danger" state becomes the accent-700 Refusal tone. The document caps
   the tone count at five, calling a sixth a design change, not a screen
   decision.
2. **Plain inline error and conflict text, and its border**:
   `.shell-error`, `.app-error`, `.studio-error`, `.studio-conflict`,
   `.rep-error`, `.admin-error`. The document's own error-banner mockup
   colors only the stamp red. Its message text (`Could not reach the
   server…`) renders in plain ink beside a red "Failed" stamp. That
   pairing holds only where a call site renders a stamp next to the text.

   A check of every occurrence of the six classes found most do not pair
   with one. The `*-error-banner-stamp` siblings pair correctly, such as
   `.app-error-banner-stamp`. Most occurrences are standalone
   form-validation or outcome messages with no stamp nearby:

   - `.shell-error` at `LoginScreen.tsx:61-62`.
   - Nine `.studio-error` sites: `VersionsScreen.tsx:236`,
     `ToolsScreen.tsx:199,216`, `PlayerScreen.tsx:191,232`,
     `EditScreen.tsx:221`, `MigrationPlanScreen.tsx:218`,
     `MigrationSpecEditor.tsx:133,233`, `DraftToolbar.tsx:126`.
   - Two `.studio-conflict` sites: `PlayerScreen.tsx:205`,
     `DraftToolbar.tsx:133`, `MigrationPlanScreen.tsx:178`.
   - Two `.app-error` sites: `TaskScreen.tsx:243,246`.
   - `.admin-error` at `DataListScreen.tsx:187`.
   - One of `.rep-error`'s two sites, `reporting/root.tsx:84`. The other
     `.rep-error` site, `components.tsx:63-64`, does pair with
     `.rep-stamp-danger`.

   Decision: the move to `--color-text` (ink) applies only at a paired
   call site. That is one where the class sits beside a stamp carrying
   the error color on its own. The stamp is a `*-error-banner-stamp`
   sibling, or (for `.rep-error`) `.rep-stamp-danger`. Every standalone
   occurrence keeps `--color-danger`. It repoints to the refusal tone,
   not to ink, so it still reads as an error.

   This is a rule per call site, not per class name. Two `.rep-error`
   sites in the same file resolve differently. The area pass (tasks
   3.2/4.3/5.4/6.2, and 1.6 for `.shell-error`) checks each occurrence
   against its rendered context before repointing it.
3. **A JSON diff and a canvas terminal-step marker, neither covered by
   the document.** Two classes in `studio/app.css` fall here. One is
   `.studio-diff-added`/`.studio-diff-removed`, which colors an added or
   removed line in a published-version diff. The other is
   `.canvas-terminal-stamp circle`/`text`, which marks a canvas step bound
   to a contract outcome. Neither is a stamp in the document's sense. The
   new single-accent palette also has no green to fall back to for
   "added."

   Decision: `.studio-diff-removed` keeps accent-700. `.studio-diff-added`
   moves to `--color-neutral-900` instead. The leading `+`/`-` character
   carries the distinction, not color alone.

   `.canvas-terminal-stamp` gets no errored/normal split.
   `ProcessContract.outcomes` (`src/schema/definition.ts:562`) is
   `z.array(z.string())`. It is a free-form, author-named list. Nothing in
   it marks one entry as an error. `CanvasView.tsx` applies the class
   unconditionally to every terminal step. There is no data to key a
   split on. Inferring one from outcome text, matching `"reject"` or
   similar, breaks against an author's own naming.

   Every `.canvas-terminal-stamp` moves to `--color-neutral-900`
   uniformly, matching `.studio-diff-added`. A later stage that gives an
   outcome a real semantic kind can reopen this split with data behind
   it. Nothing here forecloses that.

Alternative for bucket 1: keep `--color-success` as an alias for ink,
`--color-danger` for accent-700. Rejected. A property still named
`--color-success` invites a future author to reach for green-for-success
as if it still existed. That is the exact drift the document's five-tone
rule exists to prevent.

Every grepped occurrence of these two variables gets repointed per its
bucket during the area pass. A removed custom property resolves to
nothing silently. This gets checked by grep before and after, not by the
type system.

**Adopt the document's 6-step px spacing scale. Drop the 5-step rem
scale.** `--space-1` at 4px through `--space-8` at 32px. Alternative: keep
the rem-based scale and only change its values. Rejected. The document's
own component rules give distances in px: a 4px label-to-control gap in
Fields, for example. Mixing a px-authored spec onto a rem-based scale
brings back the same translation error the scale exists to prevent.

**Move headings to Archivo. Reserve the monospace stack strictly for
engine-matched values. A third bucket, neither heading nor engine value,
also leaves mono.** This reverses today's behavior, where `h1`/`h2`
render in the monospace `--font-display`. Every existing
`var(--font-display)` reference gets audited in the area pass, sorted
into three buckets, not two.

A call site styling a heading moves to a new `--font-heading` variable:
Archivo, weight 800. A call site styling an id, hash, CEL expression, or
duration keeps the monospace stack instead. That stack now sits under a
`--font-mono` name, matching the rest of the token set.

The third bucket: a structural or navigational label that is neither a
heading nor an engine-matched value. Grep turns up several. Table column
headers count, in every area: `.admin-table th`, `.studio-table th`,
`.rep-table th[scope="col"]`. So does the account-menu item label,
`.shell-menu-label`. So does meta or caption text: `.admin-role-chip`,
`.rep-picker-meta`, `.admin-timeline-meta`, `.studio-file-label`,
`.condition-readout-label`, `.studio-dialog-facts dt`.

The document's own reference `styles.css` sets `.table th` in the plain
body face, uppercase and tracked. It carries no monospace override. This
bucket follows that lead: it moves to the body or heading face, never
mono. Mono stays reserved for a value the reader would sort or the
engine would match. A column header or a menu item is neither.

No alternative considered here. The document is explicit: a value the
engine matches gets the mono face, and prose never does. Today's
mono-headings choice is the exact inversion of that rule. Today's
mono-table-headers choice is a case the document's own reference CSS
already contradicts.

**An eighth primitive, `--color-warning` (ochre), lives only in
`studio/app.css`. Retire it into the Caution tone.**

Found during the area pass, not during review. Four classes key a "key
collision" or "unfinished row" state off this ochre primitive:
`.studio-warning`, `.condition-flag`, `.studio-map-unresolved`, and
`.condition-row.is-incomplete`.
None of the seven primitives above back it. The document caps stamp
tones at five and calls a sixth a design change, not a screen
decision. Ochre was an unauthorized sixth color under that rule.

Its own use already matches the Caution tone: refusal-colored text on
a lighter, accent-400 rule, dashed wherever a border exists.
The studio pass repoints all four sites to that definition. It keeps
no bespoke color.

**Radius and shadow tokens are new, not renamed.** Nothing today reads a
`--radius-*` or `--shadow-*` variable; neither existed. The area pass
replaces every literal `border-radius` and `box-shadow` in the six CSS
files. Each gets the matching token. `--radius-sm/md/lg` all resolve to
zero. Every rounded corner in the product becomes square as a result.
`--shadow-*` exists for one component only, the dialog. The document
keeps an elevation there. Most of the product's flat surfaces will not
reference it at all.

**Add `.btn-primary`/`.btn-secondary`/`.btn-ghost` classNames to every
`<button>` element; none exist today.** Every button today is the bare
`<button>` element, styled by one unclassed rule (`tokens.css:81-88`). The
document's three button treatments have no selector to restyle without
this addition.

Classification: a button that submits, starts, publishes, or otherwise
commits the primary action of its screen is `.btn-primary`. An alternate
committing action beside it, such as release, delegate, or retry, is
`.btn-secondary`. A dismissing action, such as cancel, discard, back, or
close, is `.btn-ghost`. The area pass (tasks 3.1/4.1/5.1/6.1) applies
this classification button by button, screen by screen. The touched TSX
files join `proposal.md`'s Impact list.

Alternative: keep every button on the current single unclassed rule and
drop the primary/secondary/ghost distinction. Rejected. The document
specifies three visually distinct button treatments. Wiring only a
default rule ships a change that never shows two of the three.

## Risks / Trade-offs

- **A removed custom property fails silently.** Repointing every
  `--color-success`, `--color-danger`, and `--font-display` reference is
  mechanical. It must be exhaustive too. A missed site does not error. It
  renders with an unset custom property: transparent, or the browser
  default. Mitigation: grep for all three names again after each area
  file gets restyled, before moving to the next. Grep once more at the
  end.
- **Radius-zero touches every screen.** Even a rarely visited screen or a
  modal state inherits the new radius tokens. Both get them through the
  shared `.btn`/`.input`/`.card` base classes, whether the document's
  mockups covered that screen or not. Nobody has checked it against the
  document by eye. Mitigation: the in-browser checkpoint after Pass 1. A
  full click-through of all four areas matters too, not just the screens
  the document mocks up.
- **The spacing-scale shape change touches every `var(--space-N)` call
  site, not only the ones whose value changes.** Five steps become six.
  Rem becomes px. A call site using the removed `--space-5` needs an
  explicit remap, most likely to `--space-6`. Mitigation: grep
  `var(--space-5)` before treating the token file as done. Confirm no
  `--space-7` usage survives from a later, partial change either.
- **Lucide is a new external dependency this repo did not carry before.**
  The source document's own preview loads it from `unpkg.com`. The real
  implementation installs it as a workspace dependency instead. That keeps
  `packages/web` working offline. It also matches how every other
  dependency in this repo resolves.

## Migration Plan

1. **Pass 1, foundation.** Rewrite `tokens.css` per the decisions above,
   then `shell.css`, including `.shell-tab`. Checkpoint with the user
   before Pass 2. Run the app in a browser. Screenshot the shell and the
   area-switcher tab in both light and dark. Get the user's go-ahead.
2. **Pass 2, areas.** Restyle `app.css`, `admin.css`, `studio.css`,
   `reporting.css`, then `form-ui.css`, in that order, and install the
   Lucide icon set alongside the area restyles that use it.
   Participant-facing goes first: it is the smallest area. The document
   covers it most. Studio goes last. It is the largest area, at 841 lines
   with a canvas editor. The document covers it least.
3. **No rollback machinery needed.** This is a static asset change. No
   data migration, no API version bump, nothing to roll back at runtime.
   Rollback is `git revert` on the commit for either pass. The two passes
   are already the natural revert boundary.

## Open Questions

None. The reviewed document states every token value and component rule
this change needs. The decisions above resolve every place it
under-specifies, against the code that already exists.
