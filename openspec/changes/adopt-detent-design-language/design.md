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
`--color-border`) returns 250 occurrences across the six `packages/web`
CSS files. That count is the real size of the mechanical migration inside
each area's restyle pass. It is separate from the token-file rewrite
itself.

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

**Non-Goals:**
- Rewriting component markup (TSX) to change structure. A markup change is
  in scope only to swap a class or a hardcoded value that blocks a token.
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
   `.rep-error`, `.admin-error`. These move to `--color-text` (ink), not
   to the refusal tone. The document's own error-banner mockup colors
   only the stamp red. Its message text (`Could not reach the server…`)
   renders in plain ink beside a red "Failed" stamp. Each of the five
   classes above already has a sibling `*-error-banner-stamp` class. That
   sibling carries the stamp's own color separately, so this split costs
   no new markup.
3. **A JSON diff and a canvas terminal-step marker, neither covered by
   the document.** Two classes in `studio/app.css` fall here. One is
   `.studio-diff-added`/`.studio-diff-removed`, which colors an added or
   removed line in a published-version diff. The other is
   `.canvas-terminal-stamp circle`/`text`, which marks a canvas step bound
   to a contract outcome. Neither is a stamp in the document's sense. The
   new single-accent palette also has no green to fall back to for
   "added."

   Decision: `.studio-diff-removed` keeps accent-700, and so does
   `.canvas-terminal-stamp` on an error path. `.studio-diff-added` and a
   normal `.canvas-terminal-stamp` move to `--color-neutral-900` instead.
   From here, the leading `+`/`-` character and the stamp's own shape
   carry the distinction, not color alone.

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

**Radius and shadow tokens are new, not renamed.** Nothing today reads a
`--radius-*` or `--shadow-*` variable; neither existed. The area pass
replaces every literal `border-radius` and `box-shadow` in the six CSS
files. Each gets the matching token. `--radius-sm/md/lg` all resolve to
zero. Every rounded corner in the product becomes square as a result.
`--shadow-*` exists for one component only, the dialog. The document
keeps an elevation there. Most of the product's flat surfaces will not
reference it at all.

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
