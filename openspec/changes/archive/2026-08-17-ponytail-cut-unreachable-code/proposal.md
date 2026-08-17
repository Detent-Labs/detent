## Why

`PONYTAIL-AUDIT.md`'s 2026-08-16 scan carries 38 findings with no open
change. Eight of them share one property: nothing in the tree reaches the
code they name. A grep sweep against `src`, `test`, `packages`, `scripts`,
`docs` and `openspec` confirms each one: no caller, no importer, no
template-literal construction, no dynamic key. Deleting unreachable code
changes no behavior and needs no design decision. These eight are the
cheapest findings left to close, so they consolidate into one change.

The same sweep also re-measured six findings the audit flagged that do
not hold up. One names code a live spec requires by name. One calls a
documented, deliberate duplication accidental. One asks for a tsconfig
`lib` bump repo-wide to save nine lines. Three read a documented
rationale as if it were absent. This change corrects the audit document
too, so the next scan does not re-propose them.

## What Changes

- Delete `scripts/demo-expense-approval.ts` (finding 6). No `package.json`
  script names it. Its own header calls it "a throwaway validation
  script, not a permanent CLI". The seed script, `scripts/seed.ts`,
  already covers demo data with a real script (`bun run seed`).
- Rewrite `scripts/dev-up.ps1` as a delegator over `scripts/dev-up.sh`
  (finding 7, corrected from "delete" to "de-duplicate"). This is the
  same pattern `scripts/preflight.ps1` already uses for `preflight.sh`.
  `README.md:91` and `openspec/specs/devcontainer-preflight/spec.md`
  both need a working PowerShell entry point.
- Delete the three dead per-area `ErrorBoundary` CSS blocks (`admin`,
  `app`, `studio`) and the dead selectors in reporting's boundary rule
  (finding 10). Only `shell-boundary-fallback`/`-stamp` is ever rendered.
- Shrink `THIRDPARTY.md`'s hand-enumerated "Transitive dependencies"
  section to one sentence pointing at `bun.lock` (finding 15). The
  section has zero inbound references and already drifts from
  `bun.lock`.
- Delete `startTimerScheduler`, `startResolutionWorker`,
  `startOutboxWorker`, `startRetentionSweep` and `SWEEP_INTERVAL_MS`
  (finding 18). `src/engine/host.ts::startEngine` already drives every
  worker through direct `pollForever` calls. None of the five has a
  caller anywhere in the tree. Fix `docs/current-state.md`'s stale "four
  call sites" claim for `pollForever` in the same change.
- Delete 13 unreferenced i18n keys from the studio catalog and 2 from
  the app catalog (finding 20). Delete each in every locale its catalog
  ships.
- Delete the dead selectors, the dead `WireField.description` member and
  the dead `OperandCelType` alias named in finding 40. Merge the two
  byte-identical `form-ui` CSS blocks finding 40 also names.
- Delete seven form-ui barrel exports (`packages/form-ui/src/index.ts`)
  that no consumer outside `form-ui/src` and `form-ui/test` reaches
  (finding 41). The functions and types stay; only the barrel re-export
  goes.
- Drop the `export` keyword from `checkTemplateKey`
  (`src/engine/templates.ts`) and `SUPPORTED_LOCALES`
  (`src/http/account-routes.ts`), the two of finding 41's twelve
  `src/`-side symbols that no other file reads. The other ten keep it.
  A test file imports each one, so the keyword is what the test reaches
  it through.
- Correct `PONYTAIL-AUDIT.md`. Move findings 8, 24, 27, 29, 34 and 35 to
  "Checked, not flagged (deliberate)", and finding 40's
  `JwtResolverConfig.localRolesClaim` entry with them: a test sets it.
  Rewrite finding 41's list against the ten-of-twelve measurement.
  Attach the measurement that disqualifies each. Reword finding 7's
  framing, since `dev-up.ps1` has a real caller. design.md carries the
  evidence behind each correction.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-toolchain`: the requirement "Every action type the shipped
  examples name resolves in the default registry" names
  `scripts/demo-expense-approval.ts` by path. The clause narrows to name
  `scripts/seed.ts` alone.
- `devcontainer-preflight`: a new requirement, alongside the existing
  preflight-contract one, states that `scripts/dev-up.ps1` delegates its
  whole bring-up flow to `scripts/dev-up.sh` instead of restating it.
  This is the same delegator shape the existing requirement already
  mandates for `preflight.ps1` over `preflight.sh`.
- `engine-poll-loop-consolidation`: the requirement naming
  `startOutboxWorker`, `startResolutionWorker` and `startTimerScheduler`
  as the subjects that share `pollForever` is rewritten against
  `startEngine`'s direct `pollForever` calls in `host.ts`. Those three
  functions no longer exist as a separate layer.
- `data-retention`: the requirement "An automatic sweep is opt-in via
  DATA_RETENTION_DAYS" names `startRetentionSweep`. It is rewritten
  against `startEngine`'s conditional `pollForever` call for retention.
  Observable behavior stays the same: opt-in via the env var, no default
  window.

Findings 10, 20, 40 and 41 touch `packages/web` and `packages/form-ui`,
but touch no capability spec. Each is dead-CSS, dead-i18n-key or
dead-export deletion with zero observable behavior change. That is the
same reasoning `ponytail-cleanup-fetch-hooks-and-imports` used for its
own `packages/web` findings.

## Impact

- `scripts/`: `demo-expense-approval.ts` deleted; `dev-up.ps1` rewritten.
- `src/engine/`: `timers.ts`, `resolution.ts`, `outbox.ts`, `retention.ts`
  each lose one dead exported starter function; `retention.ts` also loses
  `SWEEP_INTERVAL_MS`.
- `packages/web/src/areas/{admin,app,studio,reporting}/app.css`: dead
  ErrorBoundary and other dead selectors removed.
- `packages/web/src/i18n/catalogs/studio.ts`, `app.ts`: 15 dead keys
  removed across all locales each catalog ships.
- `packages/form-ui/src/`: `form-ui.css` (dead `textarea` rules, merged
  duplicate block), `types.ts` (`WireField.description`), `index.ts`
  (seven barrel exports).
- `packages/web/src/areas/studio/panels/shared/conditionLogic.ts`:
  `OperandCelType` removed.
- `src/engine/templates.ts`, `src/http/account-routes.ts`: one `export`
  keyword each. A sibling change holds both files open, so re-grep both
  symbols before the change lands.
- `THIRDPARTY.md`, `PONYTAIL-AUDIT.md`: documentation only.
- `docs/current-state.md`: the "four call sites" claim for `pollForever`
  corrected.
- `openspec/specs/development-toolchain/spec.md`,
  `openspec/specs/devcontainer-preflight/spec.md`,
  `openspec/specs/engine-poll-loop-consolidation/spec.md`,
  `openspec/specs/data-retention/spec.md`: delta specs.
- No schema, HTTP API, or CEL change. No dependency change.
