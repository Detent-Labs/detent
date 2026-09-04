## 1. Pre-flight and the stub fix

- [x] 1.1 Grep every source file under `packages/` for `className=.*\bbtn\b`
  and `className=.*app-back`. Record the file list. Verify: the count and
  the file set are close to this design's own audit (208 sites, 55 files
  for `.btn`; 1 site for `.app-back`). Other work may land between this
  design and this task, so a small drift is normal.

  A large drift is different: one that changes whether studio still holds
  most of the files. That means the audit is stale. Stop, and re-derive
  the real count before continuing.
- [x] 1.2 Add a `when` export to `test/preload-stylex.ts` (design.md D6).
  Each of `ancestor`, `descendant`, `siblingBefore`, `siblingAfter` and
  `anySibling` returns a plain string and never throws, mirroring
  `defaultMarker`'s identity-no-op shape. Verify: `bun run typecheck`
  passes on the preload file, and importing `@stylexjs/stylex`'s `when`
  export under `bun test` does not throw.

## 2. `shell.css` and its six consumer files

- [x] 2.1 Add a `stylex.create` block to `Chrome.tsx` covering the account
  group and the account menu (every menu row included), reading
  `form-ui/tokens.stylex`. Leave the outer `className="shell"` wrapper
  `<div>` untouched: `.shell` and `.shell > *` stay literal (design.md
  D10). The account button also needs no change: `.shell-account-button`
  has no rule of its own (design.md D7). Verify: `bun run typecheck`
  passes with no reference to an undeclared token.
- [x] 2.2 Give `.shell-menu:popover-open`'s rule a StyleX conditional
  value. Key it on the literal `:popover-open` pseudo-class, on the
  property that toggles the menu's `display` (design.md D2). Verify:
  `bun run build` succeeds, and the emitted CSS carries a real
  `:popover-open` selector, not a literal string and not a dropped rule.

  If it is either, stop. Apply design.md D2's literal-residual-rule
  fallback instead. Report back before any later task in this group
  assumes the conditional value works.
- [x] 2.3 Apply the new styles at each JSX call site in `Chrome.tsx`. The
  account button's own `className="btn btn-secondary shell-account-button"`
  stays untouched (design.md D7). Verify:
  `git grep -c 'className="shell-account\|className="shell-menu' packages/web/src/shell/Chrome.tsx`
  returns 0 for every class this task migrates. The literal `.btn`-family
  substrings legitimately remain.
- [x] 2.4 Add a `stylex.create` block to `LoginScreen.tsx` for
  `.shell-screen`, `.shell-login-form` (plus its `label` rule) and
  `.shell-error`, and apply it at each call site. Verify: `bun run
  typecheck` passes, and `git grep -c 'className="shell-screen\|
  className="shell-login-form\|className="shell-error"'
  packages/web/src/shell/LoginScreen.tsx` returns 0.
- [x] 2.5 Add a `stylex.create` block to `ErrorBanner.tsx` for
  `.shell-error-banner`, `.shell-error-banner-stamp` and
  `.shell-error-banner-message`. Apply it at each call site. Verify:
  `bun run typecheck` passes, and `git grep -c 'className="shell-error-banner'
  packages/web/src/shell/ErrorBanner.tsx` returns 0.
- [x] 2.6 Add a `stylex.create` block to `ErrorBoundary.tsx` for
  `.shell-empty`, `.shell-boundary-fallback` and `.shell-boundary-stamp`.
  Apply it at each call site.

  `App.tsx` also renders `.shell-empty` twice. Give it the same style,
  applied locally. The two files share no component. Verify: `bun run
  typecheck` passes. Grep both files for the migrated literal classes;
  each returns 0.
- [x] 2.7 Add a `stylex.create` block to `ProfilePage.tsx` for every
  `.shell-profile-*` rule. Reuse `.shell-screen` from task 2.4's shape,
  declared locally here too, per `web-styling`'s per-area duplication
  precedent. Apply it at each call site. Verify: `bun run typecheck`
  passes, and `git grep -c 'className="shell-profile\|className="shell-screen'
  packages/web/src/shell/ProfilePage.tsx` returns 0.
- [x] 2.8 Give `.shell-nav` a `stylex.create` block, plus its
  `[aria-current="page"]` and sub-30rem rules. Declare it once. Import it
  in all four area root components: `admin/root.tsx`, `app/root.tsx`,
  `reporting/root.tsx` and `studio/root.tsx` (design.md D9). Verify: `bun
  run typecheck` passes, and `git grep -rc
  'className="shell-nav' packages/web/src/areas/*/root.tsx` returns 0
  for all four files.
- [x] 2.9 Delete every migrated rule from `shell.css`, leaving only
  `.shell` and `.shell > *` (design.md D10). Verify: `bun run build`
  succeeds, and `git grep -c '^\.' packages/web/src/shell/shell.css`
  shows exactly 2 rule blocks remaining.

## 3. `areas/app/app.css`

- [x] 3.1 Add `stylex.create` blocks to every component under
  `packages/web/src/areas/app/` that carries a `className` referencing
  `app.css`, reading `form-ui/tokens.stylex`. Verify: `bun run typecheck`
  passes.
- [x] 3.2 Give `.app-task-link:hover .app-task-step` a `stylex.when.ancestor`
  treatment (design.md D4), across all three files that render it:
  `InvolvedScreen.tsx`, `StartedScreen.tsx` and `TasksScreen.tsx`. The
  link marks itself with `stylex.defaultMarker()`. The step's style keys
  one property on `stylex.when.ancestor(':hover')`. Verify: `bun run
  build` succeeds, and the emitted CSS carries a rule that reaches the
  child on the ancestor's hover. Then check a real hover in a browser via
  `playwright-cli`, on each of the three screens.

  Either check may fail. If so, apply design.md D4's literal-residual-rule
  fallback instead. Report back before any later task in this group
  assumes the mechanism works.
- [x] 3.3 Replace `app-stamp-${statusTone(status)}` and the claimed/open
  ternary (`InvolvedScreen.tsx`, `StartedScreen.tsx`, `TasksScreen.tsx`)
  with a typed lookup instead. Key it on the known status values. Fall
  back to a named neutral style (design.md D3, `web-styling`'s
  typed-lookup requirement). Verify: `bun run typecheck` passes on the
  lookup's key type.
- [x] 3.4 Delete every `className="app-*"` string this group's components
  no longer need. Verify:
  `git grep -c 'className="app-stamp\|className="app-task' packages/web/src/areas/app/`
  returns 0.
- [x] 3.5 Delete the migrated rules from `app.css`. Leave only its
  reduced-motion media query, the universal-selector reset design.md
  D11 defers. Verify: `bun run build` succeeds.

  Then grep the file for `^\.`; it shows zero rule blocks outside that
  one media query.

## 4. `areas/admin/app.css`

- [x] 4.1 Add `stylex.create` blocks to every component under
  `packages/web/src/areas/admin/` that carries a `className` referencing
  `app.css`, reading `form-ui/tokens.stylex`. This is the largest group:
  198 call sites across 11 screen files.

  `.admin-field` and `.admin-role-input` each have two separate
  declarations, at two different lines. Combine each selector's own two
  sets of properties into one style (design.md D12). Verify: `bun run
  typecheck` passes. The built CSS carries every property every source
  rule declared, for both selectors.
- [x] 4.2 Replace every `admin-badge-${status}` construction
  (`OutboxScreen.tsx`, `InstanceScreen.tsx`, `InstancesScreen.tsx`,
  `DataListScreen.tsx`, `UsersScreen.tsx`) with a typed lookup instead.
  Key each on its own screen's known status values, and fall back to a
  named neutral style (design.md D3). Verify: `bun run typecheck` passes
  on every lookup's key type.
- [x] 4.3 Apply every other admin-area style (tables, rows, chips, dark
  mode) at its JSX call site. The `prefers-reduced-motion` block stays
  literal (design.md D11); it has no call site to apply. Verify: `bun
  run typecheck` passes.
- [x] 4.4 Grep the whole `packages/web/src/areas/admin/` directory for
  every literal class prefix this group migrated (`admin-badge-`,
  `admin-table`, `admin-row`, and the rest task 4.1-4.3 named). Verify:
  zero matches. This is the exit signal for this group, not a green build
  alone. No test in this area asserts on a class name. A stale literal
  here has no other safety net (design.md's Risks).
- [x] 4.5 Delete the migrated rules from `app.css`. Leave only its
  reduced-motion media query, the universal-selector reset design.md
  D11 defers. Verify: `bun run build` succeeds.

  Then grep the file for `^\.`; it shows zero rule blocks outside that
  one media query.

## 5. `areas/reporting/app.css`

- [x] 5.1 Add `stylex.create` blocks to every component under
  `packages/web/src/areas/reporting/` that carries a `className`
  referencing `app.css`, reading `form-ui/tokens.stylex`.

  `.rep-empty` and `.rep-table th[scope="row"]` each have two separate
  declarations, at two different lines. Combine each selector's own two
  sets of properties into one style (design.md D12). Verify: `bun run
  typecheck` passes. The built CSS carries every property every source
  rule declared, for both selectors.
- [x] 5.2 Migrate `DurationRule`'s `.rep-rule`/`.rep-rule-fill`/
  `.rep-rule-fill-danger` classes to StyleX. Leave the numeric
  `style={{ width }}` exactly as it renders today (design.md D5). Verify:
  `git grep -n 'style={{ width' packages/web/src/areas/reporting/components.tsx`
  still finds the inline style, unchanged.
- [x] 5.3 Replace `` `rep-cell rep-cell-${display.kind}` `` and the
  `rep-cell-collision` suffix (`ReportTable.tsx`) with a typed lookup
  instead. Key it on the view's known kind values, and fall back to a
  named neutral style (design.md D3). Verify: `bun run typecheck` passes
  on the lookup's key type.
- [x] 5.4 Three call sites use `.rep-error`/`.rep-error:has(.rep-stamp)`
  today: `components.tsx`'s `ErrorNote`, `root.tsx`'s validation message,
  and `ReportTable.tsx`'s truncated-results banner. This group's own
  work found the third. It pairs a stamp too, so it takes `ErrorNote`'s
  ink tone.

  Replace each with one of two named styles, chosen in code by whether
  that call site pairs a stamp. This is the same two-way choice phase
  1's D2 already established. It needs no `:has()` equivalent: each
  call site already knows whether it renders a stamp.
  Verify: `bun run typecheck` passes.
- [x] 5.5 Delete every `className="rep-*"` string this group's
  components no longer need. Verify:
  `git grep -c 'className="rep-rule\|className="rep-cell\|className="rep-error'
  packages/web/src/areas/reporting/` returns 0.
- [x] 5.6 Delete the migrated rules from `app.css`. Leave only its
  reduced-motion media query, the universal-selector reset design.md
  D11 defers. Verify: `bun run build` succeeds.

  Then grep the file for `^\.`; it shows zero rule blocks outside that
  one media query.

## 6. Cleanup

- [x] 6.1 Verify each area's own cleanup task (2.9, 3.5, 4.5, 5.6)
  already confirmed its file's rule count. This task re-runs the same
  grep once more. It covers all four stylesheets together, one final
  aggregate check. shell.css shows 2 (D10). Each area's own file shows 1
  (D11).
- [x] 6.2 Verify: `tokens.css`'s `.btn`/`.btn-primary`/`.btn-destructive`/
  `.btn-secondary`/`.btn-ghost`/`.app-back` rules are byte-identical to
  `main`. This change does not touch them (design.md D1).

## 7. Docs and roadmap

- [x] 7.1 Add a probe per area to `docs/browser-checks.md`'s StyleX
  section. Each probe opens a migrated screen and reads computed styles.
  Each confirms a match against the deleted stylesheet's declarations.
  Name the outbox badge, the duration bar, and an admin table row's
  status badge. Name an app task's stamp too, per design.md's Goals.
- [x] 7.2 Change `docs/decisions.md`'s StyleX entry and `ROADMAP.md`
  stage 45. Mark phase 2 done. Resolve the still-open "does phase 2
  split into two changes" question `docs/decisions.md` carries, per
  design.md D8: it does not. Name phases 3 through 5 as what remains.
  Verify: neither restates phase 0's or phase 1's own entry.

  `ROADMAP.md` and `docs/decisions.md` carry no live `.btn`-scope or
  `:popover-open`-phasing note to correct. Both notes design.md D1 and D2
  reference exist only in phase 0's archived design.md. This task adds no
  correction for either, and that is not an oversight.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`. Verify: exit 0 for the engine and both
  packages.
- [x] 8.2 Run `bun run build`. Verify: exit 0, and the closeBundle
  assertion still passes.
- [x] 8.3 Run the full `bun test` with `DATABASE_URL` set, through
  `scripts/gates/silent-green.sh`. Verify: zero failures, skip count at
  the floor, gate exit 0.

  A first run failed one canary:
  `reporting-boundaries.test.ts`'s "the shared step-form renderer is
  absent from this area's imports" forbade any `form-ui/*` import. Every
  reporting file's new `form-ui/tokens.stylex` import tripped it. The
  canary's actual target is the step-form renderer, `form-ui`'s bare
  export, not the shared token module every area now reads. Narrowed the
  filter to exempt `form-ui/tokens.stylex` by name, and re-ran clean.
- [ ] 8.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
  and the same for `whitespace.sh`, over this change's own commit(s).
  Verify: both exit 0.
- [ ] 8.5 Build the production bundle and serve it from `WEB_ROOT`, not
  `bun run dev` (Studio's dev-mode crash is pre-existing and unrelated).
  Run each area's probe from task 7.1 in a real browser via
  `playwright-cli`, with seeded data. Cover the shell's account menu and
  the app area's My-tasks screen. Cover the admin area's outbox screen and
  the reporting area's duration bar too.

  Verify: every probe passes, and no console error appears on any screen.
  Confirm the account menu's `:popover-open` state (task 2.2) renders
  correctly. Confirm the app area's ancestor-hover state (task 3.2) does
  too, whichever mechanism each ended up using.
