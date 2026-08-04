## 1. Token foundation (Pass 1)

- [ ] 1.1 Rewrite `packages/web/src/shell/tokens.css` primitives and
      semantic aliases per `design.md`: new color roles (ground, surface,
      ink, muted, divider, hairline, accent, refusal), the accent and
      neutral 9-step ramps, the accent-2 ramp, Archivo for
      `--font-heading`/`--font-body`, a renamed `--font-mono` for the
      monospace stack, the 6-step px `--space-1..8` scale, and
      `--radius-sm/md/lg` at `0`.
- [ ] 1.2 Add `--shadow-sm/md/lg` (ink-tinted `color-mix` shadows) to
      `tokens.css`.
- [ ] 1.3 Add dark-mode overrides for every new or changed primitive in
      the `@media (prefers-color-scheme: dark)` block.
- [ ] 1.4 Drop `--color-success` and `--color-danger`; confirm nothing in
      `tokens.css` or `shell.css` itself still references them.
- [ ] 1.5 Restyle `packages/web/src/shell/shell.css`, including the
      `.shell-tab` area-switcher tab (mono, uppercase, accent fill,
      trailing-edge clip-path).
- [ ] 1.6 Grep `packages/web/src/shell/` for `var(--color-success)`,
      `var(--color-danger)`, `var(--font-display)`, `var(--space-5)`, and
      any remaining literal `border-radius`/`box-shadow`. Fix every hit.

## 2. Pass 1 checkpoint

- [ ] 2.1 Run the app in a browser (devcontainer). Check the shell and the
      area-switcher tab in both light and dark.
- [ ] 2.2 Screenshot both states and show the user.
- [ ] 2.3 Get the user's go-ahead before starting Pass 2.

## 3. Participant area (app.css)

- [ ] 3.1 Restyle `packages/web/src/areas/app/app.css`: badges/stamps
      (mono, uppercase, 2px outline, five tones, rotation only on
      refusal), `.btn-primary`/`secondary`/`ghost` (including
      `.app-back`), register rows (`.app-task-list`/`.app-task-row`), and
      fields.
- [ ] 3.2 Repoint every `var(--color-success)`, `var(--color-danger)`, and
      `var(--font-display)` reference in this file to the correct new
      token per `design.md`'s three buckets: `.app-stamp-case` is a stamp
      tone, but `.app-error` is plain error text and moves to
      `--color-text`, not to the refusal tone.
- [ ] 3.3 Replace every literal `border-radius`/`box-shadow` in this file
      with the matching token.
- [ ] 3.4 Grep this file for the three names in 3.2 plus `border-radius`.
      Confirm zero hits before moving on.

<!-- antislop: allow synonym-rotation -->
## 4. Operator area (admin.css)

- [ ] 4.1 Restyle `packages/web/src/areas/admin/app.css`: `.admin-badge`
      tones, buttons, the instances table, role chips, and fields.
- [ ] 4.2 Give `.admin-badge-redacted` a tone. It has no color rule today
      (a pre-existing gap); assign it Dormant (neutral-500), the closest
      match to "hidden data, not a live or failed state."
- [ ] 4.3 Repoint every `var(--color-success)`, `var(--color-danger)`, and
      `var(--font-display)` reference in this file per `design.md`'s three
      buckets: `.admin-badge-*` are stamp tones, but `.admin-error` is
      plain error text and moves to `--color-text`.
- [ ] 4.4 Replace every literal `border-radius`/`box-shadow` in this file.
- [ ] 4.5 Grep this file for the three names in 4.3 plus `border-radius`.
      Confirm zero hits before moving on.

## 5. Studio area (studio.css)

- [ ] 5.1 Restyle `packages/web/src/areas/studio/app.css`: the builder
      shell, tables, dialogs, and the Tools/Player screens.
- [ ] 5.2 Restyle the canvas parts (`canvas-`, `condition-`,
      `step-card-` prefixes): the dotted 20px background grid, a manual
      path as dashed and an automatic path as solid, and selection as a
      2px accent stroke with no fill and no shadow.
- [ ] 5.3 Repoint the diff and terminal-marker colors per `design.md`'s
      third bucket: `.studio-diff-removed` and an errored
      `.canvas-terminal-stamp` keep accent-700; `.studio-diff-added` and a
      normal `.canvas-terminal-stamp` move to `--color-neutral-900`.
- [ ] 5.4 Repoint every remaining `var(--color-success)`,
      `var(--color-danger)`, and `var(--font-display)` reference in this
      file: `.studio-error`/`.studio-conflict` are plain error text and
      move to `--color-text`, not to a stamp tone.
- [ ] 5.5 Replace every literal `border-radius`/`box-shadow` in this file.
- [ ] 5.6 Grep this file for the three names in 5.4 plus `border-radius`.
      Confirm zero hits before moving on.

## 6. Reporting area (reporting.css)

- [ ] 6.1 Restyle `packages/web/src/areas/reporting/app.css`: the process
      picker, the percentile figures, and `.rep-rule`, the measuring-rule
      chart (a hairline with an accent fill and an `aria-hidden` bar).
- [ ] 6.2 Repoint every `var(--color-success)`, `var(--color-danger)`, and
      `var(--font-display)` reference in this file per `design.md`'s three
      buckets: `.rep-stamp-danger` is a stamp tone, but `.rep-error` is
      plain error text and moves to `--color-text`.
- [ ] 6.3 Replace every literal `border-radius`/`box-shadow` in this file.
- [ ] 6.4 Grep this file for the three names in 6.2 plus `border-radius`.
      Confirm zero hits before moving on.

## 7. Shared form renderer (form-ui.css)

- [ ] 7.1 Restyle `packages/form-ui/src/form-ui.css` to the same field and
      label rules as the area passes above.
- [ ] 7.2 Open the studio area's Player and the app area's Task screen
      side by side. Confirm a field looks the same in both.

## 8. Icons

- [ ] 8.1 Add `lucide` as a `packages/web` dependency (workspace install,
      not the CDN script tag the source document's own preview uses).
- [ ] 8.2 Wire the icon list from the design document into each area's
      navigation: `inbox`/`stamp` (Tasks), `list-checks`/`send`/`timer`/
      `users`/`git-compare-arrows`/`table-2` (Operations), `workflow`/
      `upload` (Studio), `chart-no-axes-column` (Reports), and
      `triangle-alert` for a fault.

## 9. Verification

- [ ] 9.1 Repo-wide grep for `var(--color-success)`, `var(--color-danger)`,
      `var(--font-display)`, `var(--space-5)`, `var(--space-7)`, and any
      remaining literal `border-radius`/`box-shadow` in `packages/web` and
      `packages/form-ui`. Confirm zero hits.
- [ ] 9.2 Run `bun run typecheck`.
- [ ] 9.3 Run the full `bun test` suite with `DATABASE_URL` set. Confirm
      the skip count, not only the pass count.
- [ ] 9.4 Run `git diff --check` for trailing whitespace and blank-at-eof.
- [ ] 9.5 Full click-through of all four areas in a real browser, light
      and dark: Tasks, Operations, Studio (including the canvas), Reports.
- [ ] 9.6 Run the antislop linter on every Markdown file this change
      touched.
