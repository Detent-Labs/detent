<!-- antislop: allow-file sentence-length em-dash -->
<!-- Task descriptions name files, symbols and test assertions directly, the
     same terse convention every other tasks.md in openspec/changes/ uses. -->

## 1. Authorization

- [x] 1.1 Add `REPORTS_ROLE = "system:reports"` to `src/auth/authorize.ts`, beside the four existing constants.
- [x] 1.2 Extend `test/auth-authorize.test.ts`: the module exports `REPORTS_ROLE` with the right value; an actor holding only `system:reports` fails `requireRole` for `PUBLISH_ROLE`, `ADMIN_ROLE` and `DEVELOPER_ROLE`; an actor holding only `system:admin`, only `system:developer`, only `system:publish` or only `system:cancel-any` fails `requireRole(actor, REPORTS_ROLE)`.

## 2. Engine: the shared timeline primitive

- [x] 2.1 Add `src/engine/reporting.ts` with the in-range instance select: filter `body->>'processId'` (covered by `instances_selection_idx`) then `(body->>'startedAt')::timestamptz` between the range bounds. Add a `ponytail:` comment naming the unindexed-range ceiling and the one-line `instances_started_idx` fix from design.md.
- [x] 2.2 Implement the timeline walk: per instance, `(workflow.initialStep, startedAt)` from the resolved pinned version, then every `history_entries` row for that instance in `transition_seq` order contributing `entry.toStepId` at `entry.at`. Memoise `resolveBody` per `(processId, version)` for the request; count and return instances whose version does not resolve instead of swallowing them.
- [x] 2.3 Derive traversals from the timeline: one per consecutive pair, keyed by the earlier entry's step id, duration = later timestamp − earlier timestamp. The final entry yields none. Aggregate by step `id` across versions.
- [x] 2.4 Suppress the identity-migration split: a `HistoryEntry` with `cause === "migration"` whose `toStepId` equals the preceding timeline entry's step opens no new entry. `migration.ts::migrateOne` calls `planStepEntry` unconditionally, so this entry exists whenever a migration leaves an instance in place. Scope the suppression to the `migration` cause only — a self-loop path under cause `user`/`automatic`/`timer` is a real re-entry that re-arms timers.
- [x] 2.5 Exclude the cancel sink: `cancelInstance` writes a `HistoryEntry` with `cause: "cancel"` and `toStepId: CANCEL_SINK_STEP_ID`, so the step held at cancellation gets a closing traversal (kept), while the sink itself yields none and appears in no view.
- [x] 2.6 Test the primitive (`test/reporting.test.ts`, DB-backed): a completed instance yields one traversal per step it left and none for the terminal step; a running instance contributes none for its current step and no now()-based duration; a cancelled instance contributes the step it occupied at cancellation, ending at that instant, and the cancel sink contributes none; two versions declaring the same step id aggregate into one row; an instance that revisits a step yields two traversals with their own durations.
- [x] 2.7 Test the migration cases: an instance migrated onto the same step yields one traversal spanning the whole stay, not two; one migrated onto a different step closes the original step's stay at the migration instant; a self-loop transition still yields two traversals.

## 3. Engine: the three views

- [x] 3.1 Cycle-time: over in-range instances with `status === "completed"` only, compute p50/p90/p99 of `startedAt` → terminal-step `HistoryEntry.at` by nearest rank over the sorted sample, and per-step average dwell from those instances' traversals, ordered by the latest published version's workflow order. Return the sample size with the percentiles.
- [x] 3.2 Bottleneck: rank steps by median traversal duration descending over every in-range instance regardless of status, plus a per-step count of `running` instances whose `body->>'currentStepId'` is that step, computed without the date-range predicate.
- [x] 3.3 SLA, reminder form: build a `timerId -> stepId` map per distinct in-range version from the resolved body; select `instance_events` rows with `kind = 'timer.fired'` (using `instance_events_kind_idx`) for the in-range instances; attribute each event to the traversal whose entering `transition_seq` **equals** the event's own (an event carries the seq in force and never advances it, so equality is exact and handles revisits).
- [x] 3.4 SLA, transition form: build a `timerTargetPathId -> stepId` map per version. A transition timer fires via `commitTransition(..., "timer", ...)` and writes **no** `timer.fired` event, so recognise it from the `HistoryEntry` with `cause === "timer"` whose `pathId` matches. Without this, a step whose SLA is an escalation reports 0 % over a full denominator — see design.md. Report matched/total per step, one breach per traversal however many timers fired, and omit any step declaring no timer from the response entirely.
- [x] 3.5 Test cycle-time: percentiles ignore cancelled, faulted and running instances; an odd-sized known distribution yields the expected p50; per-step rows follow the latest version's workflow order; no completed instance in range returns an empty result, not an error; an instance created onto a terminal step (`completed` at creation, no `HistoryEntry`) contributes no zero to any percentile.
- [x] 3.6 Test bottleneck: three seeded steps with distinct medians rank longest-first; a cancelled instance's traversals count toward the median; a running instance that started before the range still counts in the work-in-progress figure and not in the median; completed, cancelled and faulted instances count toward no work-in-progress figure.
- [x] 3.7 Test SLA against `expense-approval.json`'s own two timer shapes: the reminder (`timer_…0001`, actions only) marks its traversal breached via the `timer.fired` event; the escalation (`timer_…0002`, `targetPath: path_…0005`) marks its traversal breached via the `cause: "timer"` history entry; a step whose only timer is the escalation reports a non-zero rate rather than zero or absence; a traversal with no firing counts toward the denominator only; both timers firing in one traversal count as one breach; a step declaring no timer is absent from the response; an instance visiting a timer-bearing step twice with one firing reports one breach out of two.
- [x] 3.8 Test the date range across all three views: an instance started before the range contributes to none of them; one started inside the range and still running is in range and each view applies its own status rule; a redacted instance (data cleared, history intact) contributes unchanged.

## 4. HTTP routes

- [x] 4.1 Add `src/http/reporting-routes.ts` with `GET /reporting/processes` (reusing `listProcesses` unchanged) and `GET /reporting/:processId/{cycle-time,bottleneck,sla}?from=&to=`. Apply the `REPORTS_ROLE` check once at the prefix, before process resolution.
- [x] 4.2 Validate the range bounds: unparseable ISO dates, or `from` after `to`, return `400` and run no query. An unknown `processId` returns `404`.
- [x] 4.3 Mount the route file from `src/http/server.ts`, the same way that file already mounts `admin-routes.ts` and `studio-routes.ts`.
- [x] 4.4 Test the routes (`test/reporting-routes.test.ts`): each of the four returns `200` for an actor holding `system:reports`; every route returns `403` without it; a caller lacking the role gets `403` and not `404` for a nonexistent process id; an unknown process id with the role gets `404`; a malformed range gets `400`; an `/admin/*` route, a studio route, `publishBody` and `cancelInstance` for an instance it did not start each refuse an actor holding only `system:reports`.

## 5. Frontend package

- [x] 5.1 Scaffold `packages/reporting` from `packages/admin`'s shape — React, Vite, own build/typecheck/dev scripts, hand-written History-API routing hook, `session.ts` under its own storage key — and register it in the root workspace scripts. Do not depend on `packages/form-ui`; import from `workflow-engine/schema` only.
- [x] 5.2 Run `/frontend-design:frontend-design` for visual direction before implementing any screen, per the repo convention. Pull in `web-design-guidelines`, `vercel-react-best-practices` and `vercel-composition-patterns` for the UI/UX pass.
- [x] 5.3 Login screen and role gate: reuse `POST /auth/login`; an unauthenticated visitor sees login and sends no reporting request; a signed-in actor receiving `403` sees an explicit statement naming `system:reports` as the missing role, not an empty report.
- [x] 5.4 Process picker: no view renders until the process owner picks a process; the selection survives a view switch.
- [x] 5.5 Shared date-range control: the frontend computes the last-30-days default and sends it as explicit bounds on every request; changing it reloads the current view; the range persists across a view switch.
- [x] 5.6 Cycle-time screen: percentiles with their sample size, plus the per-step averages in workflow order, with the completed-instances-only scope stated on screen.
- [x] 5.7 Bottleneck screen: the median-dwell ranking and the current work-in-progress count presented as distinguishable figures, each with its differing scope stated.
- [x] 5.8 SLA screen: per-step breach rates, with a statement that steps declaring no timer carry no SLA and are absent.
- [x] 5.9 Empty-result handling across all three screens: say so in words, never an empty table or an error. Step labels come from the latest published version.
- [x] 5.10 Extract the percentile formatting, the ranking presentation and the default-range computation into pure modules (matching `packages/admin`'s `migrationsLogic.ts` convention) and test them: the default range against a fixed reference instant, the ranking against an unordered input. Components stay untested.

## 6. Cross-cutting specs a fourth frontend makes stale

- [x] 6.1 CSP: inject the `Content-Security-Policy` meta tag from `packages/reporting/vite.config.ts` (not the source `index.html`), with `script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`, and `connect-src` derived from `VITE_API_URL`. Mirror whichever existing package's config is closest.
- [x] 6.2 Dev port: pin 5176 with strict-port in `packages/reporting/vite.config.ts`, and add `http://localhost:5176` to the devcontainer's `CORS_ALLOWED_ORIGINS`.
- [x] 6.3 Docker: add `reporting` to `docker/frontend.Dockerfile`'s accepted `PACKAGE` values and verify a build produces only that package's assets.
- [x] 6.4 Seed: provision a fifth demo user carrying `system:reports`, following the existing email convention; the re-run test asserts five users, not four.
- [x] 6.5 OpenAPI: add `reporting/*` to `docs/openapi.yaml`'s internal-only exclusion note and to the test that asserts no such path appears in the document.
- [x] 6.6 Update the Purpose prose of `openspec/specs/spa-accessibility/spec.md` and `openspec/specs/spa-error-reporting/spec.md` directly, so their "(`packages/app`, `packages/admin`, `packages/studio`)" enumerations include `packages/reporting`. Their requirements are already count-free ("every browser package" / "each browser package") and need no delta — the frontend must satisfy them regardless.
- [x] 6.7 Confirm `packages/reporting` satisfies those two capabilities in fact: every navigating element is a real focusable control, a failed request renders as an error and never as an empty result, an empty state appears only after a successful load, and one error boundary wraps the routed screen.

## 7. Verification and close-out

- [x] 7.1 `bun run typecheck` and `bun test` with `DATABASE_URL` set, inside the devcontainer, full suite — check the skip count, not only the pass count.
- [x] 7.2 Confirm no route outside `/reporting/*` and `/auth/login` is reachable from `packages/reporting`, and that no reporting route mutates any instance, definition, draft, outbox row or timer.
- [x] 7.3 Update `ROADMAP.md` #21 to DONE and add the reporting entries to `docs/current-state.md`.
- [x] 7.4 Re-run `index_repository` so the knowledge graph covers `src/engine/reporting.ts`, `src/http/reporting-routes.ts` and `packages/reporting`.
- [x] 7.5 Run `/opsx:verify`, then `/opsx:archive`.
