# Code Review & Security Audit

**Date:** 2026-07-29
**Scope:** Entire codebase

**Summary:** The engine core is unusually well-built: the state-before-side-effects contract, optimistic concurrency, row-lock ordering, subprocess idempotency and migration data-retention are all correct and, more importantly, *reasoned about in writing at the point of implementation*. The test suite is honest — zero mocking across 41 suites, real interleaved-transaction concurrency tests, systematic per-route authorization coverage — which makes its remaining blind spots narrow and nameable. The weaknesses cluster at the edges the contract does not reach: there is no object-level authorization on the instance-read path, the auth configuration fails open by omission, one publish-path validation gap lets a privileged author reach engine-internal action dispatch, and a single unresponsive HTTP target permanently halts all async side-effect delivery. The frontend packages are structurally sound (pure logic extracted and unit-tested, no injection surface, server-side enforcement never confused with client gating) but share a repeated error-handling pattern that renders affirmatively wrong empty states, and primary navigation in three of five packages is mouse-only. Nothing here is architectural rework; the ten highest-impact items are small, local, and mostly one-function changes.

## Executive Summary

**Overall rating: 7/10** — a disciplined, contract-driven engine with genuinely good concurrency and test practice, held back by object-level authorization gaps, fail-open auth configuration, and the absence of any automated gate on `main`.

Top findings:

| ID | Severity | Finding |
|----|----------|---------|
| SEC-1 | High | `getInstanceView` performs no object-level authorization — any authenticated actor with an instance id reads its full data payload, while the *weaker* record route is admin-gated |
| SEC-2 | High | Missing auth env vars silently select the unsigned-header resolver; two headers grant admin, publish and cancel-any, with no startup warning |
| SEC-3 | High | The reserved `core.` action-type ban is bypassable through `compileProcessBody`'s idempotent early return, reaching engine-internal subprocess dispatch with author-chosen config |
| SEC-4 | High | `validation.pattern` is never compiled at publish and is recompiled per submission against participant-supplied strings — an uncompilable pattern bricks an immutable version; a backtracking one blocks the single event loop |
| ERR-1 | High | No per-delivery deadline: one unresponsive `http.request` target stalls the sole outbox worker forever, stopping *all* action delivery including subprocess spawn/return |
| ERR-2 | High | 22+ sites rethrow non-401 API errors into unhandled rejections; screens then render "No instances match these filters." or a permanent `Loading…` during an outage |
| CQ-1 | High | Primary navigation in `packages/app`, `packages/admin` and `packages/studio` is clickable `<tr>`/`<li>`/`<div>` with no keyboard affordance — WCAG 2.1.1 Level A block on the app's sole purpose |

**Recommended next steps**

1. Close SEC-1 and SEC-2 first — both are single-function changes with total-bypass failure modes and no design work required.
2. Land CI (TEST-1) immediately after, with `DATABASE_URL` mandatory, so the fixes and the 546 `skipIf` DB tests stop depending on human memory.
3. Then SEC-3, SEC-4 and ERR-1, which are the three defects that can put a *published, immutable* definition or the whole side-effect subsystem into an unrecoverable state.
4. Treat CQ-1/CQ-2 as one accessibility pass across the SPAs, routed through the design skills per `CLAUDE.md`.

## Detailed Findings

### Security

#### SEC-1 — No object-level authorization on the instance-read path

- **Severity:** High
- **Location:** `src/runtime/api.ts:530-542`; caller `src/http/routes.ts:65-77`; route `src/http/server.ts:268`
- **Description:** `getInstanceView(instanceId, actor, registry, db)` accepts `actor` but uses it only to build the CEL guard context for `resolveFields`/`resolveAvailablePaths` (api.ts:539-540). It makes no permission decision. `handleGetInstanceView` resolves the actor and calls straight through — no `requireRole`, no `startedBy`, candidacy or claimant check. The response carries every resolved field value from `instance.data` plus `availablePaths`. This is internally inconsistent with the project's own authorization spec, which gates the two *weaker* reads: `GET /instances` with `scope=all` and `GET /instances/:id/record` both require `system:admin` (routes.ts:158-160, :180), and `openspec/specs/authorization/spec.md:178-181` explicitly specifies 403 on the record route *even for an instance the actor started*. `ROADMAP.md:167-179` marks Authorization DONE, so this is a gap inside a stage declared complete.
- **Why it matters:** The audit trail of an instance is admin-only while the instance's actual field values — salary, disciplinary, expense detail — are readable one route over by any account with a valid token. An actor who was legitimately a candidate on step 1 (and therefore saw the id via `scope=mine`) keeps unrestricted read access for the life of the instance, long after it moves to steps they have no relation to. Ids are not enumerable (`scope=all` is 403), but they leak routinely through `packages/app` URLs, support tickets and links — so the ex-candidate path requires no guessing at all.
- **Recommendation:** Enforce inside `getInstanceView`, not in `routes.ts` — the runtime API is the documented library seam and `cancelInstance` already authorizes there (api.ts:630-660). Reuse `isEligibleCandidate` from `src/engine/transition.ts` so the predicate matches `claimStep`'s.

```ts
const { instance, body } = await loadInstanceForRead(instanceId, db);
if (
  !actor.roles.includes(ADMIN_ROLE) &&
  instance.startedBy !== actor.id &&
  instance.assignment?.claimedBy !== actor.id &&
  !isEligibleCandidate(actor, instance.assignment?.candidates)
) throw new AuthorizationError(/* ... */);   // already mapped to 403 at errors.ts:58
```

Ship with an HTTP test asserting 403 for a third-party actor (mirroring the existing record-route 403 test) and an `openspec/specs/authorization/spec.md` scenario, since the spec is currently silent on this route.

#### SEC-2 — Missing auth env vars fail open to the unsigned-header resolver

- **Severity:** High
- **Location:** `src/http/server.ts:136-140`, `:169`, `:375-382`
- **Description:** `resolveAuthResolver` returns `devHeaderResolver` whenever neither `AUTH_JWT_SECRET` nor `AUTH_ISSUERS` is set (server.ts:138), and `createServer`'s `resolver` parameter *also* defaults to it (server.ts:169). `devHeaderResolver` (`src/auth/resolve.ts:36-43`) trusts `X-Actor-Id`/`X-Actor-Roles` verbatim, and authorization is role-only, so an anonymous caller sending `X-Actor-Roles: system:admin,system:publish,system:developer,system:cancel-any` satisfies every `requireRole` gate in `routes.ts`, `admin-routes.ts` and `studio-routes.ts`. The default is deliberate and documented (resolve.ts:33-34; docs/current-state.md:553-555) but the *reason recorded* is test convenience — "keeps `test/http.test.ts` unchanged and green" — i.e. a test concern setting the production security default. Nothing surfaces the state: `startHttpServer` logs only `HTTP server listening on :${port}` (server.ts:382), and the sole observable difference is that `POST /auth/login` is unregistered and 404s, which reads as a routing bug.
- **Why it matters:** A dropped env passthrough in a compose file, a CI-promoted image, or a typo'd variable name yields a fully unauthenticated engine that looks healthy. The repo already applies fail-loud discipline one function above — `parseAuthIssuers` throws on a malformed `AUTH_ISSUERS` (server.ts:113-125) — so the asymmetry is inconsistent as well as unsafe.
- **Recommendation:** Make the insecure branch opt-in and loud, and drop the parameter default so no call site inherits it by omission:

```ts
export function resolveAuthResolver(env: {...}): ActorResolver {
  const issuers = parseAuthIssuers(env.AUTH_ISSUERS);
  if (!env.AUTH_JWT_SECRET && !issuers) {
    if (env.ALLOW_INSECURE_DEV_AUTH !== "1")
      throw new Error("no auth configured: set AUTH_JWT_SECRET/AUTH_ISSUERS, or ALLOW_INSECURE_DEV_AUTH=1 to trust X-Actor-* headers");
    console.warn("AUTHENTICATION DISABLED: X-Actor-* headers are trusted verbatim");
    return devHeaderResolver;
  }
  return jwtResolver({ localSecret: env.AUTH_JWT_SECRET, issuers });
}
```

Blast radius on tests is one assertion (`test/auth-server.test.ts:33`); every other suite passes `devHeaderResolver` into `createServer` explicitly.

#### SEC-3 — Reserved `core.` action-type ban is bypassable via compile's idempotent early return

- **Severity:** High
- **Location:** `src/schema/compile.ts:105-109`; `src/schema/definition.ts:698-706`; `src/engine/registry-check.ts:107`
- **Description:** `compileProcessBody` returns early whenever `publishedProcessBody.safeParse(body)` succeeds (compile.ts:108-109), skipping `authoredProcessBody.parse(body)` on line 115 — which is the *only* place the reserved `core.` prefix is rejected. `publishedProcessBody` checks nothing but the cancel-sink count. A hand-written body that simply *adds* a well-formed terminal step with `id: "step_cancel_sink"` therefore takes the early return with `core.spawnSubprocess`/`core.returnSubprocess` actions intact. `checkActionRegistry` does not catch them either — it filters reserved-prefix actions out (registry-check.ts:107) on the explicitly stated premise that they "can never be present in an authored body", which is exactly the premise this path breaks. Both internal handlers register with no `configSchema` (`src/engine/subprocess.ts:242-243`), so the forged `config` is entirely author-controlled. Note compile.ts:105-107's own comment asserts the falsified premise: *"A body that merely collides with the reserved identity is NOT published-valid and falls through."*
- **Why it matters:** Reproduced by execution against the real schemas: the forged body passes `publishedProcessBody` (true), fails `authoredProcessBody` (false), compiles with `core.returnSubprocess` surviving, and draws zero `checkActionRegistry` issues — so `publishBody` persists it and the outbox dispatches it to `makeReturnHandler` with attacker-chosen `parentInstanceId`/`childOutcome`. `makeReturnHandler` (subprocess.ts:157-172) requires only that the acting instance carry a `parent` link and that the named parent be parked at that link's `stepId`. Step ids are unique per process but not globally, so an author can declare a process whose subprocess step id equals a victim process's, spawn a forged child, and drive an arbitrary outcome into an unrelated instance — `outputMapping` writeback into the victim's `data` plus a forced advance off its wait-state. Publishing is `system:publish`-gated, but the reserved prefix exists precisely to keep engine-internal dispatch out of a publisher's reach.
- **Recommendation:** Move the reserved-prefix ban (ideally the whole reserved-identity check) from `authoredProcessBody` into the base `processBody` superRefine — the compile pass injects no `core.*` action into any authored position, so a stored body can never legitimately contain one — or have `publishBody` run the reserved-identity checks on the compiled body regardless of branch. Independently drop the `.filter()` at registry-check.ts:107 and give `SPAWN_ACTION_TYPE`/`RETURN_ACTION_TYPE` real `configSchema`s. The existing regression test at `test/cancel.test.ts:121` passes only incidentally — it *renames* step[0], breaking `initialStep` resolution, so it fails `publishedProcessBody` for an unrelated reason; add a test using the additive shape.

#### SEC-4 — `validation.pattern` is never compiled at publish, and is recompiled per submission

- **Severity:** High
- **Location:** `src/runtime/api.ts:373-375`; publish path `src/schema/compile.ts:102`; schema `src/schema/definition.ts:241`
- **Description:** `pattern` is a bare `z.string().optional()` and nothing compiles it at publish — `compileProcessBody` runs `validateDurations` and nothing else. The first `new RegExp(validation.pattern)` happens at submission time, per field, per call (api.ts:374); it is the only `new RegExp` site in `src/`. Two failure modes. (a) An uncompilable pattern such as `"("` publishes cleanly (verified by executing `compileProcessBody`) and then throws `SyntaxError` on every submission touching that field, which `mapError` funnels into the generic 500 branch (errors.ts:80-81). (b) A backtracking pattern is evaluated against a submitter-controlled string with no length bound — `maxLength` at api.ts:370-372 pushes a violation and *falls through*, so the pattern test still runs against the oversized value, and JS `RegExp` has no timeout.
- **Why it matters:** Published versions are immutable, so (a) permanently bricks a step: every instance pinned to that version is stuck, and the only remedy is publishing a new version and migrating every pinned instance. For (b), a participant — the lowest-privilege role — supplies the subject string, and `startHttpServer` runs the HTTP server, outbox worker, timer scheduler and resolution worker on one event loop (server.ts:378-381), so one crafted POST stalls all of them. This also contradicts `CLAUDE.md`'s own placement rule: validation that may tighten belongs on the write path.
- **Recommendation:** Compile every catalog `validation.pattern` inside `compileProcessBody` beside `validateDurations`, with the same located-issue shape, plus a length cap on the pattern source. At runtime, run the pattern test only when the length constraints passed, and cache the compiled `RegExp` per immutable published body. Ship the publish-rejection test the repo's convention requires.

#### SEC-5 — Submit-path actor check is conditional on the step declaring an assignment

- **Severity:** Medium
- **Location:** `src/runtime/api.ts:586-589`
- **Description:** Claimant-only enforcement is wrapped in `if (instance.assignment) { ... }`. `Step.assignment` is optional, so a step authored without one accepts a submission from any actor that authenticates — no candidacy, `startedBy` or role check. Deliberate and documented (`docs/superpowers/specs/2026-07-23-auth-actor-assignment-claim-design.md:135-137`), and pinned by `test/assignment.runtime-api.test.ts:134` — but that test creates the instance *as* `candidate` and submits *as* `candidate`, so it cannot distinguish "outsider allowed" from "starter allowed" and proves nothing about outsiders.
- **Why it matters:** Omitting one optional authoring key makes an approval step world-writable, with no publish-time diagnostic. Combined with SEC-1 (same actor reads the view including `availablePaths`), anyone who has ever held an instance id has a full read-and-drive primitive on it.
- **Recommendation:** Either add a floor at api.ts:586 — when `instance.assignment` is absent, require `instance.startedBy === actor.id` or `ADMIN_ROLE` — or make it visible at authoring time with a publish-time diagnostic in `compile.ts` for a non-terminal step with manual paths and no `assignment`. Add a test asserting the already-defined `outsider` fixture is rejected.

#### SEC-6 — `AUTH_JWT_SECRET` is accepted at any length for HS256

- **Severity:** Medium
- **Location:** `src/http/server.ts:136-140`, `:378`; `src/auth/jwt.ts:44-45`; `src/auth/login.ts:81`
- **Description:** The secret is passed straight into `jwtResolver` as `localSecret` and reused as `loginSecret`; both do `new TextEncoder().encode(...)` with no length or entropy check. Verified against the vendored jose 6.2.4: `checkKeyLength` (`node_modules/jose/dist/webapi/lib/signing.js:4-11`) enforces a minimum only for `RS*`/`PS*` (modulus ≥ 2048), and `getSigKey` raw-imports any `Uint8Array` as an HMAC key. `AUTH_JWT_SECRET=x` is a fully working HS256 deployment. Nothing in `README.md`, `docs/current-state.md:548-556` or the devcontainer states a required strength.
- **Why it matters:** HS256 tokens are offline-crackable against a weak key — the token is its own oracle — and `toActor` (jwt.ts:39-42) takes roles from the claim with no re-read of `auth_users`, so a recovered key mints admin at will and disabling the account does not help. Because setting a weak secret *looks* like correctly enabling auth, it is a more likely operator error than leaving auth off entirely (SEC-2), and there is no feedback either way.
- **Recommendation:** Validate in `resolveAuthResolver` that `AUTH_JWT_SECRET`, when set, encodes to ≥ 32 bytes and throw otherwise — the same treatment `parseAuthIssuers` gives malformed input. Derive `loginSecret` from the same validated value. Document `openssl rand -base64 32` next to the variable in `docs/current-state.md`.
- **Not a finding (verified sound):** algorithm-confusion is unreachable — jose's `getSigKey` throws `TypeError` for a `Uint8Array` key with any non-`HS*` algorithm, so `alg: none` and RS256-with-public-key substitution both fail before verification.

#### SEC-7 — Login rate limiting fails open permanently after 50,000 distinct emails

- **Severity:** Medium
- **Location:** `src/auth/login.ts:46-57` (fail-open branch at `:54`)
- **Description:** `checkAndRecordAttempt` returns `"ok"` for any not-yet-tracked email once `map.size >= MAX_TRACKED_EMAILS`, and entries are removed only on a *successful* login (login.ts:79) — no TTL sweep, no eviction. The design records the fail-open as deliberate (`openspec/changes/archive/2026-07-26-add-login-rate-limit/design.md:82-96`), but its stated justification — "a real deployment's account count sits far below the cap, so legitimate users always get a tracked slot" — assumes the fake emails arrive last. The ordering is attacker-controlled, and the warm-up is cheap: an unknown email short-circuits before argon2id (`src/auth/users.ts:33`).
- **Why it matters:** A scripted 50k-request warm-up permanently disables the 5-per-15-minutes control that `login.ts:8-9` and `docs/current-state.md:614-625` present as the brute-force defense, after which a chosen account has unlimited online guesses. The state is silent — no log, no metric.
- **Recommendation:** Before the capacity check at `:54`, sweep entries whose `windowStart` is older than `WINDOW_MS` (they carry no information and would reset on next use anyway); only if the map is still full should the branch decide, and it should then fail **closed** with the existing 429. Keep the sweep inside the same synchronous, await-free function to preserve the atomicity property the surrounding comment protects.

#### SEC-8 — Login timing discloses which emails have accounts

- **Severity:** Medium
- **Location:** `src/auth/users.ts:32-35`
- **Description:** `verifyLogin` returns at `:33` when no row matches, skipping `Bun.password.verify` entirely; a known email always pays the full argon2id cost at `:34`. `docs/current-state.md:587-588` itself puts an attempt at ~100 ms, so the two paths differ by roughly two orders of magnitude — separable over the network with no statistical work. The doc comment at users.ts:20-24 claims "a caller cannot learn from this function's result which email addresses exist"; that is accurate about the *result* and false about the *timing*. The disabled-user path is handled correctly (verify first, then check `disabled`), so only the unknown-email branch short-circuits.
- **Why it matters:** Enumerates valid corporate addresses, producing a target list for phishing or for the unlimited guessing SEC-7 enables. Enumeration is itself unthrottled: each distinct email is a first attempt, so `checkAndRecordAttempt` never returns `"limited"`.
- **Recommendation:** Verify against a module-level dummy hash when no row is found, so both branches perform exactly one verification:

```ts
const DUMMY_HASH = await Bun.password.hash(crypto.randomUUID()); // cost params track the real ones
const valid = await Bun.password.verify(password, row?.password_hash ?? DUMMY_HASH);
if (!row || !valid || row.disabled) return undefined;
```

Add a test asserting the unknown-email path still performs a verification.

#### SEC-9 — Bearer tokens in `localStorage` across all four SPAs, with no CSP anywhere

- **Severity:** Medium
- **Location:** `packages/{studio,admin,app,editor}/src/session.ts` (e.g. `packages/studio/src/session.ts:31-33`); `packages/*/index.html`; `packages/*/vite.config.ts`
- **Description:** All four browser apps persist the JWT to `localStorage`. No defense in depth exists: none of the four `index.html` files carries a `Content-Security-Policy` meta tag, all four `vite.config.ts` are identical 5-line `defineConfig({ plugins: [react()] })` with no header plugin, and a grep for `Content-Security-Policy|X-Frame-Options|helmet` across `src/` returns zero hits — the server supplies none either. `docs/current-state.md:719-721` records that disabling a user does not revoke an issued JWT (no per-request DB lookup) and `:581` records the 8-hour expiry. No exploitable XSS sink exists today: the single `innerHTML` write (`packages/editor/src/graph/GraphView.tsx:86`) is genuinely mitigated by mermaid `securityLevel: "strict"`, and React escapes elsewhere.
- **Why it matters:** Exposure rather than a live exploit: one future script injection in the origin — a dependency compromise, an added `dangerouslySetInnerHTML`, a dev-server plugin — yields an admin bearer token that provably cannot be revoked for up to 8 hours, carrying publish rights over process definitions and cancel-any over every instance.
- **Recommendation:** The cheap, entirely frontend-side mitigation is a CSP meta tag in the four `index.html` files — `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'` — which blocks injected inline script and exfiltration independently of where the token lives. The httpOnly-cookie move is larger and blocked on the CORS-credentials work `docs/current-state.md:326` already scopes; treat it as a separate OpenSpec change, not a prerequisite.

#### SEC-10 — No size or depth bound anywhere between an HTTP request and persisted instance data

- **Severity:** Medium (unverified)
- **Location:** `src/http/server.ts:380`; `src/runtime/api.ts:329-348`; `src/http/studio-routes.ts:59-72`
- **Description:** `Bun.serve({ fetch, port })` passes no `maxRequestBodySize`, so Bun's 128 MiB default applies to every route. Nothing downstream narrows it. `handleSaveDraft` forwards `body`/`layout` as `unknown` to `saveDraft`, which validates only the envelope (`src/engine/drafts.ts:90-100`, deliberately, since a draft under construction legitimately violates authoring invariants) — and `processId` is an unvalidated path segment cast with `processId as ProcessId`, so the *row count* is unbounded too. On the submit path, `JS_TYPE.file` is `"any"` and `typeMatches` returns early for `file` and plugin types (api.ts:338, 343-345), and `checkConstraints` applies nothing to a non-string/non-array value, so a participant can persist an arbitrarily large/deep value into `data`; every later read re-parses it through the recursive `literal` schema (definition.ts:174-178), including once per row in `listInstances` (api.ts:707).
- **Why it matters:** A `system:developer` account can exhaust disk and Postgres TOAST storage with no per-request or per-row bound; a participant on a `file`- or plugin-typed field can do the same to one instance's payload with no bound an author could even set. **Unverified:** no concrete blow-up threshold was measured — whether Zod's recursive parse, Bun's JSON parse, or Postgres's jsonb nesting limit trips first is unknown. This stands as a confirmed *absence of bounds*, not a demonstrated crash.
- **Recommendation:** One line covers the transport edge: pass `maxRequestBodySize` to `Bun.serve` sized to the largest legitimate definition (a few MB). Add `.max()` bounds to `key`, `pattern`, `Plugin.type`, `duration` and `Expression.src` on the *write* path only (per the placement rule compile.ts:54-67 already states), and a serialized-size check in `checkEnvelope` so the draft bound survives a future non-HTTP caller.

### Architecture

#### ARCH-1 — Outbox `attempts` is not incremented at claim time, so the dead-letter cap is unreachable

- **Severity:** Medium
- **Location:** `src/engine/outbox.ts:150-159` (tx1 claim), `:171` (in-memory increment), `:189/:229/:237` (persisted only in tx2)
- **Description:** The tx1 claim UPDATE sets only `status = 'claimed', claimed_at = now()`. The increment is purely in-memory (`const attempts = row.attempts + 1;`) and persisted only by the three tx2 branches. Any delivery that never reaches tx2 — the handler killed the process, or the worker exceeded `CLAIM_LEASE_MS` (30 s) and a peer reclaimed via the stale-claim predicate at `:154` — leaves `attempts` unchanged, so the row is re-claimed at the same count and `attempts >= maxAttemptsFor(row.action)` at `:228` is never satisfied. The per-row `catch {}` at `:242-245` has the same effect for a systematically failing tx2.
- **Why it matters:** `MAX_ATTEMPTS` exists to terminate a bad row, and this makes it unreachable for exactly the failure class it most needs to bound. A handler that reliably kills the worker produces an infinite crash/restart/reclaim loop, and since the claim query is `ORDER BY created_at` the poison row is claimed first on every pass, delaying the rest of the batch each cycle. In a multi-worker deployment, lease expiry becomes unbounded re-execution of the external side effect once per 30 s, with the UUIDv5 idempotency key as the only defence. The `catch {}` path also records no `last_error`, so such a row is indistinguishable in the admin outbox listing from one never attempted.
- **Recommendation:** Move the increment into the claim — add `attempts = outbox.attempts + 1` to the tx1 UPDATE (the `RETURNING attempts` at `:159` then yields the post-increment value) and use `row.attempts` at `:171`. Every claim, completed or abandoned, then costs one attempt. This does not conflict with the deliberate "do not mark the row from the catch" rule at `:163-168`; it is not a second write.

#### ARCH-2 — Timer and resolution workers requeue a failing instance with zero delay

- **Severity:** Medium
- **Location:** `src/engine/timers.ts:30-57`; `src/engine/resolution.ts:59-106` (requeue at `:74-75`, invoked at `:86` and `:100`)
- **Description:** `drainTimers` selects due rows `ORDER BY next_timer_at LIMIT 100` and, on any per-instance failure, leaves the row untouched: a resolver miss is `continue`, any throw is swallowed by `catch {}` (`:53-56`), and `next_timer_at` is still due — so it is re-selected every 500 ms forever. `drainResolutions` has the same shape with an explicit immediate requeue to `resolve_state = 'pending'`, against a scan ordered `ORDER BY instance_id LIMIT 100`. Neither worker has any delay or attempt counter, unlike the outbox, which has `next_attempt_at`, `attempts` and `backoffMsFor`.
- **Why it matters:** Both scans are capped at 100 and ordered by a key a stuck row keeps winning, so a persistent per-instance fault never drops out of the batch. Realistic triggers exist: `instanceSchema.parse` failing on a stored body after a schema tightening (the exact hazard `CLAUDE.md` cites as the reason duration validation moved to the write path), a missing `definitions` row after a partial restore, or `resolution.ts:92-93`'s hash-mismatch throw. One hundred such rows permanently occupy the entire batch and no other instance's timer ever fires again; below that threshold each stuck row is still a permanent 2 Hz write loop against Postgres with no diagnostic. Observability is roadmap #15 (NOT STARTED), so the missing *log* is not the finding — the missing *progress marker* is, because it converts a per-instance fault into engine-wide starvation.
- **Recommendation:** Give both workers the bounded-retry shape the outbox already has. Timers: on failure push the row out of the scan, predicated on the observed value so a concurrent re-arm is not clobbered — `UPDATE instances SET next_timer_at = now() + interval '1 minute' WHERE instance_id = $1 AND next_timer_at = $2`. Resolution: do not requeue to immediately-eligible `pending`; leave the row `claimed` and let the existing lease predicate be the retry cadence, or add a `resolve_next_at` column mirroring `outbox.next_attempt_at`.

#### ARCH-3 — Authored bodies silently drop unknown keys instead of rejecting them

- **Severity:** Medium
- **Location:** `src/schema/definition.ts:531-541`; `src/schema/compile.ts:111-115`
- **Description:** Every object in the contract is a plain `z.object(...)` (Zod 3 default `strip`), including `processBody`, `step`, `path`, `action` and `timer`. `compileProcessBody` hashes and stores the parse *output*, so an unrecognized key is discarded with no diagnostic and the published definition differs from what the author wrote. The same module uses `.strict()` for `InstanceEvent` payloads (`:818-819`) with the rationale that "an extra or missing key is a parse error rather than a silently mismatched record" — the authored write path, where a typo changes process *semantics*, is the lenient one.
- **Why it matters:** Reproduced by execution: a path authored with `gaurd` compiles to a path with **no guard at all** — a conditional transition silently becomes an unconditional default. The same mechanism deletes misspelled `onEntry`/`onExit` side effects and turns a misspelled `terminal` into a non-terminal step. With Process Studio's JSON surface a first-class authoring path, hand-written JSON is normal input. The stated reason for stripping (compile.ts:15-19) is about hash/read reproducibility, which requires the **read** schema to strip, not the **write** schema.
- **Recommendation:** Build `authoredProcessBody` from a deep-`.strict()` variant of the object schemas (or add an unknown-key walk to `compileProcessBody` reporting located issues in the `DurationIssue` style), leaving `processBody.parse` on stored bodies stripping as today. This must also cover the `publishedProcessBody` branch — the branch SEC-3 shows is reachable with authored input. Ship a test that rejects a body with a misspelled `guard`.

#### ARCH-4 — Subprocess `outputMapping` keys and `ProcessContract` field lists are never resolved against the catalog

- **Severity:** Medium
- **Location:** `src/schema/definition.ts:407` and `:524-528`; check absent from the superRefine at `:626-655`
- **Description:** `CLAUDE.md` states "All `id` references resolve within the process" as an enforced authoring-time invariant. Two positions are not resolved: (a) `SubprocessSpec.outputMapping` keys are parent `FieldId`s, but the superRefine resolves only `Action.output` targets, and `validateCrossProcess` checks `inputMapping` against the child contract while nothing checks `outputMapping` against the parent's own catalog; (b) `ProcessContract.inputFields`/`outputFields` are bare `z.array(fieldId)` resolved nowhere — `src/cel/check.ts:78-80` explicitly defers to a check that does not exist.
- **Why it matters:** Verified by execution: a body with `outputMapping: { field_does_not_exist: ... }` and bogus contract field ids passes the schema cleanly. At runtime `evalFieldMap` produces a patch under that id and the parent UPDATE writes it via `jsonb_set` under an id no field declares — unreachable from every view and every guard, so the parent's outcome-driven paths never see the intended value. A bogus id in `contract.outputFields` shrinks the child-data schema `contractFieldSchema` builds, turning a legitimate `child.data.<key>` reference into a confusing "unknown field" publish error attributed to the *parent*.
- **Recommendation:** Add both resolutions to the `processBody` superRefine beside the existing "action output targets unknown field" loop (definition.ts:646-650), and mirror `test/validate.test.ts`'s existing `Action.output` suite for the two new positions.

### Code Quality

#### CQ-1 — Accessibility: primary navigation in three apps is mouse-only

- **Severity:** High
- **Location:** `packages/app/src/screens/TasksScreen.tsx:112`; `packages/admin/src/screens/InstancesScreen.tsx:96`; `packages/admin/src/screens/TimersScreen.tsx:79`; `packages/studio/src/panels/StepsPanel.tsx:110`; `packages/editor/src/panels/StepsPanel.tsx:99`
- **Description:** `<li className="app-task-row" onClick={...}>` is the only way to open a task; `<tr className="admin-row-clickable" onClick={...}>` is the only way to drill into an instance or timer; `<div className="step-card-header" onClick={...}>` is the only way to expand an existing step. None carries `tabIndex`, `role`, `onKeyDown`, or a nested link/button. A repo-wide grep for `tabIndex|onKeyDown` across all five packages returns two hits — both the same Enter-to-add input duplicated in editor and studio `ContractPanel.tsx:99`. In Studio the alternative route, `CanvasView.tsx`, is entirely `onPointerDown`/`onPointerUp`-driven with no focusable element, so it is not a keyboard fallback. `CLAUDE.md`'s Conventions section explicitly requires semantic HTML5 over div/span soup and routes all UI work through the design skills.
- **Why it matters:** A keyboard-only or screen-reader participant cannot open **any** task in `packages/app` — WCAG 2.1.1 Keyboard, Level A, a total block on the app's sole purpose. An operator cannot drill into any instance or timer. A Studio author cannot expand a pre-existing step (a step added in the current session *is* reachable, via `addStep`'s `setExpanded` at StepsPanel.tsx:65 — which is why the fix is the header element itself).
- **Recommendation:** Wrap the identifying cell in a real `<button type="button">` (or `<a href>`) and drop the row-level `onClick` — the row stays hoverable via CSS while the target becomes focusable, announced and Enter/Space-operable. For both `StepsPanel` accordion headers use the disclosure pattern: `<button type="button" aria-expanded={isOpen} aria-controls={bodyId}>`.

#### CQ-2 — Accessibility: `form-ui` conveys required/invalid visually only, and renders the raw issue discriminator

- **Severity:** Medium
- **Location:** `packages/form-ui/src/FieldForm.tsx:128-147`
- **Description:** The `control` built at lines 84-126 never receives `required`, `aria-required`, `aria-invalid` or `aria-describedby` on any of its seven branches; a repo-wide grep for those four attributes across all five packages returns zero hits. Requiredness is conveyed only by `<span className="form-ui-required-marker" title="required">*</span>`, and validation issues render as `<li key={i}>{issue.kind}</li>` — the raw discriminator, so a user reads `missing-required` or `option-not-in-list` verbatim, while `packages/app/src/errors.ts:17` `describeError` already exists as the localized-message layer for every other error in the same app. Secondary defect at the same site: the `<ul>` sits **inside** the wrapping `<label>` (line 129), which permits phrasing content only — invalid HTML that also folds error text into the control's accessible name. Because `form-ui` is deliberately the one renderer shared by `packages/app` and the editor Player, every participant-facing form inherits this.
- **Why it matters:** A screen-reader user is not told which fields are required, gets no `aria-invalid` signal, and the only announcement of an error is an internal enum smuggled into the accessible name via invalid markup. Sighted users read an untranslated discriminator as their error message.
- **Recommendation:** Thread state onto `control` (or a single wrapper): `aria-required`, `aria-invalid`, `aria-describedby={issues.length ? \`${def.id}-issues\` : undefined}`; move the `<ul id={...}>` out of the `<label>` to a sibling so the markup is valid; map `issue.kind` through a catalog entry the way `packages/app/src/errors.ts` already does for transport errors.

#### CQ-3 — `DraftToolbar`'s publish dirty-gate goes permanently stale after a conflict reload

- **Severity:** Medium
- **Location:** `packages/studio/src/panels/DraftToolbar.tsx:88-94`
- **Description:** `savedBody` is seeded once at mount (line 31) and advanced only on a successful save (line 53). `reload()` calls `replace(record.body as Draft)` and `onSaveState(applyReload(...))` but never calls `setSavedBody`. After a 409-then-reload — the exact flow the conflict banner at lines 121-128 exists to drive — `draft` holds the freshly-fetched server body while `savedBody` still holds the discarded local edits, so `isDirty` (a plain `JSON.stringify` inequality in `publishGateLogic.ts:11`) compares two unrelated bodies and returns true for a draft byte-identical to what the server stored. `DraftToolbar` is not remounted by `replace()`, so the false-dirty state persists for every subsequent publish attempt.
- **Why it matters:** Publish then always fires the `confirm(t("draftToolbar.publishConfirmSave"))` prompt on a clean draft. Accepting re-PUTs the just-fetched body, bumping the stored revision for nothing and invalidating any concurrent editor's in-flight revision; declining silently aborts a publish the user was entitled to make.
- **Recommendation:** Add `setSavedBody(structuredClone(record.body as Draft));` inside `reload()` immediately after line 92 — reload is by definition a point where current and saved coincide, the same invariant the mount seed and the post-save advance already encode. `publishGateLogic.ts` is pure and unit-tested; there is no `DraftToolbar` component test, which is why the wiring bug is untested. Add one covering conflict → reload → publish-without-prompt.

#### CQ-4 — `FieldDef.key` — the identifier every CEL expression uses — has no format constraint

- **Severity:** Low
- **Location:** `src/schema/definition.ts:263`
- **Description:** `key` is `z.string()` with no non-empty and no identifier constraint, even though it is exactly the name registered as a CEL variable (`out[f.key] = celType(f.type)`, `src/cel/check.ts:62-68`) and the key `buildGuardContext` re-keys instance data onto. By contrast, data-source keys — registered as CEL variables nowhere — do get a reserved-namespace check (definition.ts:615-618).
- **Why it matters:** An empty or non-identifier key (`""`, `"my-field"`, `"true"`) publishes cleanly and makes the field unreferenceable from CEL: `data.my-field` is a parse error, so the failure surfaces on some unrelated expression rather than on the field that caused it.
- **Recommendation:** Constrain `key` to `/^[a-z_][a-z0-9_]*$/` on the write path (`authoredProcessBody`/the compile pass, not the shared read schema, per compile.ts:54-67's placement rule) and ship the rejecting test the repo's convention requires. Apply the same to `Step.key`/`Path.key` if they are ever used as identifiers.

### Performance

#### PERF-1 — `history_entries` has no index on its only query predicate

- **Severity:** Medium
- **Location:** `src/engine/store.ts:34-39` (table, no index) vs `:50` (sibling table indexed)
- **Description:** `initSchema` creates `history_entries (id, instance_id, transition_seq, entry)` and nothing else; a grep of every `CREATE INDEX` in `src/` (11 hits) returns none on this table. The structurally identical sibling created sixteen lines below gets `instance_events_instance_idx ON instance_events (instance_id, transition_seq)`. The two hot predicates against `history_entries` are exactly that missing key: `appendOutcome`'s `UPDATE ... WHERE instance_id = $1 AND transition_seq = $2` (`src/engine/outbox.ts:131-133`) and `getInstanceRecord`'s `WHERE instance_id = ...` (`src/runtime/api.ts:737`), whose `UNION ALL` counterpart over `instance_events` *is* indexed.
- **Why it matters:** `appendOutcome` runs on every delivered and dead-lettered outbox row, inside tx2 while it holds the outbox row lock — so the scan cost converts directly into lock-hold time and caps outbox throughput. `history_entries` is append-only with no pruning path anywhere, so the scan grows monotonically with lifetime transition volume across all instances.
- **Recommendation:** Add the mirror index right after the CREATE TABLE, matching the additive-DDL convention already in use:

```ts
await db`CREATE INDEX IF NOT EXISTS history_entries_instance_idx ON history_entries (instance_id, transition_seq)`;
```

#### PERF-2 — Child-instance lookup has no supporting index; every cancel cascade sequentially scans `instances`

- **Severity:** Medium
- **Location:** `src/engine/transition.ts:526-528`; `src/engine/migration.ts:431-437`; index set at `src/engine/store.ts:147-161`
- **Description:** `sweepCancelledChildren` runs `SELECT ... FROM instances WHERE body->'parent'->>'instanceId' = $1 AND body->>'status' = 'running'`, and `migrateOne`'s live-child gate uses the same expression. `initSchema` builds expression indexes for every *other* jsonb-nested predicate it needs — `instances_selection_idx`, `instances_claimed_by_idx`, and a GIN index on `body->'assignment'->'candidates'` — but none on `body->'parent'->>'instanceId'`, and `instances_selection_idx` does not cover it (leading column is `processId`).
- **Why it matters:** `cancelInstance` calls this sweep on every cancel and recursively once per nesting level, so cancelling a nested chain is one full scan of `instances` per level — inside the caller's transaction, holding instance row locks. `instances` is never pruned (completed and cancelled rows stay), so the scan grows with lifetime volume, not live volume. Three sibling jsonb predicates all got purpose-built indexes with explanatory comments, making this a consistency gap rather than a decision.
- **Recommendation:** `CREATE INDEX IF NOT EXISTS instances_parent_idx ON instances ((body->'parent'->>'instanceId'))` in `initSchema` next to the assignment indexes, with a comment naming its two readers.

#### PERF-3 — Studio canvas has no memoization: full BFS layout and every node/edge subtree re-run on each pointermove

- **Severity:** Low
- **Location:** `packages/studio/src/canvas/CanvasView.tsx:125-128` (with `:64`, `:71`, `:216`, `:276`)
- **Description:** `onNodePointerMove` calls `setNodeDrag({...nodeDrag, current: toSvgPoint(e)})` on every pointermove. The component body has no `useMemo`/`React.memo` anywhere: `autoPlaceSteps(...)` at `:64` and the `nodePositions` `filter().map()` at `:71` are bare expressions re-evaluated on every render, and the two `steps.map(...)` blocks at `:216`/`:276` re-create every edge and node `<g>` when only one node's `transform` changed.
- **Why it matters:** O(steps + paths) SVG elements re-render per pointer event on the surface where dropped frames are most visible. Bounded in practice and unmeasured: `autoPlaceSteps` early-returns `{}` once every step has a layout entry (`layout.ts:29-30`), and its BFS is O(tens) on realistic process sizes.
- **Recommendation:** Wrap `autoPlaced` and `nodePositions` in `useMemo` keyed on `[steps, initialStepId, layout]` — neither reads `nodeDrag`, so both are pure waste during a drag. If profiling still shows a problem, extract the node `<g>` into a `React.memo` child taking `{step, x, y, isSelected, isInitial, isTerminal}`.

### Error Handling

#### ERR-1 — No per-delivery deadline: one unresponsive handler permanently halts all outbox delivery

- **Severity:** High
- **Location:** `src/engine/outbox.ts:179`; `src/engine/poll.ts:8-16`; `src/handlers/http.ts:61-64`, `:74-76`, `:90-97`; `src/engine/host.ts:68`
- **Description:** `drainOutbox` awaits `deliverFn(row, registry)` sequentially with no engine-imposed deadline, and `pollForever` awaits the whole tick before scheduling the next (`await tick(); if (!stopped) timer = setTimeout(loop, intervalMs)`), so a tick that never returns is never followed by another. The only bound on handler runtime is author-supplied and optional: `const controller = ctx.action.timeout ? new AbortController() : undefined;` over `timeout: duration.optional()` (definition.ts:328) — the default is an unbounded `fetch`. `startEngine` creates exactly one outbox worker. Two aggravating details: the abort timer is cleared in `finally` *before* the body is read (http.ts:74-76), so even an action that *does* declare `timeout` can hang at `await response.json()`; and the response body is read with no byte budget before being persisted into jsonb via `Action.output`.
- **Why it matters:** A target that accepts the TCP connection and never responds hangs `deliverFn` forever. `drainOutbox` never returns, the poll loop never reschedules, and with one worker per process **all** action delivery stops engine-wide — including the engine-internal `core.spawnSubprocess`/`core.returnSubprocess` rows, so every subprocess parent parks at its wait-state permanently and every `Action.output` writeback stops. `stop()` does not recover it: it clears a `setTimeout` that is not pending while the tick is in flight. `CLAIM_LEASE_MS` reclaim does not help either — the only worker that could reclaim is the stuck one. This needs no attacker: an ordinary integration endpoint that stops responding (not one that *errors* — that path is handled) is sufficient.
- **Recommendation:** Impose a deadline no handler can opt out of, using the lease the claim already carries, and let the rejection fall into the existing transient-failure branch (outbox.ts:234-240):

```ts
patch = await Promise.race([deliverFn(row, registry), rejectAfter(leaseMs)]);
```

Independently, give `http.request` an unconditional default timeout when `ctx.action.timeout` is absent (a module constant well under `CLAIM_LEASE_MS`), keep the `AbortController` armed across the body read rather than clearing it in `finally`, and cap the response body (reject on an over-limit `content-length`, or read the stream with a byte budget). Note the SSRF dimension of this handler is a documented, argued trade-off (`docs/superpowers/specs/2026-07-24-http-action-handler-design.md:43`, `:181-186`) — but its own stated revisit condition ("revisit only if definitions could originate from a less-trusted authoring source") has arrived now that Studio publishes over HTTP from a browser.

#### ERR-2 — Non-401 API failures become unhandled rejections; screens render affirmatively wrong empty/loading states

- **Severity:** High
- **Location:** `packages/admin/src/screens/InstancesScreen.tsx:29-34`; same pattern at `InstanceScreen.tsx:81,96,113`, `OutboxScreen.tsx:39,59,77,90`, `TimersScreen.tsx:30,45`, `UsersScreen.tsx:27,46`, `app/TasksScreen.tsx:47,62`, `app/StartScreen.tsx:36`, `studio/EditScreen.tsx:148`, `studio/VersionsScreen.tsx:35`, `studio/ProcessesScreen.tsx:24,40,53`, `studio/MigrationPlanScreen.tsx:40`
- **Description:** 22 occurrences of `if (err instanceof XClientError && err.status === 401) onUnauthorized(); else throw err;` inside an `async` callback or `.catch()` handler (plus further `else throw e` variants). Rethrowing there cannot reach a React error boundary — and a grep for `componentDidCatch|ErrorBoundary|getDerivedStateFromError|unhandledrejection` across all five packages returns **zero** matches. The client wraps network failures as `new AdminClientError({type:"internal", ...})` with no `status` (`admin/src/api/client.ts:60-62`), and any 5xx/403/422 also has `status !== 401`, so an outage takes the rethrow branch. `finally { setLoading(false) }` still runs, so `InstancesScreen.tsx:80` renders `No instances match these filters.` and `VersionsScreen.tsx:95-96` renders `No published versions yet.` — indistinguishable from a genuinely empty result. `studio/EditScreen.tsx` is worse: the throw at `:148` leaves `record` at the initial `"loading"` sentinel, so `:155-157` renders `Loading…` permanently with no retry.
- **Why it matters:** An operator reading `/instances` during a database or network outage is told the system is idle rather than that the query failed — the single worst answer for an operations console. The failure is silent in all four SPAs, including the two whose job is to report system truth.
- **Recommendation:** `packages/app/src/screens/TaskScreen.tsx` already has the correct shape (`withErrorHandling` at line 36 + `describeError`). Replace `else throw err` with `else setError(describeError(err.error, locale))` (or the per-app equivalent) and gate every empty state on `items.length === 0 && !loading && !error`. In `studio/EditScreen.tsx` set `record` to an explicit error sentinel rather than leaving `"loading"`. Add one `ErrorBoundary` per app around the routed screen as a backstop for render-time throws.

#### ERR-3 — The 500 fallback reflects arbitrary internal error text while logging nothing server-side

- **Severity:** Medium
- **Location:** `src/http/errors.ts:80-81`
- **Description:** `mapError`'s final branch returns `err.message` verbatim for every unrecognized throw. The passthrough is deliberate for the narrow untyped *not-found* case (`openspec/specs/http-wrapper/spec.md`; errors.ts:6-7), but the branch is unconditional, so it also reflects whatever `Bun.sql`, `JSON.parse` or a plugin handler throws — Postgres errors carry relation, column and constraint names. `PinMismatch` is separately mapped to a 500 carrying both definition hashes (errors.ts:56 + `src/engine/store.ts:396`). Compounding it, the HTTP layer logs nothing: `grep -rn 'console\.' src/` finds only `src/auth/cli.ts` and the startup banner at `server.ts:382`.
- **Why it matters:** The asymmetry is backwards — the client gets the diagnostic detail and the operator gets nothing, so a probing campaign and a genuine production fault both leave zero server-side trace. The `/admin/*` routes exist to give operators visibility, and unexpected failures are the one class they cannot see. Exposure grows automatically with every new unmapped error type.
- **Recommendation:** In the fallback branch, `console.error` the full error (message + stack, plus method and path threaded from `server.ts`) and return `{ error: { type: "internal" } }` with no message — the message-free shape `ConcurrencyConflict` already uses at errors.ts:73-75. To keep the spec-pinned not-found scenario, introduce a `NotFoundError` in `src/errors.ts` for the untyped throws in `api.ts` (169, 215, 219, 481, 574, 578, 597) and add it to `MESSAGE_ERRORS` at status 500; update the spec scenario and its pinning test to reference the typed error rather than the blanket fallback.

#### ERR-4 — Submitting to a non-running instance discards the data and returns success

- **Severity:** Medium
- **Location:** `src/engine/transition.ts:447`; `src/runtime/api.ts:561-599`; `src/http/routes.ts:90`
- **Description:** `commitManualTransition` opens with `if (instance.status !== "running") return instance;`. `submitAndTransition` row-locks the instance, resolves and hash-checks the body, enforces the claim, validates the data, and calls `commitManualTransition` — without ever inspecting `instance.status`. For a `cancelled`, `completed` or `faulted` instance the call returns the untouched instance, the enclosing `withTransaction` commits with zero writes, and `routes.ts:90` returns it as a normal 200. `updateAssignment` has the same shape for claim/release (transition.ts:870).
- **Why it matters:** The engine-level no-op is deliberate and tested, but the API-boundary consequence is a success response for an operation that did nothing. `test/runtime-api.test.ts:652-675` encodes exactly this: two concurrent `submitAndTransition` calls both resolve fulfilled, one commits, and the comment states the loser relies on "commitManualTransition's existing non-running no-op" — a lost update reported as success, with the losing participant's form data discarded under a 200. The permanent variant is a `faulted` instance (parked by the cascade loop guard at transition.ts:713-716): every subsequent submission returns 200 forever with the data thrown away. The shipped UI mitigates the participant path (`getInstanceView` returns `availablePaths: []` for a non-running instance), but cannot prevent the concurrent-submit loser.
- **Recommendation:** Reject at the runtime-API boundary rather than no-op. After `parseInstance` at api.ts:575, `if (instance.status !== "running") throw new InstanceNotRunningError(instanceId, instance.status)`, mapped to 409 in `routes.ts` alongside the existing `NotClaimedError`/`NotClaimantError` mappings; same in `updateAssignment`. Keep the engine-level no-op for internal idempotent re-entry. `test/runtime-api.test.ts:652-675` must change to assert one fulfilled + one 409 — that assertion is the current contract and must change deliberately.

#### ERR-5 — HTTP request bodies are cast, not parsed, on submit and create

- **Severity:** Medium
- **Location:** `src/http/routes.ts:89` (submit), `:59` (create)
- **Description:** Both handlers do `(await req.json()) as {...}` with no validation. Two traced failures: (a) `POST /instances/:id/submit` with no `data` reaches `validateSubmissionData`, whose `Object.keys(data)` (`api.ts:412`) throws `TypeError: Cannot convert undefined or null to object` — the preceding merge `{...instance.data, ...data}` tolerates `undefined`, so nothing catches it first — mapped to 500; (b) malformed JSON throws `SyntaxError` from `req.json()` → 500, whereas `handlePublish` (routes.ts:221-225) and `handleLogin` both deliberately map exactly that condition to 400 `request-shape`. The repo already has the tool: `RequestShapeError` is used by `parseLimit`/`parseStatuses`/`parseScope` and maps to 400. No test covers a malformed or incomplete body on either route.
- **Why it matters:** Client mistakes are reported as server faults — monitoring alerts fire on caller errors and an operator cannot distinguish an engine defect from a bad request. The *same* client error yields 400 on publish and 500 on submit.
- **Recommendation:** Parse both bodies with Zod and throw `RequestShapeError`, exactly as `handlePublish` already does: `{ pathId: z.string(), data: z.record(z.unknown()).default({}) }` for submit, `{ version: z.number().int().positive().optional(), data: z.record(z.unknown()).optional() }` for create. Add tests for submit with no `data`, no `pathId`, and malformed JSON on both, each expecting 400.

#### ERR-6 — `Action.output` writebacks are shape-checked at neither publish nor delivery

- **Severity:** Medium
- **Location:** `src/engine/outbox.ts:217-222`; publish-side gap at `src/cel/check.ts:181-184`
- **Description:** Output sites are collected with no `expect` type, so an output expression's inferred type is never compared against the target field's declared type — while the sibling timer-deadline site passes `expect: "string"` (check.ts:218) and `validateMigrationSpec` looks the target field up and compares (check.ts:369-396). At delivery, the writeback is a raw `jsonb_set` with no validation at all, unlike a participant submission, which goes through `typeMatches`/`optionValuesValid`/`checkConstraints`.
- **Why it matters:** An external handler returning `"5"` where a `number` field is declared writes a string into `data` permanently. Guards reading that field were type-checked as `double` at publish, so at runtime the comparison raises, `evalGuard` catches it and returns `false` (`src/cel/eval.ts:155-162`), and the instance parks on the wait-state with no fault event and no dead-letter — the "silent, per-instance, parked forever" failure that `src/engine/definitions.ts:176-181` names as the reason publish-time validation exists. It also leaves `data` in a state the submission validator would have rejected.
- **Recommendation:** Enforce at delivery, where it can bite: in `drainOutbox`'s writeback loop (outbox.ts:199-224), check each patch value against the target field's declared type using the existing `api.ts::typeMatches` logic, and drop-with-an-outcome rather than write on a mismatch. Adding `expect` at the publish site is worth doing for consistency but catches very little on its own — the output environment registers `result` as `dyn` (check.ts:117-119), so the common `result.foo` infers `dyn` and passes regardless.

#### ERR-7 — A declared-but-unwritten field is total in a guard and fatal in a subprocess mapping

- **Severity:** Medium
- **Location:** `src/cel/eval.ts:219-228`
- **Description:** `buildGuardContext` populates `data` only with keys present in `instance.data`, and cel-js raises on a missing map key (verified: `evaluate("data.foo", { data: {} })` throws `EvaluationError: No such key: foo`). `evalGuard` swallows that and returns `false` — the documented wait-state idiom — and `evalTransforms` swallows it per entry, its docblock naming the cause explicitly ("a transform that raises — most often reading a field the mid-flight instance never wrote"). `evalFieldMap`, used for both subprocess `inputMapping` and `outputMapping`, throws instead. Nothing at publish can distinguish "declared" from "always written": the catalog has no such notion and requiredness lives per-step in the view.
- **Why it matters:** A subprocess step whose `inputMapping` reads an *optional* field publishes cleanly (the field is declared, so it type-checks) and fails at runtime whenever that field is unset: the `core.spawnSubprocess` row throws, retries — re-running the handler's work each time — dead-letters, and leaves the parent parked with no `instance.faulted` event, only an `ActionOutcome` buried in the record. The same input that parks a guard benignly kills a mapping terminally. The code's stated justification ("surfacing an authoring error rather than silently dropping the field", eval.ts:215-217) is false for the case that actually occurs, and the repo already conceded the identical hazard on the transforms path.
- **Recommendation:** Make `evalFieldMap` total per entry the way `evalTransforms` is (eval.ts:122-146): return `{ patch, drops }`, skip the target on a raise, and have the caller record a `mapping.entry-dropped` event, sibling to `migration.transform-dropped`. If fatality is genuinely intended, say so in `CLAUDE.md` next to the guard-totality rule — the two currently contradict — and document `has(data.x) ? data.x : <default>` as the required idiom (verified to work).

#### ERR-8 — Pagination cursors are client-supplied blobs decoded with `JSON.parse` and no validation

- **Severity:** Low
- **Location:** `src/runtime/api.ts:163-165`; consumers at `:677`/`:697-698` and `:731-732`/`:743-744`
- **Description:** `decodeCursor` base64url-decodes and `JSON.parse`s caller-controlled input with no shape check, and the destructured elements go straight into Postgres casts (`${cursorCreatedAt ?? null}::timestamptz`, `Number(cursorSeqRaw)` → `${cursorSeq}::int`, where `Number("x")` is `NaN`). A cursor that is not base64, not JSON, or JSON of the wrong shape produces an uncaught `SyntaxError` or a Postgres cast error, both falling through `mapError` to 500 on a route any authenticated actor can reach with `scope=mine`. No test covers a malformed cursor. SQL injection is not possible — Bun.sql tagged templates parameterise.
- **Why it matters:** A client that truncates, URL-mangles or replays a stale cursor gets a 500 instead of a 400 on two paginated reads a UI drives on every scroll, and the `internal` type prevents an operator from telling a bad cursor from an engine fault. Same defect class as ERR-5.
- **Recommendation:** Wrap the `JSON.parse` in try/catch, validate the decoded value is a string array of the expected arity, and throw `RequestShapeError` otherwise. `src/engine/admin-queries.ts` carries a duplicate pair of these helpers (already flagged as duplication in `PONYTAIL-AUDIT.md` finding 9) — extract once and import rather than fixing twice. Add a test asserting `GET /instances?cursor=%%%` is 400.

#### ERR-9 — `bun run serve` never creates the database schema

- **Severity:** Low
- **Location:** `src/engine/store.ts:26-28`
- **Description:** `initSchema` owns all DDL — `instances`, `history_entries`, `instance_events`, `outbox`, `auth_users`, drafts, migration plans. Grepping every caller across `src/`, `scripts/` and `packages/` returns exactly two non-test sites: its own definition and `scripts/demo-expense-approval.ts:42`. Neither `startHttpServer` nor `startEngine` calls it — `server.ts:377-382` goes straight from `parseAllowedOrigins` to `Bun.serve` to `startEngine`. `src/auth/cli.ts` does not call it either, so `add-user` against a fresh database also fails. The client is built at module load from `process.env.DATABASE_URL ?? ""`, deferring a config error to the first query as well.
- **Why it matters:** `"serve"` is a first-class documented script, but pointing it at any database that has not previously had `bun test` or the demo script run against it fails with a relation-does-not-exist error at *request* time. ROADMAP stages 14 (packaging) and 19 (seed *data*) are deliberately deferred and neither covers schema DDL.
- **Recommendation:** `await initSchema(db)` inside `startHttpServer` before `Bun.serve` — all statements are `CREATE ... IF NOT EXISTS`, so it is idempotent — or add a `migrate` script and document it in README's Develop block. Separately, replace `process.env.DATABASE_URL ?? ""` with a boot-time throw naming the variable.

### Testing

#### TEST-1 — No CI: typecheck, the DB-suite discipline, and the invariant tests run only when a human remembers

- **Severity:** Medium
- **Location:** `package.json:16-21`
- **Description:** There is no `.github/` directory and `git ls-files` matches no workflow, pipeline or git-hook file of any kind (checked for GitHub Actions, GitLab, Azure Pipelines, CircleCI, Jenkins, husky — zero hits). The `typecheck` and `test` scripts are well-formed and `typecheck` correctly fans out to every workspace package, but nothing invokes them on push or PR. Two repo-specific failure modes sharpen this beyond the generic complaint: (a) `bun test` without `DATABASE_URL` silently skips the DB-backed suites — 546 `skipIf` sites under `test/` — and reports a meaningless green, which `CLAUDE.md` calls out in bold; (b) `bun run typecheck` is a separate command because Bun does not typecheck, so a type error passes `bun test`. Neither `ROADMAP.md` nor `docs/current-state.md` mentions CI, so this is unowned rather than deferred.
- **Why it matters:** Every guardrail the repo invests in — the 546 DB-backed tests, `tsc --strict`, the publish-time validation suites, the "every invariant ships with a test that rejects a violating input" rule — is enforced by convention only.
- **Recommendation:** Add `.github/workflows/ci.yml` on push/PR: a `postgres:16` service with the compose credentials, then `bun install --frozen-lockfile`, `bun run typecheck`, and `DATABASE_URL=... bun test`. Fail the job if `DATABASE_URL` is unset so the silent-skip rule is machine-enforced rather than documented.

#### TEST-2 — Claim exclusivity is tested only sequentially, never concurrently

- **Severity:** Medium
- **Location:** `test/assignment.runtime-api.test.ts:96-101`; subject `src/engine/transition.ts:840-889`
- **Description:** `claimStep` guarantees mutual exclusion via `SELECT ... FOR UPDATE` in `loadForClaim`. The suite tests exclusivity only sequentially — claim, then a second claim afterwards expecting `AlreadyClaimedError` — which passes even if the `FOR UPDATE` is removed entirely, because the second call reads state the first already committed. The suite demonstrably knows how to write the real test: `runtime-api.test.ts:652`, `outbox.test.ts:297`, `timer.test.ts:262`, `migration.test.ts:942` are all genuine interleaved-transaction races — but not for claim/release, the one whose failure mode is a security property.
- **Why it matters:** If the row lock regressed (an added early return, an unlocked read, a refactor to optimistic concurrency), two candidates could both hold the claim and both pass `submitAndTransition`'s claimant check. The exclusive-task-ownership model would break silently with a fully green suite.
- **Recommendation:** `Promise.allSettled([claimStep(id, candidate), claimStep(id, roleActor)])`, asserting exactly one fulfils, one rejects with `AlreadyClaimedError`, and exactly one `assignment.claimed` row exists in `instance_events` — modelled on `test/timer.test.ts:262`. Add the mirrored release race. Both actors already exist in the file's fixtures.

#### TEST-3 — An authorization test asserts only what the response is *not*

- **Severity:** Low
- **Location:** `test/http.test.ts:1167-1171`
- **Description:** The test "POST /instances/:instanceId/cancel with the system:cancel-any role is authorized before any instance lookup, even for a nonexistent instance" asserts only `.not.toBe(403)` and `.not.toBe(401)`. It passes for 200, 400, 404, 500 or anything else. It is the sole negative-only status assertion in the file; every other authorization test asserts an exact status and `error.type` (e.g. the paired role-less test at `:1149-1154`).
- **Why it matters:** The property it guards — that a role-holding caller's failure mode differs from a role-lacking caller's, which is what the non-disclosure ordering in `cancelInstance` (api.ts:631-654) was written to preserve — is unpinned.
- **Recommendation:** Assert the exact contract: `expect(res.status).toBe(500)` and `expect(body.error.type).toBe("internal")` (the untyped not-found throw, per the http-wrapper spec), paired with the existing role-less 403 test — the pair is what proves the two paths differ.

### Dependencies

#### DEP-1 — `zod` is imported at runtime by six engine modules but declared only as a root devDependency

- **Severity:** Medium
- **Location:** `package.json:22-26`
- **Description:** The root manifest puts `"zod": "^3.23.8"` in `devDependencies` while `dependencies` holds only `@marcbachmann/cel-js` and `jose`. Six files under `src/` import zod as a runtime value: `src/schema/definition.ts:14`, `src/engine/host.ts:24`, `src/engine/registry.ts:7`, `src/engine/registry-check.ts:17`, `src/handlers/http.ts:8`, `src/http/errors.ts:32`. The root `exports` map publicly exposes `./schema` and all five entry points transitively reach `definition.ts`, so every consumer of `workflow-engine/schema` needs zod at runtime — including `packages/form-ui/src/locale.ts:1`, consumed by `packages/app`, whose manifest declares no zod. `packages/studio` and `packages/editor` declare it; `app`, `admin` and `form-ui` rely on workspace hoisting.
- **Why it matters:** The declaration is simply wrong. Any install that omits dev dependencies — `bun install --production`, or the slim engine image ROADMAP stage 14 will build — yields `Cannot find module "zod"` on the first import of `definition.ts`. It is a mis-declared contract, not a missing feature, so stage 14 will inherit it rather than surface it.
- **Recommendation:** Move the `zod` line to `dependencies` (one-line move, no version change). Add `zod` to `packages/app/package.json` and `packages/form-ui/package.json` (the latter as a `peerDependency`, matching how it declares react) so the bundle chain does not depend on hoisting.

#### DEP-2 — `@marcbachmann/cel-js` is the only load-bearing dependency not exactly pinned

- **Severity:** Low (unverified)
- **Location:** `package.json:28`
- **Description:** `"@marcbachmann/cel-js": "^8.0.0"`, resolved to 8.0.0 in `bun.lock:245`. It is a scoped single-maintainer package that `CLAUDE.md` makes maximally load-bearing on purpose ("Use ONE CEL library for both the editor and the engine so there is no semantic drift"), backing both `src/cel/check.ts` (publish-time type-check) and `src/cel/eval.ts` (runtime evaluation, `Action.output` writeback, migration transforms). The repo pins exactly where it matters elsewhere (`"typescript": "5.6.2"`; `BUN_VERSION=1.3.11`). Note `bun.lock` is committed, so a plain `bun install` does **not** drift — this requires `bun update`, a lockfile-invalidating manifest edit, or an install with no lockfile, which is why it is a consistency argument rather than an observed hazard.
- **Why it matters:** The blast radius is amplified by guard totality: `eval.ts:157-161` wraps evaluation in `try { ... } catch { return false; }` and the transform path degrades to a recorded drop, so an evaluation-semantics change does not throw — it silently reroutes or parks already-published, immutable bodies whose `definitionHash` guarantees the body never changed. That is the hardest class of regression to attribute.
- **Recommendation:** Change to `"@marcbachmann/cel-js": "8.0.0"`, matching the `typescript` style already in the same file, and note the reason next to `CLAUDE.md`'s "ONE CEL library" rule so any upgrade is a reviewed commit that deliberately re-runs `test/cel.test.ts`.

### Documentation

#### DOC-1 — README prescribes a bare `bun test`; `docs/current-state.md` and `src/auth/cli.ts` claim no HTTP route administers users

- **Severity:** Low
- **Location:** `README.md:64-68`; `docs/current-state.md:539-541`; `src/auth/cli.ts:2-3`
- **Description:** Two verified contradictions. (1) README's Develop block is `bun install` / `bun test` / `bun run typecheck`, while `CLAUDE.md` states in bold that `bun test` must always run with `DATABASE_URL` set because the DB suites are `test.skipIf(!DB)` (546 sites) and "a green claimed without the variable is not evidence". (2) `docs/current-state.md:539-541` asserts in the present tense that users "are administered only from `src/auth/cli.ts` … no HTTP route creates, modifies or lists them", but `src/http/server.ts:319-329` registers `GET /admin/users`, `POST /admin/users/:id/disable` and `POST /admin/users/:id/enable` — and the same file's later entry (`:707-717`) describes exactly those routes. The stale claim is duplicated in code at `src/auth/cli.ts:2-3` ("there is no HTTP route for it"), against `CLAUDE.md`'s "Comments state facts" convention.
- **Why it matters:** README is what a new contributor reads first; following it produces a passing run that exercises well under half the suite while looking green — precisely the failure `CLAUDE.md` was written to prevent. The `current-state.md` contradiction gives a reader who stops at the first hit a false answer about the auth surface, in the file `CLAUDE.md` designates as the descriptive map.
- **Recommendation:** README:66 → `DATABASE_URL=postgres://postgres:postgres@db:5432/workflow_engine bun test`, with a one-line note that the DB suites skip silently otherwise. `docs/current-state.md:539-541` → "created and role-assigned only from `src/auth/cli.ts`; listing and disable/enable moved to HTTP — see the Admin area entry below". Narrow the `cli.ts:2-3` comment to creation, role assignment and password change.

## Positives

These are not throwaway compliments — several are patterns other codebases get wrong, and they materially reduced the size of this report.

**Engine correctness and concurrency**

- The state-before-side-effects contract is genuinely upheld: `applyStepEntry` inserts every outbox row inside the same transaction as the instance UPDATE and the HistoryEntry (`transition.ts:369-389`), and `createInstance` does the same for the seq-0 spawn — an action row cannot exist without its committed state change, nor be lost after one.
- Optimistic concurrency is a real predicate, not a convention: `WHERE instance_id = $1 AND transition_seq = $prev` with a zero-row check throwing `ConcurrencyConflict`, applied identically in `markFaulted` and `fireTimer`'s reminder branch (plus a `fired IS DISTINCT FROM 'true'` guard).
- The team correctly identified that the OCC token does not cover `data`, and *every* wholesale-`data` writer takes a row lock across its read and commit — `submitAndTransition`, `migrateOne`, the subprocess return handler. The reasoning is written down at `transition.ts:328-333` and actually followed at all three sites.
- Lock ordering is deliberate: `migrateOne` locks an instance's outbox rows before the instance row specifically to match `drainOutbox`'s order, which is what prevents a migration/delivery deadlock.
- Subprocess spawn and return are genuinely idempotent under at-least-once redelivery: the deterministic UUIDv5 child id makes a re-spawn collide on the PK, and the return handler re-checks `parent.currentStepId` under the parent's row lock.
- The automatic cascade is loop-guarded, and on detection parks the instance `faulted` under the same OCC predicate in one transaction with its `instance.faulted` event — the flip cannot land without its audit record.
- Migration avoids the obvious data-loss traps: renames computed from an immutable snapshot (so an A↔B swap survives), orphan keys retained rather than dropped, every dropped transform and unarmed timer recorded as an event in the same commit.
- `FOR UPDATE SKIP LOCKED` claim-with-lease is used correctly for both the outbox and the resolution worker, including stale-claim reclaim, with a CAS-on-`claimed` in tx2 so a late peer applies nothing.

**Contract and validation design**

- Validation placement is principled and consistently applied: checks that may tighten (durations, CEL, registry configs) live on the publish path, never as Zod refinements, so an already-published body stays readable and its pinned instances rehydratable. `compile.ts:54-67` and `definitions.ts:211-217` state the rule *and* the ordering precisely.
- The authoring and runtime CEL contexts derive from one source: `INSTANCE_SCHEMA` is exported from `check.ts` and `projectInstance` iterates its keys, so the runtime namespace cannot expose a field the author could not type-check, nor omit one they could.
- `collectFieldsDeep` is the single authoritative field-tree walk shared by `definition.ts`, `check.ts` and `eval.ts` — those three cannot resolve different field sets.
- Scope is expressed by which namespaces an environment registers, and the runtime mirrors it exactly: `buildOutputContext` returns `{ result }` alone against `buildEnv`'s result-only environment, with the reasoning written at both sites.
- Data sources are deliberately registered at no CEL site so a reference is an `unknown variable` *publish* error rather than a wait-state parked forever — the safe failure mode chosen and documented over the convenient one.
- Publish-time error types all collect every located issue rather than throwing on the first, so one rejection is fixable in one pass; `mapError` maps them to 422 with issues intact.

**Security posture that is already right**

- Every SQL statement in the reviewed paths uses Bun.sql tagged templates with bound parameters, including array binding and the complex `listInstances` filter. `sql.unsafe` and string concatenation into SQL appear nowhere in `src/`. The two dynamically-computed jsonb path arrays are built as JS strings and *bound*, not spliced.
- jsonb binding is correct and consistently so: objects bound directly, and every scalar write uses the `(${[val]}::jsonb) -> 0` array-wrap trick to avoid the jsonb-scalar-string trap the store's own comment documents.
- Passwords use `Bun.password.hash`/`verify` (argon2id, per-hash salt, constant-time verify) with no hand-rolled comparison and no added dependency.
- CORS is secure by default: unset `CORS_ALLOWED_ORIGINS` emits no headers at all rather than a wildcard, and allowlist mode echoes the request Origin only after membership is confirmed, with `Vary: Origin`. The doc comment names the unsafe reflection variant it is avoiding.
- No cookies and no ambient credentials anywhere — `Authorization: Bearer` only — so the API has no CSRF surface by construction.
- Every `/admin/*`, `/drafts` and migration-plan handler resolves the actor and calls `requireRole` before any read or write, with no gaps; `handlePublishDraft` correctly requires *both* `DEVELOPER_ROLE` and `PUBLISH_ROLE` rather than treating developer as implying publish.
- `scope=mine` cannot be paired with an explicit `assignedTo`, and `scope=all` requires admin — the horizontal-escalation path through the list filter is closed deliberately, with a comment saying so.
- `handlePublish` validates against the server's own `Registry`, never one the client supplies, and requires `PUBLISH_ROLE` before the body is even parsed.
- `Idempotency-Key` cannot be authored in `http.request` config; a definition trying to set it is a publish error rather than an unresolvable precedence conflict.
- Algorithm-confusion on the JWT path is genuinely not reachable (verified against the vendored jose).
- The login rate-limit check-and-increment is documented as needing to stay synchronous end-to-end so check and increment are atomic against concurrent requests — a subtle correctness property most implementations get wrong.

**Testing**

- **No mocking anywhere.** A repo-wide grep for `mock(`, `spyOn`, `jest.` returns zero hits across 41 suites; the JWKS branch runs against a real ephemeral `Bun.serve` keypair server and the http.request handler against a real capture server, with an explicit comment rejecting fetch mocking as proving only the mock's shape.
- Concurrency is exercised with real interleaved transactions where it matters: submit serialization and concurrent action writeback, outbox claim contention, double `fireTimer`, migration/delivery deadlock and locked-remap writeback, concurrent cancel sweeps.
- HTTP authorization coverage is systematic and per-route: every `/admin/*` and `/drafts/*` route has both a 401 and a 403 test, and the negative tests additionally assert *no side effect occurred*. `http-studio.test.ts:226/:233` even covers the role-independence pair in both directions.
- JWT verification failure modes are covered as failure modes: missing header, non-Bearer scheme, non-JWT string, expired, wrong key, unknown issuer, local issuer with no secret, wrong audience.
- Login rate limiting is tested both as a pure function (injected clock, window reset, fail-open boundary) and end-to-end through `handleLogin`, including normalization so case/whitespace variants share one bucket.
- `test/validate.test.ts` exercises the enforced invariants thoroughly — id/key uniqueness at full depth including collisions across nested groups, path-trigger consistency, `Action.output` resolution from all five action positions, and the duration grammar including the read-path/publish-path asymmetry.

**Frontend**

- `packages/form-ui` is a genuinely good seam: a source-only, no-build workspace package means what an author previews in the Player is literally the component tree a participant gets, and a fix lands once.
- Studio's live validation imports and runs the engine's own unmodified publish-time validators against the *compiled* body, rather than reimplementing a drift-prone second rule set — and dimensions that cannot be checked client-side report "not checked" instead of a false pass.
- Presentational role gates are explicitly commented as mirroring the server constant with "the server is the enforcement; this is presentational only" — the client check is never mistaken for authorization.
- Screen logic is consistently extracted into pure, separately unit-tested modules (twelve of them), keeping the untestable React/SVG wiring thin.
- `packages/app` never sends a client-supplied `assignedTo` — it issues `scope=mine` so the server alone decides what "mine" means; the admin console deliberately never renders an outbox action's `config`, which may hold credentials.
- Every path segment interpolated into a URL passes through `encodeURIComponent` in all three `api/client.ts` files, without exception.
- `TaskScreen.tsx`'s `withErrorHandling` is a well-built error funnel — it distinguishes 401 / validation / claim-lost / moved-on, reverts optimistic claim UI when the server disagrees, and guards against a second failure escaping during its own recovery refetch. It is the template ERR-2 should be fixed against.
- `JsonView.tsx` seeds its textarea once on mount with no resync effect and is unmounted when the Structure surface shows — mutual exclusion enforced by unmounting rather than by convention.
- The one `innerHTML` sink in the repo carries an eight-line comment naming the exact mitigation and where it was verified in the installed bundle, rather than an unexamined assumption.

**Infrastructure hygiene**

- The devcontainer `db` service publishes no host ports, so the `postgres:postgres` credentials are reachable only on the internal compose network; the container runs as non-root; the port-publishing `docker-compose.override.yml` is gitignored and confirmed untracked.
- `.gitignore` covers `.env`/`.env.*` with an `!.env.example` escape plus `.claude/settings*.json`; no `.env`, credential or key file is tracked anywhere.
- `bun.lock` is committed with sha512 integrity hashes for all 362 packages, with no `trustedDependencies` postinstall escape hatch — Bun's default of not running install scripts stays in force.
- Third-party versions are current: vite 6.4.3, esbuild 0.25.12, jose 6.2.4, zod 3.25.76, react 18.3.1, mermaid 11.16.0 — all past the known dev-server advisories in the vite/esbuild lines.
- License is consistent (`AGPL-3.0-or-later` in the root and all five package manifests, full text at `LICENSE`), and root `typecheck` correctly fans out to every workspace package.

## Open Questions / Assumptions

**Verification method and its limits**

| Area | How verified | Not verified |
|------|--------------|--------------|
| Schema / CEL | Findings SEC-3, SEC-4, ARCH-3, ARCH-4 **reproduced by executing the real schemas** (bun 1.3.11, repo `node_modules`, no DB, read-only scratchpad script; the working tree was not touched). ERR-7's premise verified against the vendored cel-js. | — |
| Auth / HTTP | Full read of `src/http/*`, `src/auth/*`, `src/handlers/http.ts`, plus the jose 6.2.4 source for the HMAC key-length and alg-confusion claims. | Whether Zod's `z.string().url()` accepts `file:` and Bun's fetch honours it — the local-file-read vector was **removed** from ERR-1 rather than asserted. |
| Engine core | Static read of the full control flow in `outbox.ts`, `poll.ts`, `host.ts`, `timers.ts`, `resolution.ts`, `store.ts`, and the relevant `transition.ts`/`migration.ts` sections. | Nothing executed — `CLAUDE.md` warns a `bun test` run truncates shared devcontainer state, so no verdict rests on a reproduction. |
| Frontend | Every cited file read; targeted greps and diffs across all five packages. | Apps not run; no Vite build, no browser, no axe pass, no profiler. PERF-3 is therefore explicitly unprofiled. Bundle weight of shipping the engine's zod schemas + cel-js into the Studio browser bundle was not assessed. |
| Deps / config | Read of `package.json` × 6, `bun.lock` (362 entries, spot-checked), tsconfig, devcontainer, `.gitignore`, README/ROADMAP/current-state. | **No `bun install`, `bun test` or `bun audit` was executed** — version and advisory statements come from reading `bun.lock`, not from running a resolver or scanner. Git history was not inspected for previously-committed secrets; DOC/secret claims cover the current tracked tree only. |

**Assumptions made**

- ROADMAP stages 14 (deployment packaging), 15 (observability) and 19 (seed data) are marked NOT STARTED and were treated as deliberately deferred — so "there is no production image", "there is no health endpoint", "there is no structured logging" and "there is no seed script" are **not** reported. Two items inside those areas *are* reported because they are gaps in the current run path rather than deferred stages: ERR-9 (schema bootstrap) and SEC-2 (fail-open auth default).
- Both SEC-2 and DEP-2 rest on documented deliberate decisions. They are reported anyway because in each case the *documented default is the dangerous one* (SEC-2) or the documented rationale is falsifiable from the code (SEC-7 in the same family). Where a decision's rationale holds, it was refuted rather than reported.
- Findings marked "(unverified)" — SEC-10, DEP-2 — carry a specific unmeasured element named inside the finding. Everything else is CONFIRMED against the cited lines.

**Open questions for the team**

1. Is `getInstanceView`'s openness (SEC-1) an intended participant-visibility model that simply predates the record-route gate, or an oversight? The two are currently contradictory and the spec is silent on the route.
2. Is `evalFieldMap`'s fatality on an unset optional field (ERR-7) genuinely intended? If so, `CLAUDE.md`'s guard-totality rule and this need reconciling, and `has(data.x) ? ... : ...` needs documenting as the required authoring idiom.
3. Should the `http.request` SSRF trade-off be re-opened now that Studio publishes from a browser? The design spec's own revisit condition ("if definitions could originate from a less-trusted authoring source") has arguably been met.
4. `PONYTAIL-AUDIT.md` (root, last scanned 2026-07-29) overlaps this report at exactly one point: its finding 9 flags the duplicated cursor helpers in `src/engine/admin-queries.ts` as duplication, where ERR-8 flags the same code for missing validation. Fix both copies once.

## Prioritized Action List

Sorted by impact ÷ effort. Effort: S ≈ under a day, M ≈ a few days, L ≈ a week or more.

| # | Action | Closes | Effort |
|---|--------|--------|--------|
| 1 | Make the dev-header resolver opt-in via an explicit env flag; throw at startup otherwise; drop the `createServer` parameter default; validate `AUTH_JWT_SECRET` ≥ 32 bytes in the same function | SEC-2, SEC-6 | S |
| 2 | Add an instance-visibility predicate in `getInstanceView` (admin / starter / claimant / candidate) and a `startedBy`-or-admin floor on the assignment-less submit path, both with rejecting tests | SEC-1, SEC-5 | S |
| 3 | Add `.github/workflows/ci.yml` with a `postgres:16` service, `bun run typecheck`, and `bun test` with `DATABASE_URL` mandatory | TEST-1 | S |
| 4 | Wrap `deliverFn` in a lease-bounded `Promise.race`; give `http.request` a default timeout that stays armed across the body read; cap the response body | ERR-1 | S |
| 5 | Move the reserved-`core.`-prefix ban into the base `processBody` superRefine (or run reserved-identity checks on the compiled body regardless of branch); drop the registry-check `.filter()` and give the two internal handlers real config schemas | SEC-3 | S |
| 6 | Compile `validation.pattern` at publish beside `validateDurations`, cap its source length, and skip the runtime test when length constraints already failed | SEC-4 | S |
| 7 | Add the two missing indexes (`history_entries_instance_idx`, `instances_parent_idx`) to `initSchema`, and call `initSchema` from `startHttpServer` | PERF-1, PERF-2, ERR-9 | S |
| 8 | Increment `attempts` in the outbox tx1 claim UPDATE; add a bounded-retry marker to the timer and resolution workers so a stuck row leaves the batch | ARCH-1, ARCH-2 | S |
| 9 | Replace `else throw err` with a rendered error state across the 22+ sites (template: `TaskScreen.tsx`'s `withErrorHandling`); gate empty states on `!error`; give `EditScreen` an error sentinel; add one `ErrorBoundary` per app | ERR-2 | M |
| 10 | Accessibility pass across the SPAs: real `<button>`/`<a>` for row and card navigation, disclosure pattern for both `StepsPanel` headers, `aria-required`/`aria-invalid`/`aria-describedby` + valid markup + a localized issue catalog in `form-ui` | CQ-1, CQ-2 | M |
| 11 | Log-and-redact the 500 fallback (`console.error` server-side, message-free body), introduce `NotFoundError` to preserve the spec-pinned scenario, and add `RequestShapeError` parsing for submit/create bodies and the pagination cursor | ERR-3, ERR-5, ERR-8 | S |
| 12 | Sweep expired entries before the login rate-limit capacity check and fail closed; verify against a dummy argon2id hash on the unknown-email branch | SEC-7, SEC-8 | S |
| 13 | Set `maxRequestBodySize` on `Bun.serve`; add write-path `.max()` bounds to `key`, `pattern`, `Plugin.type`, `duration`, `Expression.src`; add a size check to `checkEnvelope` and a depth guard for `file`/plugin-typed submissions | SEC-10 | S |
| 14 | Add a CSP meta tag to all four `index.html` files | SEC-9 | S |
| 15 | Move `zod` to `dependencies`; declare it in `packages/app` and as a peer in `packages/form-ui`; pin `@marcbachmann/cel-js` exactly | DEP-1, DEP-2 | S |
| 16 | Validate `Action.output` writeback values against the declared field type at delivery, dropping-with-an-outcome on mismatch | ERR-6 | M |
| 17 | Make `evalFieldMap` total per entry with a `mapping.entry-dropped` event (or document the fatality as intended and the `has()` idiom as required) | ERR-7 | M |
| 18 | Reject non-running submissions at the runtime-API boundary with a 409, updating the concurrent-submit test to assert one fulfilled + one 409 | ERR-4 | S |
| 19 | Make the authored write path deep-strict (or add an unknown-key walk to `compileProcessBody`), covering the `publishedProcessBody` branch too; add the misspelled-`guard` rejection test | ARCH-3 | M |
| 20 | Resolve `outputMapping` keys and `ProcessContract.inputFields`/`outputFields` in the superRefine; mirror the existing `Action.output` test suite | ARCH-4 | S |
| 21 | Add the concurrent claim/release race tests and tighten the negative-only cancel-authorization assertion | TEST-2, TEST-3 | S |
| 22 | Fix `savedBody` on `DraftToolbar.reload()` and add the conflict→reload→publish component test | CQ-3 | S |
| 23 | Constrain `FieldDef.key` to an identifier regex on the write path, with a rejecting test | CQ-4 | S |
| 24 | Correct README's `bun test` line, `docs/current-state.md:539-541`, and the `src/auth/cli.ts:2-3` header comment | DOC-1 | S |
| 25 | Memoize `autoPlaced`/`nodePositions` in `CanvasView`; extract the node `<g>` into a `React.memo` child if profiling warrants | PERF-3 | S |

## Disposition — findings to OpenSpec changes

Every finding above is covered by one of nine changes under
`openspec/changes/`. Findings were consolidated wherever they shared a seam, a
placement rule, or a failure surface; a change exists only where a finding
could not be meaningfully folded into another.

| Change | Closes |
|---|---|
| `authorize-instance-access` | SEC-1, SEC-5 |
| `harden-auth-configuration` | SEC-2, SEC-6, SEC-7, SEC-8, SEC-9 |
| `harden-publish-validation` | SEC-3, SEC-4, SEC-10, ARCH-3, ARCH-4, CQ-4 |
| `bound-async-delivery` | ERR-1, ERR-6, ERR-7, ARCH-1, ARCH-2 |
| `correct-api-error-responses` | ERR-3, ERR-4, ERR-5, ERR-8 |
| `render-frontend-error-states` | ERR-2, CQ-3 |
| `spa-accessibility-pass` | CQ-1, CQ-2, PERF-3 |
| `add-ci-and-dependency-hygiene` | TEST-1, TEST-2, TEST-3, DEP-1, DEP-2, DOC-1 |
| `fix-schema-bootstrap-and-indexes` | ERR-9, PERF-1, PERF-2 |

Three of the report's recommendations were **not** adopted as written, each for
a reason recorded in the relevant change's `design.md`:

- **SEC-3** — moving "the whole reserved-identity check" into the base
  `processBody` superRefine would reject every *compiled* body, which
  legitimately carries the cancel-sink id, key and reserved outcome. Only the
  action-prefix ban generalizes, and it moves into the compile pass ahead of
  the idempotent return rather than into the shared read schema.
- **ARCH-4** — resolving `outputMapping` keys and contract field lists "in the
  superRefine beside the existing `Action.output` loop" would tighten the
  **read** schema, so a body already published with that defect would become
  unreadable and its running instances unrehydratable. Both checks go on the
  write path instead, per `CLAUDE.md`'s stated placement rule; the sibling
  check predates that rule.
- **PERF-1/PERF-2** — the two indexes are specified as *existing*, not as
  producing an index scan. `persistence` already establishes that asserting a
  query plan asserts something the planner is free to vary; plan inspection is
  a verification step for the change, not a pinned property.

One factual correction to the report: SEC-2's "blast radius on tests is one
assertion" is understated. `test/auth-server.test.ts:17`'s `SECRET` is 23
bytes and is fed to `resolveAuthResolver` at seven sites in that file, so it
falls below SEC-6's proposed 32-byte minimum and must be lengthened as well
(`test/auth-login.test.ts:19`, at 28 bytes, reaches `handleLogin` directly and
is not forced to change).

ERR-7 was decided in favour of making `evalFieldMap` total per entry with a
new `mapping.entry-dropped` event, rather than documenting the fatality as
intended — the report left this open as a question for the team.
