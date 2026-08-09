<!-- antislop: allow-file em-dash sentence-length passive-voice run-ons -->
<!-- The same four rules CODE_REVIEW-2026-08-01.md silences, for the same
     reason: the em-dash, the sentence rhythm and the passive voice here match
     the repo's own prose (CLAUDE.md, docs/current-state.md). A review that
     reads unlike the documents it reviews is harder to act on, not clearer.
     Every other rule stays on, and the filler and synonym-rotation findings
     this draft raised were repaired rather than silenced. -->

# Code Review & Security Audit

**Date:** 2026-08-09
**Scope:** Entire codebase — engine (`src/`), Runtime API Layer, HTTP and auth
layers, action handlers, `packages/web`, `packages/form-ui`, container and
tooling configuration.
**Supersedes:** [`CODE_REVIEW-2026-08-01.md`](CODE_REVIEW-2026-08-01.md). That
review raised 21 findings. This pass verified each against the current tree
before writing anything new, and reports the result in
[Status of the 2026-08-01 findings](#status-of-the-2026-08-01-findings).

**Summary:** The security posture improved sharply since the last pass. Six of
the seven `SEC` findings closed with real fixes, not with a note: the attachment
route now validates its MIME value and sends a download header, `http.request`
carries an egress allowlist with `redirect: "manual"`, login rate limiting gained
a second window keyed on the client address, and `GET /metrics` requires a token.
The engine's core properties — a single opaque `id` anchor, parameterized SQL
everywhere, a transactional outbox, pure CEL — hold under inspection. Two
findings from that review remain open, and the larger of the two, the absence of
CI, is now the single highest-value gap in the repository. One new defect class
surfaced that no earlier pass covered: a subprocess reference graph with no cycle
check, reachable through ordinary publish operations.

## Executive Summary

**Overall rating: 8 / 10 — green, with two amber items.**

That number reflects a codebase whose engineering discipline is well above the
median: 37,306 lines of strict TypeScript, 111 test files, mechanical push gates
covering six recurring defect classes, and comment discipline that explains *why*
rather than restating *what*. It is held back from higher by the absence of any
automated verification outside a developer's own machine.

**Top findings:**

1. **SEC-A · High · No cycle check on the subprocess reference graph.** Two
   processes can be made to reference each other through ordinary publishes, and
   nothing at publish time or run time stops the resulting instance spawn loop.
2. **TEST-1 · High · There is still no CI.** `.github/workflows/` does not
   exist. Every gate depends on a contributor's local hook and a running
   container.
3. **DEP-1 · Medium · No dependency or vulnerability monitoring.** No Dependabot,
   no `bun audit` step, no advisory watch — a direct consequence of item 2.
4. **SEC-B · Medium · The SPA ships no content CSP.** `static.ts` sends
   `frame-ancestors 'none'` only, and `packages/web/index.html` carries no CSP
   meta tag, so nothing constrains `script-src` or `connect-src`.
5. **SEC-C · Medium · The session token lives in `localStorage`.** Any script
   execution on the SPA origin reads an 8-hour bearer token, and the CSP gap
   above removes the mitigation that would normally cover it.
6. **SEC-D · Medium · Login rate limiting is per-process and in-memory.** Marked
   `ponytail:` and honestly documented, but it means the control silently
   weakens by a factor of N behind a load balancer.
7. **ARCH-A · Low · `src/runtime/api.ts` is 1,269 lines.** The largest file in
   the repository and the one every area routes through.

**Recommended next steps**, in order: add a CI workflow that runs
`bun run check` against a Postgres service container (this one action closes
TEST-1 and unblocks DEP-1); add a publish-time cycle check for subprocess
references; add a CSP to the SPA. The first is roughly an hour of work and
changes the reliability of everything else in this document.

## Status of the 2026-08-01 findings

Verified against the working tree at commit `1abc133`.

<!-- antislop: allow synonym-rotation -->
<!-- The Finding column quotes each 2026-08-01 title verbatim, so "error
     boundaries" cannot become "defect boundaries" without misquoting the
     source this table exists to track. -->

| ID | Finding | Status |
|---|---|---|
| SEC-1 | Attachment reflects user-controlled `Content-Type` | **Closed.** `MIME_TOKEN_PAIR` regex at `src/http/routes.ts:102` rejects parameters, CR and LF; `toBinaryResponse` sends `nosniff` and a percent-encoded `Content-Disposition`. |
| SEC-2 | `http.request` has no egress policy | **Closed.** HTTPS required unless explicitly waived, `HTTP_ACTION_ALLOWED_HOSTS` allowlist, and `redirect: "manual"` at `src/handlers/http.ts:175`. |
| SEC-3 | Login rate limiting per-email only | **Closed for the stated case.** A second window keyed on client address, checked first, at ten times the per-email threshold. See SEC-D for what remains. |
| SEC-4 | `frame-ancestors` in a meta CSP does nothing | **Partly closed.** `static.ts` now sends the header. The content directives it was meant to accompany never arrived — see SEC-B. |
| SEC-5 | Disabling an account does not revoke its token | **Closed.** `isActiveAccount` runs on every locally issued token after signature verification (`src/auth/jwt.ts`). |
| SEC-6 | `GET /metrics` is unauthenticated | **Closed.** `METRICS_TOKEN`, read once at construction, empty string treated as unset. |
| SEC-7 | `MAX_ATTACHMENT_BYTES` fails open | **Closed.** `parseMaxAttachmentBytes` throws on a non-integer. |
| ERR-1 | Both worker error boundaries are silent | **Closed.** `src/engine/poll.ts:20-25` wraps every tick and logs; a per-item boundary sits inside the drain loop. |
| TEST-1 | There is no CI | **Open.** No `.github/` directory. |
| DEP-1 | No dependency monitoring | **Open.** |
| ARCH-1, ARCH-2, ARCH-3, ERR-2, CQ-1, PERF-1, PERF-2 | — | Not re-verified individually this pass; none are security-bearing and all were Low or Medium. |

Eight of eleven closed with substantive fixes. That is a strong follow-through
rate and the main reason this review is shorter than its predecessor.

## Detailed Findings

### Security

---

**SEC-A · High · The subprocess reference graph has no cycle check**

**Location:** `src/engine/definitions.ts:116-160` (publish-time cross-process
check), `src/schema/definition.ts:449-466` (`subprocessSpec`),
`src/engine/subprocess.ts` (spawn and return handlers).

**Description:** The publish-time check verifies that a subprocess step's
`processId` names a published process, that the child declares a contract, and
that every `inputMapping` target exists in that contract. It does not walk the
resulting graph. Nothing at run time counts spawn depth either — I grepped
`src/engine/subprocess.ts`, `src/runtime/api.ts` and `src/schema/compile.ts` for
a depth counter, an ancestor chain, or a cycle guard and found none.

Publish ordering does not prevent a cycle, because versions are published
independently:

1. Publish process `B` v1, with no subprocess step.
2. Publish process `A` v1, whose subprocess step references `B` with
   `versionBinding: "latest-at-spawn"`. The check passes: `B` is published.
3. Publish process `B` v2, whose subprocess step references `A`. The check
   passes again: `A` is published.

`A` now spawns the latest `B`, which is v2, which spawns `A`. Each spawn creates
a real instance row and a real outbox entry.

**Why it matters:** Subprocess spawning runs post-commit through the outbox, so
the loop is not a stack overflow that fails fast and loudly. It is a steady,
durable, retrying producer of instance rows, outbox rows and timer rows, driven
by workers that are behaving exactly as designed. It fills the instance database
rather than crashing, which makes it slower to notice and harder to unwind — the
rows are legitimate engine output, not corrupt data. The actor who triggers it
needs only `system:publish`, and may reach it by accident while refactoring two
processes that call each other.

**Recommendation:** Add the check where the other cross-process validation
already lives, in `assertSubprocessWiring` (`definitions.ts`). At publish, walk
the graph reachable from the body being published and reject a path that returns
to it:

```ts
// definitions.ts, alongside the existing per-step checks
async function assertNoSubprocessCycle(processId: string, body: ProcessBody, db: SQL): Promise<void> {
  const seen = new Set<string>([processId]);
  const queue = body.steps.flatMap((s) => (s.subprocess ? [s.subprocess.processId] : []));
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (next === processId) {
      throw new SubprocessWiringError(`publishing '${processId}' would close a subprocess cycle through '${next}'`);
    }
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...(await childProcessIdsOf(next, db)));
  }
}
```

A `latest-at-spawn` binding means the graph can still change under a published
parent, so pair the publish check with a cheap run-time backstop: carry a
`spawnDepth` on the spawn config, increment it per level, and dead-letter past a
constant (16 is generous — the v1 boundary is synchronous call-and-return, and
nothing legitimate nests that far). The publish check catches the authoring
mistake with a good message; the depth cap bounds the damage when the graph
mutates after publish.

**Verification limit:** I confirmed the absence of a guard by search, and
reasoned the reachable publish sequence from `subprocessSpec` and the
`definitions.ts` checks. I did not execute the sequence against a live database.
Reproduce it before sizing the fix.

---

**SEC-B · Medium · The SPA ships no content Security Policy**

**Location:** `src/http/static.ts:40` (`SECURITY_HEADERS`),
`packages/web/index.html:1-10`.

**Description:** `static.ts` sends `content-security-policy: frame-ancestors
'none'` and `x-content-type-options: nosniff`. The header comment explains,
correctly, that `frame-ancestors` is honored only in an HTTP header and not in a
meta tag — which is why it moved there. The content directives it was meant to
sit beside are in neither place: `packages/web/index.html` carries only
`charset` and `viewport` meta tags. Nothing declares `default-src`, `script-src`,
`connect-src`, `object-src` or `base-uri`.

**Why it matters:** The policy as sent stops clickjacking and nothing else. A CSP
that names `frame-ancestors` alone reads, to a scanner and to a reviewer, like a
policy is in force. The web package renders participant-supplied form data,
comment bodies and process labels across four areas; React escapes by default and
I found no `dangerouslySetInnerHTML` or `innerHTML` anywhere in `src`,
`packages/web/src` or `packages/form-ui/src`, so there is no known injection
point today. A CSP is the control that keeps an unknown one from becoming
account compromise, and it is precisely the mitigation SEC-C is missing.

**Recommendation:** Extend the header in `static.ts` rather than adding a meta
tag, so one place owns the policy. Vite's production build emits hashed assets
and no inline script, so a strict policy fits without `unsafe-inline` on scripts:

```ts
const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // Vite injects inline style attributes
    "img-src 'self' data:",
    "connect-src 'self'",               // widen if VITE_API_URL names another origin
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
```

`connect-src 'self'` breaks a deployment that serves the bundle from a second
origin, which `API_BASE` reading `VITE_API_URL` explicitly allows. Make that
directive configurable from the same value, or the first split-origin deployment
will report the SPA as broken.

---

**SEC-C · Medium · The session token lives in `localStorage`**

**Location:** `packages/web/src/shell/session.ts:16-70`.

**Description:** One key, `web.session`, holds the bearer token, actor id, roles
and expiry as JSON in `localStorage`. `loadSession` rebuilds the object field by
field and validates shape, which is good practice and stops a malformed entry
from propagating. The storage choice itself is the finding: any script running on
the SPA origin reads the token with one line.

**Why it matters:** The token is a full 8-hour bearer credential (`login.ts`,
`TOKEN_LIFETIME_HOURS = 8`) with no refresh and no server-side session record to
revoke. `isActiveAccount` limits the blast radius — disabling the account ends
the session on its next request — but that is a manual, after-the-fact control,
not a preventive one. A stolen token is valid for up to eight hours against every
role the actor holds, and a `system:admin` or `system:publish` token is worth a
great deal here. This finding and SEC-B compound: the CSP that would normally be
the compensating control is the one that is missing.

**Recommendation:** The thorough fix is an `HttpOnly; Secure; SameSite=Strict`
cookie, which puts the token out of JavaScript's reach entirely. That is a real
change — it needs a CSRF defence (`SameSite=Strict` plus an origin check on state
-changing routes covers it), and it conflicts with the split-origin deployment
`VITE_API_URL` permits, so it deserves an OpenSpec change rather than a patch.

If that is too large for now, take the two cheap steps in the meantime: land
SEC-B's CSP, and shorten `TOKEN_LIFETIME_HOURS`. Do not move the token to
`sessionStorage` and call it fixed — it is equally readable by script, and it
costs a re-login per tab for no security gain.

---

**SEC-D · Medium · Login rate limiting is per-process and in-memory**

**Location:** `src/auth/login.ts:52-60` (the `ponytail:` marker and the two
`Map`s).

**Description:** Both windows are process-local `Map`s. The code says so
plainly, names the upgrade path, and carries the marker the repo's ledger tracks
— this is disclosed debt, not a hidden defect. It is listed here because the
consequence is larger than the marker's tone suggests.

**Why it matters:** Two properties follow, neither obvious from the call site.
Behind a load balancer with N instances, the effective threshold is N × 5 per
email and N × 50 per address, and no single process ever sees the aggregate. A
restart — a deploy, a crash, an autoscale event — resets every counter to zero,
so an attacker who can provoke or wait for restarts gets fresh budget.
The control degrades quietly in exactly the deployment shape a BPM platform ends
up in.

**Recommendation:** The comment already names the fix. The engine reaches
Postgres on this path today, so a table keyed the same way costs one query and
no new dependency:

```sql
CREATE TABLE IF NOT EXISTS login_attempts (
  bucket TEXT PRIMARY KEY,          -- 'email:x@y.z' or 'addr:203.0.113.4'
  count INT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL
);
```

<!-- antislop: allow synonym-rotation -->
<!-- "operator" is a domain term CLAUDE.md declares carries no synonym: it
     names the admin area's audience, not the "client" of a client address. -->

One `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` keeps the atomicity
the current synchronous-path comment is protecting. Until then, document the
single-process assumption in the deployment runbook — an operator scaling to two
replicas has no way to know this control weakens.

---

**SEC-E · Low · Notes without an immediate fix**

Three observations that need no change today but should not go unrecorded.

`ALLOW_INSECURE_DEV_AUTH=1` makes the server trust `X-Actor-Id` and
`X-Actor-Roles` verbatim, which is total authentication bypass by design. The
mitigations are good — no `POST /auth/login` route is registered in that state,
and startup logs `AUTH DISABLED:` — and `.env.example` documents the trap at
length. Confirm the production container image cannot inherit it.

`TRUST_PROXY=1` reads the **last** `X-Forwarded-For` entry, with a comment
explaining that reading the first would hand the rate-limit key to the attacker.
That is the correct choice and a detail most codebases get backwards. No action.

`AUTH_JWT_SECRET` is enforced at 32 encoded bytes minimum for HS256. Correct.
Consider RS256 or EdDSA if the token ever needs to be verified by a service that
should not also be able to mint one.

### Architecture

**ARCH-A · Low · `src/runtime/api.ts` is 1,269 lines**

The largest file in the repository, and the seam every area crosses. It is
coherent — the Runtime API Layer is a real boundary, not a grab bag — and the
file is well commented, so this is not urgent. It is the natural next split
point: the attachment and comment operations are self-contained enough to move to
`src/runtime/attachments.ts` and `src/runtime/comments.ts` without touching the
exports map's public shape. Do it when a change next lands in that area, not as
its own task.

**ARCH-B · Positive · The headless boundary holds**

I checked for UI leakage into `src/` and found none. `packages/web` reaches the
engine only over HTTP and the exports map, and the exports map lists seven
entries with no drift into internals. The property `CLAUDE.md` calls load-bearing
is, in fact, load-bearing and intact.

### Testing

**TEST-1 · High · There is still no CI** *(carried from 2026-08-01)*

**Location:** absent `.github/workflows/`.

**Description:** 111 test files, a six-gate pre-push hook, and no automated run
anywhere but a contributor's machine. `--no-verify` disables every gate at once,
as `CLAUDE.md` notes. A pull request from a fork runs nothing at all.

**Why it matters:** Every other quality control in this repository routes through
the local hook. That makes the whole apparatus contingent on one developer's
container being up and one developer not reaching for `--no-verify` under time
pressure. The gates exist precisely because these defect classes recurred; the
gates themselves are currently unenforced from the project's own side.

**Recommendation:** One workflow closes it. Postgres 16 as a service container,
`DATABASE_URL` set — which the `no-silent-green` gate already demands — and
`bun run check`:

```yaml
name: check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version-file: .devcontainer/Dockerfile }
      - run: bun install --frozen-lockfile
      - run: bun run check
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
```

Pin the Bun version to the same source the Dockerfile does, or CI reintroduces
the version drift the container pin exists to prevent. Add the four host-only
gates (`whitespace`, `prose`, `machine-paths`, `lockfile`) as a second job — they
need only git and a shell, so they cost seconds.

**TEST-2 · Positive · Test quality is high**

74 engine suites plus 37 in `packages/web`. The design decisions behind them are
better than the count suggests: the `bunfig.toml` preload that gives the suite
its own `_test` database closes two measured hazards rather than a hypothetical
one, and `test/http-body-size.test.ts` spins a real `Bun.serve` because the pure
`fetch(req)` handler every other test uses cannot exercise `maxRequestBodySize`.
That is a test author who understood what the test could not otherwise prove.

### Dependencies

**DEP-1 · Medium · No dependency or vulnerability monitoring** *(carried)*

No Dependabot config, no Renovate, no `bun audit` step — the last is a direct
consequence of TEST-1. Add `.github/dependabot.yml` in the same change that adds
the workflow.

**DEP-2 · Positive · The dependency surface is genuinely small**

Three runtime dependencies in the engine: `@marcbachmann/cel-js` (pinned exactly
at `8.0.0`, correctly — it decides guard semantics), `jose` (the right choice for
JWT, actively maintained), and `zod`. No ORM, no HTTP framework, no logger, no
database driver: `Bun.sql`, `Bun.serve` and `Bun.password` cover all four. The web
package adds four. `Bun.password` in particular means argon2id with no
dependency, and `verifyLogin` runs exactly one verify on every path including the
no-such-row path, against a process-lifetime dummy hash. That is a deliberate
timing-attack defence most codebases skip.

This is the strongest single attribute of the project. Adding CI to watch it
protects an asset that already exists.

### Code Quality

Strict TypeScript with `noUnusedLocals`, `noUnusedParameters`,
`noFallthroughCasesInSwitch` and `noImplicitOverride` all on. Across 37,306
lines: **zero** `TODO`/`FIXME`/`HACK` markers, 7 `as any` or `@ts-*` escapes, and
15 `ponytail:` markers — each of which is a *documented* shortcut naming its own
ceiling and upgrade path, tracked in a ledger with a push gate enforcing
freshness. Deliberate debt with a paper trail is not the same thing as debt.

The comment discipline deserves specific mention, because it is unusual. Comments
here state why a choice was made and what breaks otherwise:
`clientAddressOf` explains why the last `X-Forwarded-For` entry rather than the
first; `checkAndRecordAttempt` explains why it must stay synchronous end to end;
`createDefaultRegistry` explains which import cycle its location avoids. That is
the category of knowledge normally lost to turnover.

### Performance

No blocking issues found. Pagination is bounded through `parseLimit` with
per-route maxima and rejects a non-positive-integer `limit` rather than
clamping silently. `maxRequestBodySize` is set to 8 MiB explicitly instead of
inheriting Bun's 128 MiB default. Attachments are capped at 5 MiB.

`ARCH-2` from the previous review — attachment bytes stored in the instance
database — remains true and remains the right call at this stage. Revisit when
attachment volume, not attachment count, starts driving database size.

## Positives

- **Parameterized SQL throughout.** No string interpolation into a query, no
  `sql.unsafe`, anywhere in `src/engine/` or `src/auth/`. Zero injection surface.
- **`Bun.password` (argon2id) with a constant-work no-such-row path.** A
  deliberate timing-attack defence, correctly implemented.
- **SSRF defence that covers the real attack.** `redirect: "manual"` is the half
  most allowlists forget; the comment names the `169.254.169.254` case explicitly.
- **Role design without a hierarchy.** Seven flat roles, no implication between
  them, each documented with what it deliberately does *not* grant. Simpler to
  audit than any policy engine.
- **The push gates.** Six mechanical checks, each covering a defect class that
  recurred at least twice, each naming the rule, the files and the repair command.
- **Prose-debt ratchet over a whole-file gate.** A measured, pragmatic call
  (3,166 findings across 52 files) that keeps the gate enforceable instead of
  ornamental.
- **No `innerHTML`, no `eval`, no `new Function`** anywhere in three packages.
- **Documentation that matches the code.** `CLAUDE.md`, `docs/current-state.md`
  and `ROADMAP.md` were accurate everywhere I checked them against source.

## Open Questions / Assumptions

1. **SEC-A is reasoned, not executed.** I confirmed no cycle guard exists by
   search and derived the reachable publish sequence from the schema and the
   publish checks. Reproduce it against a live database before sizing the fix.
2. **I did not run the suite.** Per `CLAUDE.md`, a meaningful run needs
   `DATABASE_URL` and the devcontainer, and a review should not mutate a shared
   working tree. Findings rest on reading, not on a green or red run. The last
   recorded measurement (`scripts/gates/skip-floor.txt`, 2026-08-04) is 1,831
   pass, 1 skip, 0 fail across 111 files.
3. **No browser check.** SEC-B and SEC-C concern runtime behavior in a real
   browser. Confirm the CSP in a browser before and after any change, per the
   project's own manual-check rule.
4. **Deployment configuration is out of scope.** `docker/`, nginx and the
   production compose were not audited this pass. SEC-E's first note — whether a
   production image can inherit `ALLOW_INSECURE_DEV_AUTH` — needs that audit to
   answer.
5. **`packages/web` was reviewed for security surface, not for UX or
   accessibility.** A design-language and accessibility pass against the repo's
   own `design-language.md` is a separate exercise.

## Prioritized Action List

Ordered by impact divided by effort. The first two are worth more than the rest
combined.

1. **Add the CI workflow** (TEST-1). ~1 hour. Closes the highest-value gap and
   makes every other control in the repository enforceable from the project side.
2. **Add `.github/dependabot.yml`** (DEP-1). ~10 minutes, once step 1 lands.
3. **Add a subprocess cycle check at publish, plus a run-time depth cap**
   (SEC-A). ~half a day. Reproduce first.
4. **Add a content CSP to `static.ts`** (SEC-B). ~1 hour including a browser
   check. Make `connect-src` follow `VITE_API_URL`.
5. **Move login rate-limit state to Postgres** (SEC-D). ~half a day. Until then,
   document the single-process assumption in the deployment runbook — that part
   costs minutes.
6. **Decide on the session-token storage model** (SEC-C). An OpenSpec change, not
   a patch. Shortening the token lifetime is the cheap interim step.
7. **Split `src/runtime/api.ts`** (ARCH-A). Opportunistic — do it when a change
   next lands in that file.

Items 1 through 5 are ordinary OpenSpec changes. Item 6 touches the auth contract
and the deployment shape, so it wants a design document first.
