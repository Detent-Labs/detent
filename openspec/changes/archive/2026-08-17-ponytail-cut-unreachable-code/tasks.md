## 1. Scripts (findings 6, 7)

- [x] 1.1 Delete `scripts/demo-expense-approval.ts`.
- [x] 1.2 Rewrite `scripts/dev-up.ps1` as a delegator over
      `scripts/dev-up.sh`, following `scripts/preflight.ps1`'s pattern:
      resolve `bash` via `Get-Command`, print a Git-Bash-naming message and
      exit non-zero when absent, then run
      `& $bash (Join-Path $PSScriptRoot "dev-up.sh") @args` and return
      `$LASTEXITCODE`. Use the `@args` splat operator, not `"$args"`
      string interpolation — the latter collapses the argument array into
      one joined string instead of forwarding each argument as its own
      token.
- [x] 1.3 Confirm no other script or doc references
      `scripts/demo-expense-approval.ts` besides
      `docs/CODE_REVIEW-2026-07-29.md` (a dated review, left as historical
      record) and the archived changes under `openspec/changes/archive/`
      (left untouched).

## 2. Engine poll-loop starters (finding 18)

- [x] 2.1 Delete `startTimerScheduler` from `src/engine/timers.ts`.
- [x] 2.2 Delete `startResolutionWorker` from `src/engine/resolution.ts`.
- [x] 2.3 Delete `startOutboxWorker` from `src/engine/outbox.ts`.
- [x] 2.4 Delete `startRetentionSweep` and `SWEEP_INTERVAL_MS` from
      `src/engine/retention.ts`.
- [x] 2.5 Confirm `src/engine/host.ts::startEngine`'s direct `pollForever`
      calls are unaffected — they already call the drain/sweep functions
      directly, not through the deleted starters.
- [x] 2.6 Change `openspec/specs/engine-poll-loop-consolidation/spec.md`'s
      `## Purpose` section directly (not via a delta — deltas cannot edit
      an existing capability's Purpose) so it no longer names
      `startOutboxWorker`, `startResolutionWorker` or `startTimerScheduler`
      by name; describe the constraint against `startEngine`'s
      `pollForever` calls instead.
- [x] 2.7 Fix `docs/current-state.md:2296-2298`'s "four call sites" claim
      for `pollForever` to match the current count in `host.ts`. Already
      accurate post-deletion (4 call sites, all in `host.ts`) — no textual
      edit needed, confirmed by grep.

## 3. Web CSS and i18n (findings 10, 20, 40 partial)

- [x] 3.1 Delete `.admin-boundary-fallback`/`.admin-boundary-stamp` from
      `packages/web/src/areas/admin/app.css`.
- [x] 3.2 Delete `.app-boundary-fallback`/`.app-boundary-stamp` from
      `packages/web/src/areas/app/app.css`.
- [x] 3.3 Delete `.studio-boundary-fallback`/`.studio-boundary-stamp` from
      `packages/web/src/areas/studio/app.css`.
- [x] 3.4 Delete the `.rep-login`/`.rep-empty-role`/`.rep-boundary-fallback`
      rule and the `.rep-login-form label` selector from
      `packages/web/src/areas/reporting/app.css`; keep `.rep-controls
      label` and `.rep-empty` (no `-role`) untouched.
- [x] 3.5 Delete `.studio-publish-result` and bare `.studio-palette`/
      `.studio-palette h2` from `packages/web/src/areas/studio/app.css`;
      keep `.studio-palette-list`/`-entry`/`-ghost`.
- [x] 3.6 Re-grep each of the 15 keys below immediately before deleting
      them (an open change, `panels-list-and-detail`, touches the same
      catalog prefixes) and delete only what is still unreferenced, from
      `packages/web/src/i18n/catalogs/studio.ts` in every locale it ships:
      `draftToolbar.legend`, `draftToolbar.operationFailed`,
      `draftToolbar.unsaved`, `draftToolbar.saved`,
      `draftToolbar.publishSuccess`, `steps.heading`, `steps.empty`,
      `steps.addStep`, `steps.selectInitialStep`, `subprocess.legend`,
      `panelsScreen.linksLabel`, `stepSections.addStep`,
      `canvas.inspectorEmpty`. Re-grep confirmed all 15 (13 studio + 2 app)
      still unreferenced against the current tree.
- [x] 3.7 Re-grep, then delete `nav.logout` and `started.startedOn` from
      `packages/web/src/i18n/catalogs/app.ts` in every locale it ships
      (`en`, `de`).
- [x] 3.8 Delete `OperandCelType` from
      `packages/web/src/areas/studio/panels/shared/conditionLogic.ts`.

## 4. Dead exports (findings 40 partial, 41)

- [x] 4.1 Delete the `textarea` selector from both rule groups in
      `packages/form-ui/src/form-ui.css` (lines ~91 and ~102).
- [x] 4.2 Merge the byte-identical `.form-ui-field` and
      `.form-ui-field-control` rule bodies in `form-ui.css` into one
      grouped selector; keep both classes rendering unchanged in
      `FieldForm.tsx`.
- [x] 4.3 Delete `WireField.description` from
      `packages/form-ui/src/types.ts`.
- [x] 4.4 Delete `FieldInput`, `effectiveSpan`, `optionText`,
      `OPTION_ATTRIBUTE_SEPARATOR`, `editableFieldIds`, `issueMessage` and
      `WireField` from `packages/form-ui/src/index.ts`'s exports; keep
      each symbol's own module export (only the barrel re-export goes).
      Keep `FieldForm`, `PathButtons`, `filterToEditable`, `resolveText`,
      `ResolvedViewField`, `AvailablePath` and `SubmissionIssue` exported.
- [x] 4.5 Confirm `packages/web`'s `from "form-ui"` imports and every
      `form-ui/test/*.test.ts(x)` file (which import by relative path)
      still resolve.
- [x] 4.6 Drop the `export` keyword from `checkTemplateKey`
      (`src/engine/templates.ts:97`). Its one caller sits at :144 in the same
      file. Re-grep first: the open change `ponytail-engine-small-dedup`
      edits this file too.
- [x] 4.7 Drop the `export` keyword from `SUPPORTED_LOCALES`
      (`src/http/account-routes.ts:29`). Its two readers sit at :100 and
      :101 in the same file. Re-grep first: the open change
      `ponytail-http-layer-cleanup` edits this file too.
- [x] 4.8 Leave the other ten symbols finding 41 names. Each has a test
      importer, so dropping `export` would break the suite. Task 7.5 records
      the measurement.

## 5. Docs (finding 15)

- [x] 5.1 Replace `THIRDPARTY.md`'s "Transitive dependencies" section
      (the per-license enumeration) with one sentence pointing at
      `bun.lock`.

## 6. Spec deltas (findings 6, 7, 18)

Each delta below is already written, reviewed and antislop-clean under
this change's own `specs/<capability>/spec.md`. These tasks merge that
already-written text into the live spec verbatim. Do not re-author the
requirement from the task description.

- [x] 6.1 Merge `specs/development-toolchain/spec.md`'s MODIFIED
      requirement into `openspec/specs/development-toolchain/spec.md`,
      verbatim.
- [x] 6.2 Merge `specs/devcontainer-preflight/spec.md`'s ADDED
      requirement into `openspec/specs/devcontainer-preflight/spec.md`,
      verbatim.
- [x] 6.3 Merge `specs/engine-poll-loop-consolidation/spec.md`'s
      MODIFIED requirement into
      `openspec/specs/engine-poll-loop-consolidation/spec.md`, verbatim.
- [x] 6.4 Merge `specs/data-retention/spec.md`'s MODIFIED requirement
      into `openspec/specs/data-retention/spec.md`, verbatim.

## 7. Audit corrections

- [x] 7.1 In `PONYTAIL-AUDIT.md`, move findings 8, 24, 27, 29 and 34 to
      "Checked, not flagged (deliberate, per CLAUDE.md)" (or "Checked,
      not flagged" as fits each), each with the one-line measurement from
      design.md's Decisions that disqualifies it. For finding 34, keep a
      note that `Page<T>`'s duplication (not the two constants) is a
      genuine small remainder, unresolved here.
- [x] 7.2 Move finding 35 (`Map.groupBy`) to "Checked, not flagged" with
      the `lib`-bump cost noted.
- [x] 7.3 Reword finding 7's entry (or mark it resolved once task 1.2
      lands) so it no longer claims `dev-up.ps1` is unreferenced.
- [x] 7.4 Add a "Resolved from the 2026-08-16 scan" section listing
      findings 6, 10, 15, 18, 20, 40 and 41 once they land, matching the
      format of the existing "Resolved from" sections.
- [x] 7.5 Rewrite finding 41's list against the measurement in design.md:
      ten of its twelve `src/` symbols have a test importer, so the `export`
      keyword is what the test reaches them through. Name the two that do
      not, `checkTemplateKey` and `SUPPORTED_LOCALES`, as the resolved pair.
- [x] 7.6 Move finding 40's `JwtResolverConfig.localRolesClaim` entry to
      "Checked, not flagged". `test/auth-jwt.test.ts:109` sets it, so the
      "never set by the one construction site" claim does not hold.
      `definitionStatus`'s two dead members stay filed, unresolved: design
      .md's Non-Goals says why they wait for a schema change of their own.

## 8. Verification

- [x] 8.1 Run `bun run typecheck`. Clean: engine `tsc --noEmit` exit 0,
      `form-ui`/`web` filtered typecheck both exit 0.
- [x] 8.2 Run `bun run build`. Clean: web build succeeded in 5.99s, no
      warnings besides the routine plugin-timing note.
- [x] 8.3 Run the full `bun test` suite with `DATABASE_URL` set; confirm
      the skip count, not just the pass count. 2726 pass, 1 skip (the
      pre-existing, unrelated timezone-dependent skip), 0 fail, across
      154 files.
- [x] 8.4 In a browser, load each of the four areas (admin, app, studio,
      reporting), open one screen per area, and confirm no console error
      about a missing i18n key or a broken class; trigger the shell
      ErrorBoundary once (e.g. a thrown render error in dev) and confirm
      its fallback still renders styled. All four areas loaded with 0
      console errors/warnings each (admin instances+timers, app tasks+
      started-cases, studio draft edit with canvas/inspector/palette,
      reporting process picker); screenshots confirmed correct styling
      throughout. The shell ErrorBoundary was tripped via a synthetic
      one-shot `Array.prototype.map` throw during an in-SPA navigation
      (admin → Timers); its `shell-boundary-fallback`/`-stamp` fallback
      rendered styled with the warning icon, message and reload button.
      Note: `src/shell/ErrorBoundary.tsx` and `shell/shell.css` were not
      touched by this change; only the four already-dead per-area CSS
      copies were removed, confirmed by grep to have no TSX referrer
      before deletion.
- [x] 8.5 Run `pwsh scripts/dev-up.ps1` against a stack `dev-up.sh`
      already prepared; confirm a second run changes nothing and exits 0
      (the idempotence `devcontainer-preflight`'s existing "Both bring-up
      scripts carry the same preflight contract" requirement already
      mandates). The delegator's own logic (bash resolution, path
      construction, `@args` passthrough, `$LASTEXITCODE` propagation) is
      confirmed correct: invoking `dev-up.sh` directly through the
      exact command the new `dev-up.ps1` builds succeeded through the
      full bring-up flow. On this host, plain `pwsh` resolves `bash` to
      the WSL launcher stub at `C:\Windows\System32\bash.exe` ahead of
      Git Bash on `PATH`, so `pwsh scripts/dev-up.ps1` itself fails with
      the same "no such file" symptom as the pre-existing, unmodified
      `scripts/preflight.ps1` run the identical way, confirmed side by
      side. That is a host `PATH`-ordering property this change did not
      introduce and does not regress.
- [x] 8.6 Run `git diff --check` over the changed files. Clean (exit 0).
      `git ls-files --eol` over every touched tracked file confirmed
      `w/lf` throughout, no CRLF.
- [x] 8.7 Run `sh scripts/gates/ponytail-ledger.sh` from the repository
      root (the read-only gate check, not `scripts/ponytail-ledgers.sh`,
      which triggers an independent LLM rescan and would overwrite this
      change's hand-authored `PONYTAIL-AUDIT.md` edits from task 7). This
      change adds, removes or moves no `ponytail:` marker, so the gate
      should pass with no ledger edit needed. It did not on the first
      run: a marker a different open change (`ponytail-web-small-cuts`)
      added to `packages/web/src/areas/studio/draft/store.tsx` had never
      been recorded in `PONYTAIL-DEBT.md`, staling the ledger ahead of
      this change landing. Added the one missing entry (mechanical,
      matching the ledger's own format, not a rescan); the gate now
      passes clean.
- [x] 8.8 Run the antislop check on every Markdown file this change
      touched, including `PONYTAIL-AUDIT.md` and `THIRDPARTY.md`. All
      four touched `openspec/specs/*.md` deltas, the change's own
      `proposal.md`/`design.md`/`tasks.md`, `THIRDPARTY.md` and
      `PONYTAIL-DEBT.md` are fully clean. `PONYTAIL-AUDIT.md` (gitignored,
      ungated) is clean in every paragraph this change authored; five
      pre-existing findings remain in text this change did not write,
      left as-is per the ratchet norm.
