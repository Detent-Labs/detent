## Context

See proposal.md - Why. Eight findings from `PONYTAIL-AUDIT.md`'s 2026-08-16
scan share one property. A grep sweep across `src`, `test`, `packages`,
`scripts`, `docs` and `openspec` finds no caller, importer,
template-literal construction or dynamic key reaching the named code.
Each decision below records the evidence for one finding, or for one
audit correction. A future reviewer does not need to re-run the sweep.

## Goals / Non-Goals

**Goals:**
- Delete each of the eight findings' unreachable code with no behavior
  change, keeping every existing test green.
- Correct the six audit findings the sweep disproved, so
  `PONYTAIL-AUDIT.md` stops re-proposing them.
- Sync the four live specs that name the deleted symbols, so no spec
  describes code that no longer exists.

**Non-Goals:**
- Findings 16 and 21 (the `readJson` export and the `registry-check.ts`
  collector inline) are real duplication, not dead code. They belong to
  the http and engine cleanup groups the audit itself proposes, not
  here.
- `definitionStatus`'s dead members (part of finding 40) stay out. They
  live in `src/schema/definition.ts`, which CLAUDE.md says never changes
  as a side effect of another task.
- `JwtResolverConfig.localRolesClaim` (part of finding 40) stays out
  because it is not dead. It is now measured, not merely unverified. The
  Decisions section carries the measurement.
- Finding 41's twelve `src/`-side exports are now measured too. Ten stay
  out, each for the same reason: a test file imports the symbol, so the
  `export` keyword is load-bearing. Two land, `checkTemplateKey` and
  `SUPPORTED_LOCALES`.
- `Page<T>`'s duplication between `runtime/api.ts` and
  `admin-queries.ts` (part of finding 34) is real but small on its own.
  The Decisions section below disqualifies finding 34 as a whole, so
  this change leaves `Page<T>` out too.

## Decisions

**Finding 6: delete `scripts/demo-expense-approval.ts`.** No script in
`package.json` names it. `package.json:18-28` lists nine scripts, and
none of them is this one. The file's own header calls itself a
throwaway validation script. It says it is "not a permanent CLI or
capability" (`demo-expense-approval.ts:1-7`).

The seed script, `scripts/seed.ts`, has its own entry, `bun run seed`.
That script already covers demo data. The only live-spec reference
sits at `development-toolchain/spec.md:688`. The delta above narrows
it.

**Finding 7: `dev-up.ps1` becomes a delegator, not a deletion.** The
audit called it dead. That is false. `README.md:91` documents `pwsh
scripts/dev-up.ps1` as the Windows entry point. A live requirement
already governs the two bring-up scripts, at
`devcontainer-preflight/spec.md:145-161`. It says the two must agree
"by construction rather than by hand".

`dev-up.ps1` already needs bash today. It calls `preflight.ps1`, which
shells out to `preflight.sh`. A full delegator over `dev-up.sh` adds no
new host requirement. It is the same shape `preflight.ps1` already
uses. `docs/current-state.md:3234-3238` states three reasons a bash
requirement on the PowerShell path is acceptable.

**Finding 10: three per-area `ErrorBoundary` blocks are unreachable.**
Reporting's dead selectors fold in here too. Exactly one boundary
mounts, at the shell level. `packages/web/src/shell/App.tsx:196` wraps
each area in one `<ErrorBoundary>`. Only
`shell/ErrorBoundary.tsx:40-41` renders
`shell-boundary-fallback`/`shell-boundary-stamp`. No area-level
`ErrorBoundary` component exists.

The four area class names appear only in their own stylesheets. No TSX
file references them. No template literal builds them either.
Reporting's dead rule, at `reporting/app.css:21-31`, groups
`.rep-boundary-fallback` with `.rep-login` and `.rep-empty-role`.
Reporting renders no login form. It renders no role-empty state
either, so all three selectors are independently dead.

All three go together for one reason. Deleting one selector out of a
shared, comma-separated rule would leave the other two orphaned in
place. A different class, `.rep-empty` (no `-role`), stays live at
`reporting/components.tsx:58`. This change leaves it untouched.

**Finding 15: `THIRDPARTY.md`'s "Transitive dependencies" section has
zero inbound references.** No script, gate, or workflow links to it.
No doc links to it either, and none regenerates it. A repo-wide,
case-insensitive grep for `THIRDPARTY` matches only the file's own
title.

The section already drifts from `bun.lock`. It claims `react 19.2.8`;
the lock pins `18.3.1`. The file's own header already says it "reads
name and version from `bun.lock`". One sentence pointing there
replaces the hand-enumeration `bun.lock` already supersedes.

**Finding 18: the four worker starters are unreachable.**
`SWEEP_INTERVAL_MS` folds in here too. `startEngine`
(`src/engine/host.ts:311-317`) drives every worker through direct
`pollForever` calls. Each call closes over per-tenant context. Four
functions have no caller anywhere in `src`, `test`, `scripts` or
`packages`: `startTimerScheduler`, `startResolutionWorker`,
`startOutboxWorker`, `startRetentionSweep`. Each is a one-line orphaned
wrapper over the same `pollForever` and drain, or sweep, call `host.ts`
already makes directly.

`SWEEP_INTERVAL_MS` (one hour) is private to `startRetentionSweep`, and
dies with it. `host.ts:315-317` already polls retention at 500ms, like
every other worker. The constant carries forward no real interval.
`package.json`'s exports map exposes none of the five. Two live specs
name three of the five by name; both get delta specs below.
`docs/current-state.md:2296-2298` claims "four call sites" for
`pollForever`. That claim becomes accurate again once these five fall
away: eight call sites exist today, once retention's conditional call
counts.

**Finding 20: 15 i18n keys have no referrer, in every locale.** An
exact-string grep proves it. It runs across `packages/web/src` and
`packages/web/test`, excluding the catalog files themselves. It
returns zero hits for all 15.

The only dynamically-constructed key in the whole web tree is
`` `area.${area}` `` (`shell/Chrome.tsx:61,101`). It cannot produce any
of the 15 prefixes. Sibling keys under the same prefixes stay live, for
example `draftToolbar.save` and `steps.unnamedStep`. Only the 15 named
members are dead, not their prefixes.

`started.startedOn` looks live at a glance. `startedLogic.ts:58`
computes a near-identically-named `startedOnLabel`. That function calls
`toLocaleDateString` directly, and never touches the catalog. The
catalog key itself has no reader.

**Finding 40: dead selectors, a dead type member, and a dead type
alias.** `.studio-publish-result` (`studio/app.css:138-141`) is dead.
Bare `.studio-palette` and `.studio-palette h2` are dead (`:1792-1802`).
The suffixed variants, `-list`, `-entry`, `-ghost`, stay live in
`EditRail.tsx`. `.rep-login`/`.rep-empty-role` fold into finding 10's
reporting deletion. form-ui's `textarea` selectors are dead
(`form-ui.css:91,102`), since `FieldForm.tsx` renders only `input`,
`select` and `option`.

`form-ui/src/types.ts:14` declares `WireField.description`. No code
reads it anywhere. The several `.description` hits elsewhere belong to
unrelated types. `OperandCelType`
(`studio/panels/shared/conditionLogic.ts:23`) is the only hit repo-wide
besides the audit document. The adjacent `Operand.celType` field
carries type `string`, not this alias.

`form-ui.css`'s `.form-ui-field` and `.form-ui-field-control` blocks
are byte-identical. Both classes render, at `FieldForm.tsx:223-224`.
That pair merges into one grouped selector instead of losing either
class.

**Finding 41: seven `packages/form-ui/src/index.ts` barrel exports have
no consumer outside `form-ui/src` and `form-ui/test`.** Web imports the
package by name, `from "form-ui"`. It consumes only `FieldForm`,
`PathButtons`, `filterToEditable`, `resolveText`, and three types:
`ResolvedViewField`, `AvailablePath`, `SubmissionIssue`. That holds
across every `from "form-ui"` site in `packages/web/src`. Tests import
by relative path, `from "../src/*.js"`, never through the barrel. The
functions and the type stay. Only their `index.ts` re-export goes:
`FieldInput`, `effectiveSpan`, `optionText`,
`OPTION_ATTRIBUTE_SEPARATOR`, `editableFieldIds`, `issueMessage`,
`WireField`.

**Finding 41: two of the twelve `src/`-side exports have no importer at
all.** A grep for each symbol covers `src`, `test`, `packages` and
`scripts`. It returns the declaring file every time. For ten of the
twelve it returns a test file too:

| symbol | importer outside its own file |
|---|---|
| `checkTemplateKey` | none |
| `SUPPORTED_LOCALES` | none |
| `singleTenantSource` | `test/tenancy-workers.test.ts` |
| `parseExpression` | `test/cel.test.ts` |
| `projectInstance` | `test/eval.test.ts` |
| `managerOfStarterStrategyDef` | `test/assignment-manager-strategy.test.ts` |
| `InvalidTenantKey`, `TenantKeyTaken` | `test/tenancy-provision.test.ts` |
| `checkDbReady` | `test/health.test.ts` |
| `clientAddressOf` | `test/auth-login.test.ts` |
| `parseAuthIssuers` | `test/auth-server.test.ts` |
| `MAX_OVERRIDE_VALUE_LENGTH` | `test/http-ui-strings.test.ts` |

The audit's own phrasing admits this: "with no importer outside
`test/`". A test importer is an importer. The `export` keyword is how
the test reaches the symbol, so dropping it trades an API-surface line
for a deleted test. That is the same trade
`ponytail-cleanup-fetch-hooks-and-imports` declined for finding 37.

The first two rows are different. One caller reads `checkTemplateKey`,
at `templates.ts:144`, in its own file. `SUPPORTED_LOCALES` has two
readers, `account-routes.ts:100` and `:101`, in its own file. Neither
has a test. Both lose the keyword and keep the symbol.

**Audit correction: finding 40's `localRolesClaim` is not dead.** The
audit says it is "never set by the one construction site". Two
construction sites exist. `test/auth-jwt.test.ts:109` calls
`jwtResolver({ localSecret: SECRET, localRolesClaim: "groups" })`. That
test proves the `?? "roles"` default at `jwt.ts:93` is a default rather
than a constant.

**Audit correction: finding 27 (`BINARY_ROUTES`) is not dead.** A
requirement at `http-wrapper/spec.md:1491-1521` requires the
hand-maintained ledger, by name. Its rationale is already on record:
"nothing derives it... a person keeps the ledger by hand".
`test/http-disposition.test.ts` drives every entry generically.

The audit's own "not flagged" section already lists gates whose length
"is comments recording measured traps". This is the same pattern, for
a route table. Deleting `BINARY_ROUTES` would delete a spec
requirement. CLAUDE.md wrote that requirement after a measured defect,
the `/admin/*` route collision. Deleting `BINARY_ROUTES` would not
clean up dead code.

**Audit correction: finding 34 (pagination constants) calls a
documented decision an accident.** A comment at
`runtime/api.ts:243-246` says otherwise. It calls the duplication
deliberate: "the numbers agree today by coincidence, not by contract".
A sibling comment at `admin-queries.ts:44-46` says the same in
reverse: "Separate from `runtime/api.ts`'s constant of the same name".

Only `Page<T>` is a genuine, unexplained duplicate. Each file uses its
own copy internally, and neither imports the other's. That duplicate
is small enough that finding 34 is not worth reopening for `Page<T>`
alone. It stays noted as a possible future finding instead.

**Audit correction: finding 35 (`Map.groupBy`) costs more than it
saves.** `groupMs` is 9 lines. Using `Map.groupBy` needs
`tsconfig.json`'s `lib` raised, from `ES2022` to `ES2024`, repo-wide.
That blast radius is disproportionate to the line count it buys back.

**Audit correction: finding 24 (`src/errors.ts`) overstates the
trivial-class count.** Only `RequestShapeError` and `NotFoundError` are
`name`-only. `InstanceNotRunningError` and `InstanceRunningError` each
carry `instanceId` and `status` as readable state. Callers use that
state to distinguish outcomes. `api.ts:38-42`'s comment names the
distinction. A generic `NamedError` base would drop that state.

**Audit correction: finding 29 (`cel/eval.ts` "shims") misreads two of
the four.** `evalTransforms`/`evalFieldMap` are thin delegates, and
stay a finding on their own merits. But `buildTransformContext` builds
a real, different context. It re-keys the context against the source
catalog, instead of delegating. `buildOutputContext` carries a comment
that explains why. Its namespace must stay separate from the guard
context. Neither of those two functions is a shim.

**Audit correction: finding 8 (`duration.ts` comment density) reads
argument as history.** The 45-line block above `armStepTimers`
(`duration.ts:90-135`) states facts. It covers totality, the CEL
evaluation contract, and a magnitude bound. That bound comes from a
real overflow analysis. None of it is "process history", the target of
CLAUDE.md's comment rule. Cutting it would delete reasoning a future
change needs, to touch this function safely.

## Risks / Trade-offs

[The retention-sweep spec rewrite touches a requirement with six
existing scenarios] → the delta keeps every scenario's WHEN/THEN
unchanged. It only retargets the subject, from `startRetentionSweep` to
`startEngine`'s conditional `pollForever` call. Behavior stays
identical before and after.

[`engine-poll-loop-consolidation`'s `## Purpose` section names the
three deleted functions] → delta specs cannot change an existing
capability's Purpose; the schema ignores it. This change edits
`openspec/specs/engine-poll-loop-consolidation/spec.md`'s Purpose text
directly. The artifact instructions direct that for this case. It does
not go stale.

[`panels-list-and-detail` is an open change touching the same i18n
prefixes finding 20 deletes from] → tasks.md's first task re-greps all
15 keys. It does that right before deleting them, and does not trust
this design's snapshot.

## Migration Plan

No data migration. No deployed-state change. Apply the order tasks.md
lists: deletions first, doc and spec corrections last. That order keeps
a `bun test` run between task groups green.

## Open Questions

None. Every decision above resolves at design time.
