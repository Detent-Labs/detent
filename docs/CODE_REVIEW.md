<!-- antislop: allow-file em-dash sentence-length passive-voice run-ons -->
<!-- The same four rules CODE_REVIEW-2026-08-09.md silences, for the same
     reason: the em-dash, the sentence rhythm and the passive voice here match
     the repo's own prose (CLAUDE.md, docs/current-state.md). A review that
     reads unlike the documents it reviews is harder to act on, not clearer.
     Every other rule stays on. -->

# Code Review & Security Audit

**Date:** 2026-08-18
**Scope:** Entire codebase — engine (`src/`), Runtime API Layer, HTTP and auth
layers, action handlers, `packages/web`, `packages/form-ui`, container, CI and
tooling configuration.
**Supersedes:** [`CODE_REVIEW-2026-08-09.md`](CODE_REVIEW-2026-08-09.md). That
review raised seven headline findings. Each was re-checked against the current
tree before anything new was written; the result is in
[Status of the 2026-08-09 findings](#status-of-the-2026-08-09-findings).

**Summary:** Four of the seven headline findings from the last pass closed with
real fixes rather than notes: CI now exists and runs the full gate set on a
GitHub-hosted runner, Dependabot is configured, the SPA ships a content CSP, and
both serving paths send the framing headers a meta tag cannot deliver. The
engine's load-bearing properties hold under inspection — parameterized SQL
everywhere with no `unsafe` call, argon2id password hashing with a constant-work
unknown-email path, an egress allowlist with `redirect: "manual"` on the one
outbound handler, containment-by-whitelist on static file resolution, and a
transactional outbox. The full check ran green in the devcontainer during this
review: 2762 pass, 1 skip, 0 fail across 154 files. The single highest-value gap
is unchanged from the last pass and is now the oldest open item: a subprocess and
process-chaining reference graph with no cycle check and no depth cap, reachable
through ordinary publish operations. Two new gaps surfaced that no earlier pass
covered: there is no password policy on any write path, and no account can rotate
its own password.

## Executive Summary

**Overall rating: 8.5 / 10 — green, with one amber item.**

The number reflects a codebase whose engineering discipline sits well above the
median for its size: about 67,000 lines of strict TypeScript, 154 test files with
8,166 assertions, six mechanical push gates each covering a defect class this
repository produced two or more times, a three-package runtime dependency tree,
and comment discipline that explains *why* rather than restating *what*. The half
point gained since the last pass is CI. What holds it back from higher is a
recursion hazard in the definition contract's own subprocess feature and a
password story that has no floor.

**Top findings**

1. **SEC-1 · High · No cycle or depth bound on the subprocess and process-chaining
   graph.** `validateCrossProcess` checks that each child resolves and that
   mappings hit declared inputs, and stops there. Two processes that call each
   other, or one that calls itself, publish cleanly and then spawn instances
   without bound. Carried from SEC-A, still open.
2. **SEC-2 · Medium · No password policy anywhere.** `requireNonBlank` is the only
   gate on the admin route, the self-service path does not exist, and the CLI
   applies nothing. A one-character password is accepted and stored.
3. **SEC-3 · Medium · No self-service password change.** `PATCH /account/me` writes
   the account's own name and its locale. An account holder who believes their password is
   compromised must reach an operator.
4. **SEC-4 · Medium · Login rate limiting is per-process and in-memory.** Two
   replicas double every threshold; a restart clears both windows. Marked
   `ponytail:` in the source with the upgrade path named. Carried from SEC-D.
5. **SEC-5 · Medium · No rate limit or quota on any route but login.** One valid
   token can drive unbounded instance creation, comment writes and 5 MiB
   attachment uploads.
6. **TEST-1 · Medium · Nothing asserts that every route requires a credential.**
   Roughly 70 route-table entries are gated by hand-written `requireRole` calls
   inside each handler. A route added without one ships silently.
7. **ARCH-1 · Medium · `src/runtime/api.ts` is 1,384 lines** and grew by 115 since
   the last review flagged it at 1,269. Carried from ARCH-A.

**Recommended next steps.** Close SEC-1 with a publish-time graph walk and a
runtime depth counter — it is the only finding here that can take a deployment
down. Then SEC-2 and SEC-3 together, since both live in `src/auth/users.ts` and
one change covers the pair. TEST-1 is an afternoon and prevents the whole class
of access-control regressions the rest of this section is about.

## Status of the 2026-08-09 findings

| Finding | Status | Evidence |
|---|---|---|
| SEC-A · Subprocess cycle check | **Open** — carried as SEC-1 | `src/engine/definitions.ts:126` validates resolvability and input mappings; no walk of the reference graph exists, and nothing in `src/engine/subprocess.ts` carries a depth |
| TEST-1 · No CI | **Closed** | `.github/workflows/check.yml` runs the four host gates and `bun run check` plus the two container gates, on push and pull request |
| DEP-1 · No dependency monitoring | **Closed** | `.github/dependabot.yml` exists |
| SEC-B · SPA ships no content CSP | **Closed** | `packages/web/vite.config.ts:23` injects a full policy at build; `src/http/static.ts:39` and `docker/nginx.conf:23` carry the three header-only directives |
| SEC-C · Session token in `localStorage` | **Open** — carried as SEC-4 | `packages/web/src/shell/session.ts:39` |
| SEC-D · In-memory login rate limiting | **Open** — carried as SEC-6 | `src/auth/login.ts:54`, still marked `ponytail:` |
| ARCH-A · `src/runtime/api.ts` size | **Open, worse** — carried as ARCH-1 | 1,384 lines, up from 1,269 |

## Detailed Findings

### Security

---

**SEC-1 · High · The subprocess and process-chaining reference graph has no cycle
check and no depth cap**

**Location:** `src/engine/definitions.ts:126` (`validateCrossProcess`),
`src/engine/definitions.ts:174` onward (the `process.start` chaining check),
`src/engine/subprocess.ts:53` (the `core.spawnSubprocess` handler).

**Description.** Publish-time cross-process validation confirms three things per
subprocess step: the child resolves, the child declares a contract, and every
`inputMapping` target names a declared input field. It never asks whether the
child, directly or transitively, references the parent. The `process.start`
chaining check has the same shape and the same omission. At runtime the spawn
handler creates the child instance and records the parent linkage, but the
instance body carries no depth and nothing counts hops.

**Why it matters.** Process A declaring a subprocess step on B, and B declaring
one on A, is a publish sequence an author can reach with no unusual permission —
child-first ordering falls out of resolvability, so B publishes first against no
A, then A publishes against B, then a re-publish of B picks up A. One instance of
A then spawns B, which spawns A, without termination. Because the spawn is
dispatched through the outbox rather than recursed inline, there is no stack to
overflow and nothing to raise: the engine writes instance rows at the poller's
rate until the database fills. The same holds for a `process.start` chain, which
needs no contract at all and so is easier to build by accident.

**Recommendation.** Two changes, both cheap relative to the risk.

At publish, walk the graph. The edges are already enumerated by the two existing
checks — every subprocess step's `spec.processId` and every `process.start`
action's target. A depth-first walk from the body being published, over both edge
kinds together, that raises `CrossProcessValidationError` on a back edge:

```ts
// in validateCrossProcess, after each child resolves
const seen = new Set<ProcessId>([body.processId]);
async function walk(pid: ProcessId, path: ProcessId[]): Promise<void> {
  if (seen.has(pid)) {
    throw new CrossProcessValidationError(
      `subprocess reference cycle: ${[...path, pid].join(" -> ")}`,
    );
  }
  // ... resolve pid's body, recurse over its subprocess steps and
  //     process.start actions
}
```

At runtime, keep a counter. The child instance already knows its parent; carry a
`spawnDepth` on the instance body, set to the parent's plus one at spawn, and
refuse a spawn past a fixed ceiling with a `PermanentError` so the delivery
dead-letters into the admin view rather than retrying. The publish check is the
real fix; the counter is the backstop for a graph that becomes cyclic through a
later re-publish of an already-referenced child.

**Note.** A cycle spanning three or more processes is the case a single-hop check
would miss, which is why the recommendation is a walk rather than a self-reference
test.

---

**SEC-2 · Medium · No password policy on any write path**

**Location:** `src/http/admin-routes.ts:220-232` (`POST /admin/users/:userId/password`),
`src/http/admin-routes.ts:189-199` (`POST /admin/users`), `src/auth/users.ts:65`
(`createUser`), `src/auth/users.ts:139` (`setPassword`), `src/auth/cli.ts`.

**Description.** The only check applied to a submitted password is
`requireNonBlank`. The route's own comment states the position explicitly: "No
strength rule runs here: `cli.ts`'s `set-password` has never applied one, and a
floor this route alone enforced would refuse a password the CLI still accepts."
The reasoning against a route-local rule is sound. The conclusion drawn from it —
that therefore no rule applies anywhere — is the gap.

**Why it matters.** `a` is a valid password for an account that may hold
`system:admin`. The login path is well defended against online guessing (two rate
limit windows, argon2id, a constant-work unknown-email path), so the exposure is
not a fast remote crack. It is that an operator who picks a weak password for a
colleague, or a seeded account never rotated, leaves an account whose password
survives any offline exposure of `auth_users` in minutes. The hashing is doing all
of the work here, alone.

**Recommendation.** Put one floor in `src/auth/users.ts`, beside
`normalizeDisplayName` and `validateDisplayName`, which already establish exactly
this pattern — a normalizing writer plus an exported validator the routes call so
they answer 400 rather than reaching a throw:

```ts
export const PASSWORD_MIN_LENGTH = 12;

export type PasswordValidation = { ok: true } | { ok: false; reason: "too-short" };

export function validatePassword(value: string): PasswordValidation {
  return value.length >= PASSWORD_MIN_LENGTH ? { ok: true } : { ok: false, reason: "too-short" };
}
```

Length alone, no composition rules — NIST SP 800-63B has recommended against
character-class mandates since 2017, and a composition rule here would be the kind
of ceremony `CLAUDE.md` rightly resists. Enforce it in `createUser`, `setPassword`
and `setPasswordById` so the CLI and both routes share one bound, which is exactly
the objection the route's comment raises against a route-local rule. `scripts/seed.ts`'s
`DEMO_PASSWORD` (`seed-demo-password`, 18 characters) already clears twelve.

---

**SEC-3 · Medium · An account cannot change its own password**

**Location:** `src/http/account-routes.ts:62,113` — the file exposes
`handleGetAccount` and `handlePatchAccount`, and `PATCH /account/me` accepts
`displayName` and `locale` only.

**Description.** Every password write goes through `system:admin`
(`POST /admin/users/:userId/password`) or the recovery CLI. There is no
self-service route.

**Why it matters.** An account holder who suspects their password is exposed
cannot act. They must reach an operator, who then knows the new password — the
operator sets it, so it is transmitted out of band and not rotated
afterwards. For a platform whose whole point is that participants, operators,
developers and process owners each hold their own identity, the participant
holding no control over their own credential is a real gap, and it is the one
OWASP places under identification and authentication failures rather than under
access control.

**Recommendation.** `POST /account/me/password`, in `account-routes.ts` beside the
two existing handlers. It asks for the current password in the body and verifies
it through `verifyLogin` before writing — a bearer token alone is not enough
authorization to change the credential that mints it, since a stolen token would
otherwise become a permanent takeover. It refuses a federated actor with 403 the
way `handlePatchAccount` already does, and it applies SEC-2's floor.

---

**SEC-4 · Medium · The session token lives in `localStorage`**

**Location:** `packages/web/src/shell/session.ts:39,64,70`.

**Description.** The bearer token is persisted under `web.session` in
`localStorage` and read back on load. Any script running on the origin can read
it.

**Why it matters.** This is the standard SPA trade-off, and the mitigations here
are genuinely strong: the production CSP is `default-src 'self'` with
`script-src 'self'`, `object-src 'none'` and `base-uri 'none'`; there is not one
`dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in either
frontend package; and the token's lifetime is eight hours. What the mitigations do
not cover is a compromised dependency in the build, which `script-src 'self'`
permits by construction, and which is precisely the delivery route a supply-chain
attack takes.

**Recommendation.** This is a decision, not a defect, and it belongs in an
OpenSpec change rather than a patch. Two defensible outcomes. Keep
`localStorage` and record the reasoning in `docs/decisions.md` so the next review
stops re-raising it. Or move to a `Secure; HttpOnly; SameSite=Strict` cookie set
by `POST /auth/login`, which removes script access entirely and costs a CSRF token
on every mutating route plus a change to how `packages/web/src/api` attaches
credentials. `SameSite=Strict` alone would not close it, because
`CORS_ALLOWED_ORIGINS` supports a separate frontend origin, which is a
cross-site context by definition.

---

**SEC-5 · Medium · Login rate limiting is per-process and in-memory**

**Location:** `src/auth/login.ts:54,61` — two `Map`s, marked `ponytail:` with the
upgrade path named in the comment.

**Description.** Both windows — the per-email one at 5 attempts and the
per-address one at 50 — live in process memory.

**Why it matters.** Two replicas behind a load balancer give an attacker twice
every threshold, and n replicas give n times. A restart clears both maps
completely, so a crash loop or a rolling deploy removes the control at exactly the
moment logs are noisiest. The single-process case, which is what ships today, is
correctly defended.

**Recommendation.** The comment already names the fix: a shared store keyed the
same way. A Postgres table is the right choice here rather than Redis, because the
engine already depends on Postgres and adding a second datastore for one counter
is the kind of dependency `CLAUDE.md` resists. Note the atomicity constraint the
current implementation is careful about — `checkAndRecordAttempt` must stay
synchronous end-to-end — which a SQL round trip breaks; the replacement needs a
single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` that does the check and the
increment in one statement rather than a read followed by a write.

Until it lands, the deployment documentation should state that the engine runs as
a single process, or that a proxy in front of it enforces its own login throttle.

---

**SEC-6 · Medium · No rate limit or quota on any route but login**

**Location:** `src/http/server.ts:533-668` — the route table. `MAX_REQUEST_BODY_SIZE`
is applied at `Bun.serve` (`src/http/server.ts:817`) and
`MAX_ATTACHMENT_BYTES` defaults to 5 MiB (`src/http/routes.ts:75`), but neither
bounds request *rate* or cumulative volume per actor.

**Description.** One authenticated actor can send unbounded requests to every
route their roles admit.

**Why it matters.** The expensive paths are reachable with an ordinary
participant token: `POST /processes/:processId/instances` writes a row and
evaluates entry guards, `POST /instances/:instanceId/attachments` writes up to
5 MiB of `bytea` per call with no per-instance or per-actor total, and
`POST /instances/:instanceId/comments` writes unbounded rows. None of this is a
remote-unauthenticated hazard — a token is required — so the realistic threat is
an insider or a leaked credential, and the realistic outcome is storage
exhaustion rather than a service outage.

**Recommendation.** Prioritize the storage bound over the rate bound, because it
is both cheaper and closer to the real risk: a cap on total attachment bytes per
instance, enforced in the same place `MAX_ATTACHMENT_BYTES` is enforced today
(`src/http/routes.ts:330`), needs one aggregate query and no new state. A general
per-actor rate limit is better placed in a reverse proxy than in this process,
for the same reason SEC-5's control wants a shared store.

---

**SEC-7 · Low · CEL evaluation carries no wall-clock bound**

**Location:** `src/cel/eval.ts:129,166` — `evaluate(...)` inside `try`/`catch`,
called during transition evaluation.

**Description.** Guard and mapping evaluation is total against *errors* — a raise
is "no match", which is the documented and correct semantic — but not against
*time*. `MAX_EXPRESSION_LENGTH` (4,000, `src/schema/compile.ts:149`) bounds source
length, which is not the same as bounding evaluation cost.

**Why it matters.** Four thousand characters is room for deeply nested
comprehensions over instance data. Authoring requires `system:developer` or
`system:author`, so the actor is semi-trusted and this is defense in depth rather
than an open door. The consequence, if it were reached, is that the evaluation
runs inside a transaction and would hold locks for its duration.

**Recommendation.** Check whether `@marcbachmann/cel-js` exposes an evaluation
budget or step limit; if it does, set one. If it does not, a publish-time
complexity bound — nesting depth, or a count of comprehension nodes in the parsed
AST, which `src/cel/check.ts` already walks — is a better fit than a runtime timer,
since it keeps the refusal at authoring time where a person can act on it. Low
priority: no path here is reachable by an unprivileged actor.

---

**SEC-8 · Low · Attachment `contentType` is caller-supplied and echoed on download**

**Location:** `src/http/routes.ts:104` (the schema), `src/http/routes.ts:365` (the
download response), `src/http/server.ts:174` (`toBinaryResponse`).

**Description.** The uploader states the MIME type; the download route returns it
as `Content-Type`.

**Why it matters.** The defenses are already correct and layered:
`MIME_TOKEN_PAIR` constrains the shape, `X-Content-Type-Options: nosniff` is
unconditional on every binary response, `Content-Disposition: attachment` with a
percent-encoded filename applies to this route per `BINARY_ROUTES`, and the CSP
`object-src 'none'` blocks plugin-rendered content. A stored `text/html` therefore
downloads rather than renders. This is noted for completeness, not because a path
to execution was found.

**Recommendation.** Optional. If the set of useful upload types is known, an
allowlist is stricter than a shape regex and costs a constant array.

---

**SEC-9 · Low · A role reduction does not reach an issued token**

**Location:** `src/auth/jwt.ts:117-124`, documented in place and in the
`admin-user-management` spec.

**Description.** `isActiveAccount` runs on every locally-issued token, so
disabling or deleting an account ends its session on the next request. Roles are
read from the token's own claim, so removing a role leaves the old set effective
until expiry — up to eight hours.

**Why it matters.** The disable case is the urgent one and it is closed. What
remains is the narrower case of an operator revoking one privilege from an
account that stays active: revoking `system:admin` from someone who keeps their
job. The blunt instrument works — disable, then re-enable — but is not obvious.

**Recommendation.** Either document the disable-then-re-enable method in the
operator documentation, which is the zero-code answer, or carry a `rolesVersion`
integer on `auth_users`, embed it as a claim, and have `isActiveAccount` compare
it. The second is a schema change and belongs in an OpenSpec change.

---

**SEC-10 · Informational · Development defaults**

`.devcontainer/docker-compose.yml` sets `ALLOW_INSECURE_DEV_AUTH=1` and
`POSTGRES_PASSWORD: postgres`. Both are correct for a disposable local stack, both
are documented, and the server prints `AUTH DISABLED: ...` at startup whenever the
first applies (`src/http/server.ts:380`). `docker/engine.Dockerfile` — the
production image — inherits neither, installs with `--production --frozen-lockfile`
and runs as the non-root `bun` account. No tracked file contains a credential:
`git grep` over the tree for assigned secret-shaped values returns nothing, and
`.env` is ignored with `.env.example` explicitly re-included.

### Testing

**TEST-1 · Medium · Nothing asserts that every route requires a credential**

**Location:** `src/http/server.ts:533-668` (the route table), and the absence of a
covering test in `test/`.

**Description.** Authorization is enforced by a `requireRole` or `requirePermission`
call written by hand inside each handler. The counts are close but not equal:
`admin-routes.ts` has 26 exported handlers and 25 role checks, `studio-routes.ts`
has 14 and 8, `reporting-routes.ts` has 4 and 3. Every gap examined has a
documented reason — a shared `gate` helper, a route deliberately open like
`GET /ui-strings`, a handler whose scoping happens in the Runtime API Layer. But
the reason is per-route knowledge, and no mechanism holds it.

**Why it matters.** This repository already recognizes the defect class and names
it: `BINARY_ROUTES` carries a comment stating that the list is kept in sync "by
hand instead, the same discipline `admin-routing.test.ts`'s own route list needs."
Broken access control is the top entry in the OWASP Top 10 for exactly this
reason — not because the checks are hard, but because one missing check in
seventy is invisible.

**Recommendation.** A table-driven test that exports the route list, iterates it,
issues each request with no credential, and asserts 401 — with a small,
explicitly-named exemption set (`POST /auth/login`, `GET /ui-strings`, `/livez`,
`/readyz`). Adding a route then either passes or forces the author to add it to
the exemption list with a reason, which is the enforcement the current comment
asks a person to supply. The 401 assertions already present (15 in `http.test.ts`,
23 in `http-admin.test.ts`, 16 in `http-studio.test.ts`) are per-route spot checks
and do not close this.

**Otherwise, the test posture is strong.** The full check ran green during this
review inside the devcontainer: typecheck, build, then 2762 pass / 1 skip / 0 fail
across 154 files with 8,166 assertions, plus the 20-test timezone suite. The skip
count of 1 confirms the database-backed suites ran, which is the signal
`CLAUDE.md` insists on and which `scripts/gates/silent-green.sh` enforces
mechanically. Test files outnumber engine source files nearly three to one.

### Architecture

**ARCH-1 · Medium · `src/runtime/api.ts` is 1,384 lines**

Up from 1,269 when the last review raised it. It is the largest source file in the
repository, and the same pressure shows in `src/schema/definition.ts` (1,140),
`src/engine/transition.ts` (1,085), `src/http/server.ts` (869) and
`src/http/admin-routes.ts` (771).

The file is not badly structured — it is the Runtime API Layer, and the operations
it exports genuinely belong to one seam. The cost is navigational: a reviewer
reading one operation carries the whole file, and a merge across two agents in
this tree contends on it.

**Recommendation.** Split along the seams the exports already suggest —
instance lifecycle, claim and assignment, queries — into sibling modules
re-exported from `api.ts`, so no import site changes. Opportunistic, not urgent;
do it the next time a change lands substantially inside it, which is what the
last review recommended and what did not happen.

**ARCH-2 · Low · Two hand-kept ledgers.** `BINARY_ROUTES` and the per-handler role
checks both depend on a person remembering. Both are documented as such. TEST-1
closes the second; the first is already covered by `test/http-disposition.test.ts`
driving every declared entry, which leaves only the case of a binary route added
and never declared.

**Otherwise the architecture holds.** The headless-engine boundary is real:
`packages/web` reaches `src/` only over the HTTP wrapper and the exports map, and
no UI import appears anywhere under `src/`. The plugin envelope `{ type, config }`
resolves through three sibling registries validated at publish time rather than at
runtime. State commits before side effects dispatch, through a transactional
outbox with idempotency keys. `src/auth/authorize.ts` holds no SQL, delegating to
`grants.ts`, which keeps the authorization seam movable.

### Code Quality

**CQ-1 · Low · Ten `eslint-disable` directives, no ESLint.** `src/schema/compile.ts`
carries ten `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
comments, and the repository contains no ESLint, Prettier or Biome configuration.
The directives suppress nothing. Either adopt a linter — which would also give
`bun run check` a style gate it currently lacks — or delete the comments so they
stop implying a tool that is not there. Deleting is the smaller change and the one
that matches how this repository treats speculative machinery elsewhere.

**CQ-2 · Low · Doc comments duplicate facts held elsewhere.** The header of
`src/auth/authorize.ts` states which roles admit which HTTP routes; the route
table in `src/http/server.ts` and the checks inside each handler are where that is
true. The same shape appears in `docs/current-state.md`, which lists
exported symbols by hand. Both are excellent documentation and both drift silently
— no gate covers either, and a rename in one place leaves the other wrong. Where a
comment describes a list that lives in code, prefer naming where the list lives
over restating it.

**Otherwise, quality is high.** Strict TypeScript with NodeNext ESM throughout, 31
`any` occurrences across roughly 67,000 lines (most of them the constructor-type
gymnastics in `errors.ts` and the deliberate ones in `compile.ts`), and zero
`TODO`, `FIXME`, `XXX` or `HACK` markers in `src/`, `packages/web/src` or
`packages/form-ui/src`. Deferred work is tracked in `PONYTAIL-DEBT.md` behind a
push gate rather than scattered as comments, which is a better mechanism than most
codebases manage.

### Dependencies and Supply Chain

**Strong, and the strongest single aspect of this codebase.** Three runtime
dependencies: `zod` (pinned exact, `4.4.3`), `jose` and `@marcbachmann/cel-js`
(pinned exact, `8.0.0`, with `.claude/rules/process-contract.md` stating why the
pin is load-bearing — an evaluation-semantics change must not silently reroute an
already-published immutable body). `Bun.password` supplies argon2id and
`crypto.randomUUID` supplies ids, so neither needs a package. The frontend adds
React, Vite and two focused libraries. `bun.lock` is committed and enforced by
`scripts/gates/lockfile.sh` on every push and again in CI; the production image
installs `--production --frozen-lockfile`.

**DEP-1 · Low · No SAST or secret scanning in CI.** Dependabot covers version
drift in declared dependencies. It does not cover a credential committed by
accident, or a code-level pattern. GitHub CodeQL is free for a public repository
and would add one job to `check.yml`. `gitleaks` would be a second. Neither is
urgent given how clean the tree is, and both are cheap.

**DEP-2 · Informational.** No `bun audit` step exists. Bun's audit support and
Dependabot overlap substantially; adding both is unlikely to earn its maintenance.

### Performance and Scalability

**PERF-1 · Low · Fixed 500 ms polling per tenant.** `src/engine/host.ts:310` runs
the outbox drain and the timer sweep on a 500 ms loop wrapped in `eachTenant`. At
one tenant this is fine. At many, each cycle issues work proportional to tenant
count regardless of whether any tenant has pending rows. If multi-tenancy grows
beyond a handful, a Postgres `LISTEN`/`NOTIFY` wake-up or a single cross-tenant
claim query would replace the fan-out.

**PERF-2 · Low · One query per refused permission check.** `can()`
(`src/auth/authorize.ts:103`) short-circuits on the global role before any query,
so the common paths cost nothing. Documented and correctly bounded.

**Otherwise sound.** Keyset pagination on `(email, user_id)` tuples rather than
`OFFSET`, `MAX_LIST_LIMIT` applied on every list route, bounded response reads in
the HTTP handler with a streaming byte budget rather than a trusted
`content-length`, and an outbox with exponential backoff and a claim lease that
bounds any one delivery.

### Documentation

Unusually thorough: `README.md`, `CLAUDE.md`, `docs/current-state.md` (3,944
lines), `docs/authoring-guide.md`, `docs/decisions.md`, `docs/browser-checks.md`,
`ROADMAP.md` plus `docs/roadmap-history.md`, an OpenSpec specification tree of 89
capability specs, and `.claude/rules/` carrying the definition contract, the
authoring invariants, the UI glossary and the design language. Two prior code
reviews are retained under their dates.

The risk is volume rather than absence, and CQ-2 above names the specific shape it
takes. One observation worth acting on: `docs/current-state.md` at 3,944 lines is
maintained by hand against code that changes daily, and nothing verifies it. It is
the file most likely to be quietly wrong.

## Positives

- **Parameterized SQL without exception.** Every query in `src/` uses Bun's
  tagged-template binding; array parameters use `db.array(..., "TEXT")`.
  There is no `db.unsafe` call and no string-concatenated query anywhere.
- **Password handling is textbook.** argon2id via `Bun.password`, a
  process-lifetime dummy hash so the unknown-email path costs the same argon2id
  work as a real one, and one generic 401 covering unknown email, wrong password
  and disabled account alike.
- **The egress policy on `http.request` is the load-bearing half done right.**
  An allowlist checked before the socket opens, HTTPS required unless explicitly
  overridden, and `redirect: "manual"` — without which an allowlisted host
  answering 302 to `169.254.169.254` would reach the metadata endpoint.
- **Static file containment is a whitelist, not a blacklist,** with the reasoning
  written down: decode, resolve, need containment under the root, rather than
  chasing `..` and its encodings.
- **Constant-time comparison where it belongs,** with a length pre-check that
  exists to stop `timingSafeEqual` raising on unequal buffers and turning a 401
  into a 500.
- **The 500 envelope discloses nothing.** Unrecognized throws log name, message,
  stack, method and path server-side and return `{ error: { type: "internal" } }`.
- **Six push gates, each covering a defect class this repository produced,** now mirrored in CI on a GitHub-hosted runner with the correct
  reasoning recorded about why `pull_request` is safe there.
- **Comment discipline.** Comments explain why a thing is the way it is, name the
  alternative that was rejected, and record the measurement behind a decision.
  `src/auth/login.ts`'s eviction logic and `test/preload-db.ts`'s database split
  are the clearest examples.

## Open Questions and Assumptions

1. **SEC-1 is reasoned from the code, not executed.** The absence of a cycle guard
   was confirmed by reading `validateCrossProcess`, the chaining check beside it,
   and the spawn handler, and by searching the engine for any depth or cycle
   term. No cyclic definition was published to observe the runaway. A test that
   publishes a two-process cycle would settle it in minutes and should accompany
   the fix.
2. **CEL evaluation cost (SEC-7) was not measured.** Whether
   `@marcbachmann/cel-js` exposes an evaluation budget was not determined from
   the library source.
3. **No browser check ran.** SEC-4 concerns runtime behavior in a real browser.
   The CSP was read from `vite.config.ts` and the header set from `static.ts` and
   `nginx.conf`; neither was observed being served.
4. **`packages/web` was reviewed for security only, not for UX, accessibility
   or visual correctness.** `docs/browser-checks.md` covers what stays manual
   there, and `CLAUDE.md` requires a real browser for any UI change.
5. **Deployment topology is assumed single-process.** SEC-5's severity depends on
   it. If the engine already runs replicated anywhere, that finding rises to High.
6. **The verification claim is this run only.** `bun run check` was executed once
   in the devcontainer on commit `2bb7ea9` with `VERSION` modified in the working
   tree, and passed.

## Prioritized Action List

1. **Publish-time cycle check on the subprocess and chaining graph, plus a runtime
   depth cap** (SEC-1). Roughly a day with tests. The only finding that can
   exhaust a production database, and the oldest one open.
2. **A password floor in `src/auth/users.ts`, applied by both routes and the CLI**
   (SEC-2). Half a day. Twelve characters, length only, following the
   `validateDisplayName` pattern already in the file.
3. **`POST /account/me/password`, verifying the current password** (SEC-3). Half a
   day, and it shares the validator from step 2, so do it in the same change.
4. **A table-driven test that every route refuses an uncredentialed request**
   (TEST-1). An afternoon. Cheapest item here per unit of risk removed, and it
   permanently closes a whole defect class.
5. **A per-instance total attachment byte cap** (SEC-6, the storage half). Half a
   day; one aggregate query at the existing enforcement point.
6. **Move login rate-limit state to Postgres** (SEC-5). Roughly a day, and it needs
   care: the check and the increment must stay atomic in one statement. Until it
   lands, document the single-process assumption.
7. **Decide the session-token storage model** (SEC-4). An OpenSpec change, not a
   patch. Either outcome is defensible; the value is in recording which and why.
8. **Add CodeQL to `check.yml`** (DEP-1). Under an hour.
9. **Delete the ten dead `eslint-disable` directives, or adopt a linter** (CQ-1).
   Minutes either way.
10. **Split `src/runtime/api.ts`** (ARCH-1). Opportunistic — the next time a change
    lands substantially inside it.
