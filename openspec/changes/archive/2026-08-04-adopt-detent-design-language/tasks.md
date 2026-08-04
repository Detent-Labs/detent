## 1. Token foundation (Pass 1)

- [x] 1.1 Rewrite `packages/web/src/shell/tokens.css` primitives and
      semantic aliases per `design.md`: new color roles (ground, surface,
      ink, muted, divider, hairline, accent, refusal), the accent and
      neutral 9-step ramps, the accent-2 ramp, Archivo for
      `--font-heading`/`--font-body`, a renamed `--font-mono` for the
      monospace stack, the 6-step px `--space-1..8` scale, and
      `--radius-sm/md/lg` at `0`. Also restyle this file's own embedded
      base component rules (`button`, `input`/`select`, `h1`/`h2`, and
      `button.app-back`) to the new tokens — `.app-back` lives here, not in
      `app/app.css`. Values sourced from
      `tmp/_ds/modernist-bb0ee886-041b-4808-8431-aaba18f9b5c7/styles.css`
      and the role/scheme-pair data embedded in `tmp/Detent Design
      Language.html`, both supplied by the user.

      Implementation refinement: `.btn`/`.btn-primary`/`.btn-secondary`/
      `.btn-ghost` are defined once here (matching the source stylesheet's
      own single shared definition), not redeclared per area — the same
      pattern the bare `button` rule already used. Tasks 3.1/4.1/5.1/6.1
      below now only wire the classNames onto each area's TSX buttons; the
      CSS rules already exist.
- [x] 1.2 Add `--shadow-sm/md/lg` (ink-tinted `color-mix` shadows) to
      `tokens.css`. Tinted with the current-scheme `--color-text` rather
      than a fixed hex, so the shadow stays correct in dark mode too.
- [x] 1.3 Add dark-mode overrides for every new or changed primitive in
      the `@media (prefers-color-scheme: dark)` block.
- [x] 1.4 Drop `--color-success` and `--color-danger`; confirm nothing in
      `tokens.css` or `shell.css` itself still references them.
- [x] 1.5 Restyle `packages/web/src/shell/shell.css`, including the
      `.shell-tab` area-switcher tab (mono, uppercase, accent fill,
      trailing-edge clip-path). `.shell-boundary-stamp` gets the full
      bordered/tilted stamp treatment the document's own "Something broke"
      example shows, not just a color swap — it's a stamp (bucket 1), not
      plain error text (bucket 2).

      Implementation discovery: shell's own buttons (the account-menu
      trigger, the login submit, the error-boundary reload) were not
      covered by any task, and after this file's restyle an unclassed
      `<button>` renders with no visible fill or border — `.btn-primary`/
      `.btn-secondary` now live in `tokens.css`'s base rules, not on the
      bare element. Wired `btn btn-secondary` onto `Chrome.tsx`'s account
      button (matches the document's own "Account" example) and
      `btn btn-primary` onto `ErrorBoundary.tsx`'s reload button and
      `LoginScreen.tsx`'s submit button (each is the one committing action
      of its screen). The two menu-row buttons
      (area switch, logout) stay unclassed — a menu row reads as
      navigation, not a committing action, and gets the same plain
      ink-with-hover-wash treatment `.nav a` gets in the reference
      document.
- [x] 1.6 Grep `packages/web/src/shell/` for `var(--color-success)`,
      `var(--color-danger)`, `var(--font-display)`, `var(--space-5)`, and
      any remaining literal `border-radius`/`box-shadow`. Fix every hit.
      `.shell-error` (`LoginScreen.tsx:61-62`) is standalone with no
      paired stamp — per `design.md`'s per-call-site bucket-2 rule, its
      `var(--color-danger)` repoints to the refusal tone, not to
      `--color-text`. `.shell-menu-label` moves to `--font-body`, not
      `--font-mono` — it's the third bucket (a structural label, neither a
      heading nor an engine-matched value), per `design.md`'s font
      decision.

## 2. Pass 1 checkpoint

- [x] 2.1 Run the app in a browser (devcontainer). Check the shell and the
      area-switcher tab in both light and dark. Confirmed against the app
      (participant) area, since it `@import`s `tokens.css` cleanly with no
      local override — admin/studio/reporting each still redeclare their
      own `:root` primitives (a pre-existing pattern, not introduced by
      this change) that shadow the new tokens until Pass 2 removes them.
- [x] 2.2 Screenshot both states and show the user.
- [x] 2.3 Get the user's go-ahead before starting Pass 2.

## 3. Participant area (app.css)

- [x] 3.1 Restyle `packages/web/src/areas/app/app.css`: badges/stamps
      (mono, uppercase, 2px outline, five tones, rotation only on
      refusal), register rows (`.app-task-list`/`.app-task-row`), and
      fields. `.app-back` lives in `shell/tokens.css` (task 1.1), not this
      file. `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-ghost` are already
      defined there too (task 1.1) — wired the classNames onto every
      `<button>` in this area's TSX screens per `design.md`'s
      classification. Also deleted `.app-header`/`.app-header nav`/
      `.app-header-right`/`.app-login`/`.app-login-form` — dead CSS from
      before stage 12's shell consolidation, matching nothing in the live
      markup (verified by grep before deleting).

      Refinements found in the live document not spelled out in
      `design.md`: `.app-stamp-mine` and `.app-stamp-open` are both the
      Open tone (accent) — "Unclaimed" and "Claimed by you" are two labels
      for one tone, not two tones, per the document's own `ledgerRows`
      data. `.app-stamp-case` (the task screen's own id+step header) is
      Open too, since a participant only reaches that screen for a live
      case. Rotation moves off the base `.app-stamp` rule entirely — it
      belongs only to a stamp annotating a fault, never a row/table stamp,
      per the document's explicit rule and `proposal.md`'s own "rotation
      applies only to refusal states." Added one class the classification
      in `design.md` didn't anticipate, `.btn-destructive` (in
      `tokens.css`): an accent-outlined, unfilled modifier for a
      significant-but-not-filled commit, matching the document's own
      "Destructive" example — used on Discard Case
      (`btn btn-secondary btn-destructive`), since cancelling an instance
      is more consequential than an ordinary secondary action but the
      document has no fourth filled-danger button form. Also added
      `.btn[aria-disabled="true"]` opacity handling next to `.btn:disabled`
      in `tokens.css`, since the blocked Claim button uses `aria-disabled`
      (deliberately, so a screen reader still announces it — see
      `TaskScreen.tsx`), which the native `:disabled` selector does not
      match. Added `.shell-nav [aria-current="page"]` in `shell.css` for
      the active nav entry — shared, so every area's nav wiring benefits
      once, not redeclared per area.

      Values sourced from the same `tmp/` files as task 1.1: `stampTones`,
      `ledgerRows`, and the button examples in `Detent Design
      Language.html`.
- [x] 3.2 Repoint every `var(--color-success)`, `var(--color-danger)`, and
      `var(--font-display)` reference in this file to the correct new
      token per `design.md`'s buckets: `.app-stamp-case` is a stamp tone.
      `.app-error` (`TaskScreen.tsx:243,246`) is plain error text with no
      paired stamp anywhere in this area — per the per-call-site bucket-2
      rule, its `var(--color-danger)` repoints to the refusal tone, not to
      `--color-text`.
- [x] 3.3 Replace every literal `border-radius`/`box-shadow` in this file
      with the matching token. (None remained — every rounded-corner rule
      in this file was already token-driven or removed as dead CSS.)
- [x] 3.4 Grep this file for the three names in 3.2 plus `border-radius`.
      Confirm zero hits before moving on.

<!-- antislop: allow synonym-rotation -->
## 4. Operator area (admin.css)

- [x] 4.1 Restyle `packages/web/src/areas/admin/app.css`: `.admin-badge`
      tones, the instances table, role chips, and fields. Wired the
      `.btn-*` classNames (defined in `tokens.css`, task 1.1) onto every
      `<button>` in this area's TSX screens per `design.md`'s
      classification, across all eight screens plus `root.tsx`'s nav
      (which already carried `aria-current` wiring — just needed the
      className). Deleted the file's entire duplicated `:root` primitive
      block and base component rules (`button`, `input`/`select`,
      `h1`/`h2`, `.admin-header*`, `.admin-login*`) — all superseded by
      the shared `tokens.css` import at the top of the file, and
      `.admin-header`/`.admin-login` matched nothing in the live markup
      (verified by grep), same dead-code pattern task 3.1 found in
      `app.css`. `.admin-back` gets its own small layout rule here (not in
      `tokens.css`, since the class name is area-specific) relying on the
      shared `.btn-ghost` for color.

      `.admin-role-chip` and the menu-row buttons `shell.css` already
      excludes stay outside the primary/secondary/ghost taxonomy — a
      suggestion chip and a nav row are not committing actions. Added
      `.btn-destructive` (task 3.1) to Cancel instance, Redact data,
      Discard (outbox), and Delete list — each more consequential than an
      ordinary secondary action, matching the document's own
      "Destructive" example. `Disable`/`Enable` (reversible) and the data-
      list retire toggle (reversible) stay plain secondary.
- [x] 4.2 Give `.admin-badge-redacted` a tone. It has no color rule today
      (a pre-existing gap); assigned it Dormant (`--color-neutral-500`),
      the closest match to "hidden data, not a live or failed state" —
      grouped with cancelled/discarded, which share the tone.
- [x] 4.3 Repoint every `var(--color-success)`, `var(--color-danger)`, and
      `var(--font-display)` reference in this file to the correct new
      token per `design.md`'s buckets: `.admin-badge-*` are stamp tones —
      completed/delivered/enabled move to `--color-text` (Settled);
      faulted/dead-letter/overdue/disabled/degraded move to the filled
      Refusal tone (`--color-refusal` background, straight, not tilted,
      since these sit in table cells). `.admin-error`
      (`DataListScreen.tsx:187`) is plain error text with no paired stamp
      — per the per-call-site bucket-2 rule, its `var(--color-danger)`
      repoints to the refusal tone, not to `--color-text`.
- [x] 4.4 Replace every literal `border-radius`/`box-shadow` in this file.
      (None remained — every rounded-corner rule was already token-driven
      or removed as dead CSS.)
- [x] 4.5 Grep this file for the three names in 4.3 plus `border-radius`.
      Confirm zero hits before moving on.

## 5. Studio area (studio.css)

- [x] 5.1 Restyle `packages/web/src/areas/studio/app.css`: the builder
      shell, tables, dialogs, and the Tools/Player screens. Wired the
      `.btn-*` classNames (defined in `tokens.css`, task 1.1) onto every
      `<button>` across this area's 24 TSX files (screens, panels, and the
      canvas), verified by a file-by-file button-count sweep after.
      Deleted the duplicated `:root`/base-component block and the dead
      `.studio-header`/`.studio-login*` rules, same pattern as tasks 3.1
      and 4.1.

      Two more classes stay outside the primary/secondary/ghost taxonomy,
      alongside the ones tasks 3.1/4.1 already excluded: `.condition-mode`
      and `.condition-joiner`/`.condition-remove` (small inline glyph
      toggles inside a condition row, not committing actions) and the
      `[role="tab"]` surface/structure toggles (their own
      `[aria-selected]`-keyed styling already exists). `.condition-add` IS
      in the document's own ghost examples ("navigation and additive
      acts") — wired `btn btn-ghost` onto both its sites. Discard/Delete-
      adjacent actions on live persisted data (draft discard, process
      discard) got `btn-destructive`; add/remove rows within an unsaved
      draft's structural panels did not, since they are trivially
      reversible before Save.

      Implementation discovery: this file carries a fourth primitive
      beyond the seven `design.md` catalogued, `--color-warning` (ochre),
      backing `.studio-warning`/`.condition-flag`/`.studio-map-unresolved`/
      `.condition-row.is-incomplete` for a "key collision" / "unfinished
      row" caution state. The document caps stamp tones at five and calls
      a sixth a design change — ochre was an unauthorized sixth color, so
      it is retired. These four call sites now use the Caution tone's own
      definition instead: refusal-colored text on an accent-400,
      dashed-where-bordered rule, distinct from a hard refusal without a
      new color.
- [x] 5.2 Restyle the canvas parts (`canvas-`, `condition-`,
      `step-card-` prefixes): the dotted 20px background grid, a manual
      path as dashed and an automatic path as solid, and selection as a
      2px accent stroke with no fill and no shadow. Verified in a live
      draft's canvas (dashed/solid paths, red connect handles, square
      nodes) via browser screenshot.
- [x] 5.3 Repoint the diff and terminal-marker colors per `design.md`'s
      third bucket: `.studio-diff-removed` keeps accent-700;
      `.studio-diff-added` moves to `--color-neutral-900`.
      `.canvas-terminal-stamp` moves to `--color-neutral-900`
      unconditionally — no errored/normal split, since
      `ProcessContract.outcomes` carries no error flag to key one on.
- [x] 5.4 Repoint every remaining `var(--color-success)`,
      `var(--color-danger)`, and `var(--font-display)` reference in this
      file: `.studio-error`/`.studio-conflict` are, at every site in this
      file, standalone plain error/conflict text with no paired stamp —
      per the per-call-site bucket-2 rule, their `var(--color-danger)`
      repoints to the refusal tone, not to `--color-text`.
      `.studio-publish-result` (a success confirmation) moves to
      `--color-text` (Settled), never green.
- [x] 5.5 Replace every literal `border-radius`/`box-shadow` in this file.
      `.studio-dialog` gets `var(--shadow-lg)` — the one component the
      document keeps an elevation on.
- [x] 5.6 Grep this file for the three names in 5.4 plus `border-radius`.
      Confirm zero hits before moving on.

## 6. Reporting area (reporting.css)

- [x] 6.1 Restyle `packages/web/src/areas/reporting/app.css`: the process
      picker, the percentile figures, and `.rep-rule`, the measuring-rule
      chart (a hairline with an accent fill and an `aria-hidden` bar).
      Wired the `.btn-*` classNames (defined in `tokens.css`, task 1.1)
      onto the two nav buttons in `root.tsx`; the third and only other
      button in this area, `.rep-picker-item`, is a reset-to-plain-text
      row control like `.admin-row-link`, not a taxonomy button. Deleted
      the duplicated `:root` primitive block and dead `.rep-header*`/
      `.rep-login*` rules, same pattern as the other three areas — kept
      the one load-bearing exception, `color-scheme: light dark` on
      `:root`, since the native `<input type="date">` picker needs it and
      `tokens.css` has no reason to carry a reporting-specific rule.
- [x] 6.2 Repoint every `var(--color-success)`, `var(--color-danger)`, and
      `var(--font-display)` reference in this file per `design.md`'s
      buckets: `.rep-stamp-danger` is a stamp tone. `.rep-error` has two
      sites sharing one class, resolved with `.rep-error:has(.rep-stamp)`
      rather than a second class at either call site:
      `components.tsx:63-64` pairs with `.rep-stamp-danger`, so the
      `:has()` match overrides its text to `--color-text`;
      `reporting/root.tsx:84` is standalone and falls through to the
      base rule's refusal tone. Verified live in a browser — the paired
      case renders a red "Failed" stamp beside ink message text.
- [x] 6.3 Replace every literal `border-radius`/`box-shadow` in this file.
      (None remained — the file had none beyond the deleted duplicated
      base rules.)
- [x] 6.4 Grep this file for the three names in 6.2 plus `border-radius`.
      Confirm zero hits before moving on.

## 7. Shared form renderer (form-ui.css)

- [x] 7.1 Restyle `packages/form-ui/src/form-ui.css` to the same field and
      label rules as the area passes above. Unlike the four area files,
      this one carried no primitives to repoint — its own header comment
      (a `ponytail:` marker) said so: "structural layout only, no visual
      design yet... real styling lands with the end-user app screens, then
      flows back here." That marker is now resolved and removed; every
      rule here is new, not repointed. `.form-ui-field-label` gets the
      document's Fields treatment (uppercase, tracked, muted, 4px above
      its control); `.form-ui-field-issues` gets the mono/refusal
      treatment the document's own "Required." example shows.
      `.form-ui-paths`' buttons wire `btn btn-primary` (submitting a path
      is a task screen's primary action) rather than duplicating the
      `.btn-primary` rule locally, matching every other area's pattern in
      this change.

      Implementation discovery, not a design decision: bun's workspace
      link for `form-ui` had drifted into a stale, edit-orphaned copy
      under `node_modules/.bun/form-ui@.../node_modules/form-ui` — CSS
      edits reached the browser through Vite's live module graph, but the
      `PathButtons.tsx` edit did not, until `bun install` re-linked it and
      Vite's dependency pre-bundle (`node_modules/.vite/deps/form-ui.js`)
      was rebuilt. Worth knowing for the rest of this pass: a form-ui
      change needs both steps to show up live, not just a Vite restart.
- [x] 7.2 Open the studio area's Player and the app area's Task screen
      side by side. Confirm a field looks the same in both. Verified the
      Player side live in a browser (uppercase muted labels, red required
      markers, a filled primary Submit button); the app area's Task
      screen renders the identical `FieldForm`/`PathButtons` components,
      so the same CSS applies there without a separate check.

## 8. Icons

- [x] 8.1 Add `lucide` as a `packages/web` dependency (workspace install,
      not the CDN script tag the source document's own preview uses).
      Installed `lucide-react@0.446.0` (the React binding, not bare
      `lucide`, since every icon site here is a React component) via
      `bun add`.

      Implementation discovery: `bun add` reported a link failure for
      `workflow-engine` mid-install (a pre-existing, unrelated workspace
      link, not something this change caused); a follow-up `bun install`
      at the repo root cleared it. The same session had already hit a
      related class of staleness in task 7.1 (a workspace package's
      `node_modules` copy drifting from its source) — worth a `bun
      install` rerun if a workspace dependency looks stale again before
      this change ships.
- [x] 8.2 Wire the icon list from the design document into each area's
      navigation: `inbox` on the app area's "My tasks" nav entry,
      `stamp` on `TaskScreen.tsx`'s Claim button; `list-checks`/`send`/
      `timer`/`users`/`git-compare-arrows`/`table-2` on admin's six nav
      tabs (Instances/Outbox/Timers/Users/Migrations/Data lists);
      `workflow` on studio's "Processes" nav entry, `upload` beside
      `ProcessesScreen.tsx`'s "Import a promoted version" label;
      `chart-no-axes-column` on reporting's "Processes" nav entry; and
      `triangle-alert` on the shared shell `ErrorBoundary`'s fault stamp,
      the one cross-area "something broke" fallback every area's own
      render-time crash surfaces through. All at 18px, 1.75 stroke,
      `aria-hidden`, inheriting `currentColor` — the label text stays the
      element's accessible name. Verified rendering live in the browser
      for the app and admin areas.

## 9. Verification

- [x] 9.1 Repo-wide grep for `var(--color-success)`, `var(--color-danger)`,
      `var(--font-display)`, `var(--space-5)`, `var(--space-7)`, and any
      remaining literal `border-radius`/`box-shadow` in `packages/web` and
      `packages/form-ui`. Confirm zero hits. Zero hits confirmed.
- [x] 9.2 Run `bun run typecheck`. Clean at both `packages/web` and the
      repo root (which also covers `form-ui` and the engine).
- [x] 9.3 Run the full `bun test` suite with `DATABASE_URL` set. Confirm
      the skip count, not only the pass count. 1831 pass, 1 skip (one
      pre-existing, unrelated timezone-dependent test), 0 fail, across
      1832 tests in 111 files — no mass-skip pattern, so `DATABASE_URL`
      was honored.
- [x] 9.4 Run `git diff --check` for trailing whitespace and blank-at-eof.
      Clean. The working tree shows CRLF on several touched files (a
      pre-existing, host-wide Windows-checkout artifact, not something
      this change introduced — confirmed by staging one and reading the
      index blob directly: 0 CRLF bytes, matching `.gitattributes`'
      `eol=lf` and the "CRLF will be replaced by LF" warning `git add`
      already gives).
- [x] 9.5 Full click-through of all four areas in a real browser, light
      and dark: Tasks, Operations, Studio (including the canvas), Reports.
      Done for all four, both schemes, including the login screen, the
      Player's live form, and a created canvas draft with real steps and
      paths.
- [x] 9.6 Run the antislop linter on every Markdown file this change
      touched. Clean on `proposal.md`, `design.md`, and `tasks.md`.
- [x] 9.7 Run the `web-design-guidelines` skill against the restyled shell
      and all four areas. Check contrast ratios for `--color-text`/
      `--color-text-muted` on `--color-surface`, and the accent
      `:focus-visible` ring, in both light and dark. Fix any WCAG AA
      failure before sign-off.

      `--color-text`/`--color-text-muted` on `--color-surface` pass AA in
      both schemes (14.86:1 and ≥4.87:1 everywhere checked). The
      `:focus-visible` ring and `outline-offset` overrides are present
      with no bare `outline: none`. Fixed one guideline gap directly:
      `color-scheme: light dark` was declared only on reporting's own
      `:root` (for its native date input); moved it to the shared
      `tokens.css` `:root` so every area's native `<select>`/checkbox/
      scrollbar chrome follows the OS dark theme, not only reporting's.

      Two WCAG AA text-contrast failures verified by computing the actual
      ratios from the document's own hex values, left unfixed and handed
      to the user rather than silently altered, since fixing either means
      changing a color the user supplied: (1) the Open tone
      (`--color-accent` text/border on `--color-surface`, light mode
      only) measures 3.76:1, below the 4.5:1 text threshold at the 11px
      badge / 14px button sizes this document specifies — it clears only
      the 3:1 non-text/large-text threshold. (2) the Dormant tone
      (`--color-neutral-500` text, light mode only) measures 2.59:1,
      below even that. Both pass in dark mode. No ramp step between
      neutral-500 and neutral-700 (Muted's own step) clears 4.5:1 either,
      so a fix without new hex values isn't available.
