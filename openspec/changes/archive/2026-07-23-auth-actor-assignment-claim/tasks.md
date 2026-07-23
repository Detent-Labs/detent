## 1. Schema: Step.assignment (already exists — confirm, do not re-add)

- [x] 1.1 Confirm `Step.assignment: { strategy: { type, config, description? } }` already parses (it does — `src/schema/definition.ts` lines 399-441); no schema edit needed. Note `packages/editor`'s `StepsPanel.tsx`/`PluginEnvelopeEditor` already authors this field
- [x] 1.2 Confirmed: `examples/expense-approval.json` already declared `assignment` on its "capture"/"review"/"booking_error" steps (pre-existing, unvalidated scaffolding using an illustrative `role.static`/`{role}` shape) — updated to the shipped `static`/`{candidates}` strategy (task 7.2) since it no longer matches once the registry actually validates it; every other example/test body declares no `assignment` and is unaffected
- [x] 1.3 Added to `test/validate.test.ts` (`describe("Step.assignment envelope")`): a step with no `assignment` parses unrestricted; the example's well-formed `{ strategy: { type, config } }` envelope parses; a malformed envelope (missing `strategy.type` or `strategy.config`) fails to parse

## 2. Assignment-strategy registry & publish-time validation

- [x] 2.1 Add `AssignmentStrategyDef` type (`configSchema`, `resolve(config, context) => string[]`) and `assignmentStrategies: Record<string, AssignmentStrategyDef>` to `src/engine/registry.ts`, sibling to the action registry
- [x] 2.2 Implement the built-in static strategy: `resolve: (config) => config.candidates`, `configSchema` requiring `{ candidates: string[] }`
- [x] 2.3 Implement `checkAssignmentRegistry(body, registry)` in `src/engine/registry-check.ts`, mirroring `checkActionRegistry`: resolve `step.assignment.strategy.type` against the registry, validate `strategy.config` against the strategy's `configSchema` when declared, collect every located issue
- [x] 2.4 Add `AssignmentRegistryValidationError` error class carrying every located issue
- [x] 2.5 Invoke `checkAssignmentRegistry` from `publishBody` (`definitions.ts`), same placement as `checkActionRegistry` — after the hash-hit no-op, on the compiled body
- [x] 2.6 `test/assignment-registry.test.ts`: envelope structural validation; unknown `type` rejected; invalid `config` rejected; valid static-strategy step accepted; a body with no `assignment` anywhere still publishes unchanged; identical re-publish of an already-stored body stays a no-op

## 3. Engine: candidate resolution, claim, release

- [x] 3.1 Thread `assignmentRegistry: AssignmentRegistry` as a new trailing-default parameter (`= createDefaultAssignmentRegistry()`) through `planStepEntry`, `commitTransition`, `commitManualTransition`, `executeManualTransition`, `executeAutomaticTransition`, `resolveAutomatic`, `fireTimer`, `startInstance`, `cancelInstance`/`sweepCancelledChildren`, and `migration.ts`'s `migrateOne`/`migrateInstances` — every existing caller/test compiles unchanged since the default always applies
- [x] 3.2 Extend `planStepEntry` to call the resolved `AssignmentStrategyDef.resolve` for any target step with a declared `assignment`, setting `instance.assignment = { candidates, claimedBy: undefined, claimedAt: undefined }` as part of the same commit (`applyStepEntry`'s patch writes it as explicit JSON `null` when absent, since the top-level merge is shallow `||` — required a `nullable()` schema addition on `Instance.assignment`, documented in design.md); also resolve candidates in `store.ts::createInstance` for an assignment-bearing initial step
- [x] 3.3 Confirm every authored step-entry path (manual, automatic cascade, timer-forced) runs through this seam so candidates are recomputed fresh on every re-entry; migration's remap goes through the same seam but with fresh resolution suppressed (`StepEntryOpts.carryAssignment`), so an in-flight claim survives untouched — a deliberate, documented exception, not an oversight
- [x] 3.4 Implement `claimStep(instanceId, actor, db)` in the engine layer: row-lock, require `running`, require declared `assignment`, require eligible candidate (`actor.id` or any `actor.roles` entry in `candidates`), require `claimedBy` unset; set `claimedBy`/`claimedAt`; append `assignment.claimed` `InstanceEvent`; no `HistoryEntry`, no `transitionSeq` advance
- [x] 3.5 Implement `releaseClaim(instanceId, actor, db)`: row-lock, require `claimedBy === actor.id`; clear `claimedBy`/`claimedAt`; append `assignment.released` `InstanceEvent`
- [x] 3.6 Add `NotAssignedError` (claiming a step with no declared assignment), `NotACandidateError`, `AlreadyClaimedError`, `NotClaimedError`, `NotClaimantError` error classes
- [x] 3.7 Add `assignment.claimed` and `assignment.released` to the `InstanceEvent` discriminated union (`kind`, `instanceId`, `actor.id`, `version`, `transitionSeq` in force)
- [x] 3.8 `test/assignment.engine.test.ts` (DB-backed): entering an assignment-bearing step populates candidates atomically with the transition commit; re-entering the same step (loop-back) recomputes fresh candidates and clears a prior claim; a step with no `assignment` leaves `instance.assignment` unset; two actors racing to claim the same unclaimed step resolve to exactly one winner (OCC-flavored)

## 4. Runtime API Layer: claim, release, enforcement

- [x] 4.1 Add `claimStep(instanceId, actor, db?)` to `src/runtime/api.ts`, delegating to the engine implementation
- [x] 4.2 Add `releaseClaim(instanceId, actor, db?)` to `src/runtime/api.ts`
- [x] 4.3 Add the claimant-only enforcement check to `submitAndTransition`, immediately after the existing row-lock and before submission validation: if the current step has a declared `assignment`, require `actor.id === assignment.claimedBy`, throwing `NotClaimedError`/`NotClaimantError` as appropriate
- [x] 4.4 Confirm `getInstanceView` is unchanged (left as-is; not reporting `assignment` in `InstanceView` — deferred to the Player UI follow-up change) — no new gating
- [x] 4.5 `test/assignment.runtime-api.test.ts` (DB-backed): `claimStep` succeeds for an eligible candidate on an unclaimed step, rejects a non-candidate, rejects claiming an already-claimed step; `releaseClaim` succeeds for the claimant, rejects a non-claimant; `submitAndTransition` rejects an unclaimed assigned step, rejects a claim held by a different actor, succeeds for the claimant; a step with no `assignment` is unaffected (regression guard against `test/runtime-api.test.ts`)

## 5. Actor resolution

- [x] 5.1 Create `src/auth/resolve.ts`: `export type ActorResolver = (credential: unknown) => Promise<Actor>`, no default production implementation
- [x] 5.2 Add `ActorResolutionError` error class
- [x] 5.3 Implement the non-production dev header-based resolver: trusts `X-Actor-Id`/`X-Actor-Roles`-shaped input, constructs `Actor`, throws `ActorResolutionError` when the id is missing/empty
- [x] 5.4 `test/auth-resolve.test.ts`: valid headers produce the expected `Actor`; missing/malformed headers throw `ActorResolutionError`; a missing roles header resolves to `roles: []`

## 6. HTTP wrapper integration

- [x] 6.1 Wire an injected `ActorResolver` into the HTTP wrapper's server setup (`createServer`/`startHttpServer`, defaulting to `devHeaderResolver`), alongside the existing `Registry`/`resolveBody` injection
- [x] 6.2 Add credential extraction (`X-Actor-Id`/`X-Actor-Roles` headers) to every route handler, resolving via the injected resolver before calling the Runtime API — removed trust in a client-supplied `actor` body/query field entirely (routes.ts no longer reads `body.actor` or `?actorId=`)
- [x] 6.3 Add `POST /instances/:instanceId/claim` route calling `claimStep`
- [x] 6.4 Add `POST /instances/:instanceId/release` route calling `releaseClaim`
- [x] 6.5 Add `OPTIONS` CORS preflight handling for the two new routes, matching the existing three
- [x] 6.6 Extend the error-to-status mapping table: `ActorResolutionError` -> `401`; `NotAssignedError`, `NotACandidateError`, `AlreadyClaimedError`, `NotClaimedError`, `NotClaimantError` -> `403`
- [x] 6.7 Rewrote `test/http.test.ts` end-to-end for header-based auth (every existing test updated, not just extended) plus new coverage: a missing-header request maps to 401, an injected fake resolver is honored, claim/release happy paths, and each new 403 case (not-a-candidate, already-claimed, not-claimant on release, not-claimed/not-claimant on submit)

## 7. Verification

- [x] 7.1 Run `bun run typecheck` and confirm zero errors — clean (including the `editor` workspace package)
- [x] 7.2 Run the FULL `bun test` suite with `DATABASE_URL` set — 659 pass, 0 fail, 1845 expect() calls, 39 files. Along the way, fixed pre-existing example content the new registry validation exposed: `examples/expense-approval.json` had inert `assignment.strategy.type: "role.static"`/`{role}` blocks (scaffolding from before this field was validated) that don't match the shipped `static`/`{candidates}` strategy — updated to match and recomputed the wrapper's pinned `definitionHash`; updated `test/http.test.ts` and `test/runtime-api.test.ts`'s expense-approval happy-path tests to `claimStep` before each now-enforced submission
- [x] 7.3 Closed the verify-change review's warnings: added `NotAssignedError` (claiming a step with no declared assignment previously threw a plain untyped `Error`, inconsistent with every sibling rejection and falling through to HTTP `500` instead of a `4xx`), mapped it to `403 not-assigned`, and updated the affected specs; added coverage for five previously-untested scenarios — a migration carrying an in-flight claim forward untouched (`test/migration.test.ts`), `assignment.claimed`/`assignment.released` `InstanceEvent` content (`test/assignment.engine.test.ts`), multi-issue `AssignmentRegistryValidationError` collection (`test/assignment-registry.test.ts`), a request-body `actor` field being ignored (`test/http.test.ts`), and claiming an unassigned step (`test/assignment.engine.test.ts`, `test/assignment.runtime-api.test.ts`, `test/http.test.ts`). Full `bun test` re-run with `DATABASE_URL` set: 670 pass, 0 fail, 1876 expect() calls, 39 files; `bun run typecheck` clean
