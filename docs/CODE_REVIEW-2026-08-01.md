<!-- antislop: allow-file em-dash sentence-length passive-voice run-ons -->
<!-- The em-dash, the sentence rhythm and the passive voice here match the
     repo's own prose (CLAUDE.md, docs/current-state.md). A review that reads
     unlike the documents it reviews is harder to act on, not clearer. Every
     other rule stays on. -->

# Code Review & Security Audit

**Date:** 2026-08-01
**Scope:** Entire codebase — engine (`src/`), Runtime API Layer, HTTP/auth
layers, action handlers, the four frontend packages, container and tooling
configuration.
**Supersedes:** [`CODE_REVIEW-2026-07-29.md`](CODE_REVIEW-2026-07-29.md), whose
27 findings all shipped and archived. This review verified that work held and
concentrates on what it did not cover: the four changes landed since
(observability, notifications, environment promotion, escalation), and the
areas the earlier pass reached less deeply — the two outbound action handlers,
the attachment path, worker error boundaries, and the delivery of the security
headers.

**Status:** Every actionable finding below is now covered by a prepared
OpenSpec change, or closed, or declined with a reason. See
[Status: change coverage](#status-change-coverage). All six are now
implemented and merged.

**Summary:** The prior review's fixes held. Object-level authorization is now
real and shared by one predicate, auth configuration fails closed, the six
publish-time structural checks run ahead of both compile branches (verified
directly — the compiled-body import path cannot skip them), and delivery is
lease-bounded. What remains clusters in two places the contract does not
reach. First, the code that talks to the outside world: the `http.request`
handler will fetch any authored URL with no egress restriction and follow
redirects, and an uploaded attachment's `Content-Type` is echoed back to the
browser verbatim with no `nosniff` and no `Content-Disposition`. Second, the
places where an error is silent: both worker error boundaries swallow every
error without logging, and there is still no server-side CI — the only gate is
a pre-push hook each clone must opt into and any push can skip. Nothing here is
architectural rework; the highest-severity items are each a handful of lines in
one function.

## Executive Summary

**Overall rating: 7.5/10** — a genuinely well-engineered contract-driven
engine, up half a point on the last pass for the validation and authorization
work that landed. Held back by an unrestricted outbound-fetch primitive, a
file-download path that reflects a user-controlled content type, two silent
error boundaries, and the absence of any gate that runs without a developer
remembering to enable it.

Top findings:

| ID | Severity | Finding |
|----|----------|---------|
| SEC-1 | High | Attachment download echoes the uploader's `Content-Type` verbatim with no `nosniff` and no `Content-Disposition` — stored XSS on the API origin |
| SEC-2 | High | `http.request` fetches any authored URL, follows redirects, and writes the response into instance `data` — SSRF with a read-back channel; no egress policy exists |
| ERR-1 | High | `pollForever` and `drainOutbox`'s per-row boundary swallow every error with no log — a persistently failing worker is completely invisible |
| TEST-1 | High | No CI. The sole gate is `.githooks/pre-push`, opt-in per clone (`git config core.hooksPath`) and bypassable with `--no-verify`; 36 of 91 test files skip silently without `DATABASE_URL` |
| SEC-3 | Medium | Login rate limiting is per-email only; the capacity backstop fails closed globally, so flooding distinct emails locks out every untracked user |
| SEC-4 | Medium | `frame-ancestors` in a `<meta>` CSP is ignored by every browser, and `nginx.conf` sets no security headers at all — clickjacking is unmitigated |
| SEC-5 | Medium | Disabling a user does not invalidate their token; access continues for up to 8 hours |

**Recommended next steps**

1. Close SEC-1 and SEC-2 first. Both are localized (`toBinaryResponse` +
   `attachmentBodySchema`; `httpHandler`'s `fetch` call), and both are the kind
   of primitive an attacker chains rather than uses alone.
2. Land ERR-1 in the same pass — two `log.error` calls. The observability
   change shipped a `/metrics` endpoint while the two loops that feed it stay
   mute about their own failures.
3. Then TEST-1. Every finding above is a regression candidate, and the project
   currently has no gate that runs without a human remembering to enable one.
4. SEC-3/4/5 next; each is one function or one config file.

## Status: change coverage

Six OpenSpec changes carry this review's findings. Each one holds a proposal,
delta specs, a design and a task list, and each passes `openspec validate
--strict`. All six are implemented and merged into `main`, so
`openspec/changes/<name>/` now holds the record rather than the plan. Each
still awaits `opsx:archive`.

| Change | Findings |
|---|---|
| `harden-http-response-boundary` | SEC-1, SEC-6, SEC-7, SEC-8 (cache-control), PERF-1 |
| `restrict-http-action-egress` | SEC-2 |
| `harden-local-account-sessions` | SEC-3, SEC-5, ARCH-3 |
| `deliver-framing-and-sniffing-headers` | SEC-4, SEC-8 (nosniff, referrer) |
| `surface-worker-failures` | ERR-1 |
| `document-deployment-and-self-enable-the-hook` | TEST-1 (what remains), DEP-1, DOC-1, SEC-8 (forwarded-for) |

Five findings carry no change, for the reasons below.

- **ERR-2 closed itself.** `src/log.ts:30` exports `log.debug`, so
  `LOG_LEVEL=debug` reaches something. The gap the review names is gone.
- **CQ-1 closed itself.** The archived change
  `2026-08-05-http-route-table` replaced the sequential `if` chain with a
  route table, and the preflight now derives from that table rather than from
  a second hand-written chain.
- **ARCH-2 is declined.** Nothing measures attachment volume as a cost today,
  and an interface with one implementation is the abstraction this repository
  does not build ahead of need. The reason sits in
  `harden-http-response-boundary`'s proposal, where a later reader will find
  it.
- **ARCH-1 has no change yet.** Mapping `NotFoundError` to 404 breaks a
  contract `http-wrapper` pins on purpose, and `src/http/errors.ts:10-16`
  records the decision. It needs a change of its own, reviewable apart from
  the security work.
- **PERF-2 needed a check, not a change.** `src/engine/definitions.ts:331`
  states outright that the cache only grows, keyed on `(processId, version)`.
  It is unbounded in fact and bounded in practice by the published-version
  count.

Two findings named the wrong place. The prepared changes carry the
correction, and both are recorded here so a reader of this document does not
follow the original text.

- ERR-1 says `pollForever` takes a `name` argument at four call sites in
  `host.ts`. It takes no such argument, and the four call sites are
  `outbox.ts:353`, `resolution.ts:125`, `timers.ts:100` and
  `retention.ts:81`.
- SEC-8 asks `docker/nginx.conf` to normalize `X-Forwarded-For`. That server
  block holds no `proxy_pass`: it serves static files and forwards nothing.
  The rule belongs to a deployment that puts its own proxy in front of the
  engine, so it moves to the deployment runbook.

## Detailed Findings

### Security

---

**SEC-1 · High · Attachment download reflects a user-controlled `Content-Type`**

**Location:** `src/http/routes.ts:69-73` (`attachmentBodySchema`),
`src/http/server.ts:107-112` (`toBinaryResponse`), `:394-398` (route),
`src/runtime/api.ts:1071-1085` (`getAttachment`).

**Description:** `contentType` is accepted as any string up to 255 characters
and stored unchanged. On download it becomes the response's `Content-Type`
with no other headers: no `Content-Disposition`, no
`X-Content-Type-Options: nosniff`. Any actor who may read an instance —
starter, claimant, or a candidate on the current step — can upload
`{"filename":"x.html","contentType":"text/html","dataBase64":"<base64 of a
script>"}` and get a URL on the API origin that executes it.

**Why it matters:** The engine's own SPAs live on a different origin, so this
does not directly steal a token out of `localStorage`. It still yields script
execution on the API origin, which is enough for convincing phishing against a
URL users are told to trust, for reading any API response the victim's browser
is authorized for if a token ever reaches that origin, and for defeating the
`connect-src` reasoning the SPA CSP rests on. A deployment that puts the API and
an SPA behind one hostname — the obvious nginx arrangement, and nothing in the
repo forbids it — turns this into full same-origin XSS. Separately, a
`contentType` containing CR or LF makes `new Response(...)` throw, producing a
500 on an otherwise valid download.

**Recommendation:** Send the bytes as a download, never as a document, and
validate the declared type:

```ts
// routes.ts — reject anything that is not a MIME token
const MIME = /^[\w.+-]+\/[\w.+-]+$/;
contentType: z.string().min(1).max(MAX_ATTACHMENT_NAME_LENGTH).regex(MIME),

// server.ts::toBinaryResponse
headers: {
  "content-type": contentType,
  "content-disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
  "x-content-type-options": "nosniff",
  ...corsHeaders(allowed, requestOrigin),
}
```

`handleGetAttachment` already has `filename` in hand from `getAttachment`; it
currently discards it. Consider also narrowing storage to an allowlist of types
the product needs (PDF, images, office documents, `text/plain`) and
rewriting everything else to `application/octet-stream`.

---

**SEC-2 · High · `http.request` has no egress policy**

**Location:** `src/handlers/http.ts:43-49` (`httpConfigSchema`), `:122-127`
(the `fetch` call).

**Description:** `url` is validated only as `z.string().url()`. The handler
then calls `fetch` with default redirect following, and the response body is
written back into `instance.data` through `Action.output`, where any participant
who can view the instance reads it. There is no scheme restriction, no host
allowlist, and no check against link-local or private address space.

**Why it matters:** This is a server-side request forgery primitive with a
read-back channel — the strongest variety. An author can reach
`http://169.254.169.254/latest/meta-data/iam/security-credentials/` (cloud
instance metadata), the Postgres port, an internal admin panel, or the engine's
own `/admin/*` routes from inside the network perimeter, and read the result
through an ordinary instance view. Even with an allowlist added later, default
redirect following would defeat it: an allowlisted host that 302s to
`169.254.169.254` is followed silently.

The mitigating factor is that reaching this requires `system:publish`. That
lowers the severity from Critical but does not remove the finding: the whole
point of a BPM engine is that process definitions are authored by business
developers whose blast radius is supposed to end at their own processes, and
the definition is also the artifact environment promotion moves between
environments as a file.

**Recommendation:** Give the handler a deployment-controlled egress policy,
following the existing `SMTP_*` / `DATABASE_URL` convention — configuration in
the environment, never in the process body:

```ts
// Unset = deny all outbound HTTP actions, matching CORS_ALLOWED_ORIGINS'
// "unset means nothing is allowed" default.
const allowed = (process.env.HTTP_ACTION_ALLOWED_HOSTS ?? "").split(",").filter(Boolean);
const target = new URL(config.url);
if (target.protocol !== "https:" && process.env.HTTP_ACTION_ALLOW_INSECURE !== "1") {
  throw new PermanentError(`http.request refuses a non-https URL: ${target.protocol}`);
}
if (!allowed.includes(target.host)) {
  throw new PermanentError(`http.request target host is not allowlisted: ${target.host}`);
}
const response = await fetch(config.url, { ..., redirect: "manual" });
```

<!-- antislop: allow synonym-rotation -->
<!-- "permanent failure" is the outbox's own term (PermanentError). -->
`redirect: "manual"` is the load-bearing half — without it the allowlist checks
only the first hop. A 3xx then classifies as a permanent failure, which the
existing status branch at `:137` already does. Resolving the hostname and
rejecting private/link-local addresses closes DNS rebinding on top; that is
worth doing but is a second step, and the allowlist is most of the value.

---

**SEC-3 · Medium · Login rate limiting is per-email only, and fails closed globally**

**Location:** `src/auth/login.ts:25-67` (`checkAndRecordAttempt`), `:81`.

**Description:** Two distinct gaps in one function.

<!-- antislop: allow long-words -->
<!-- "attempt" is the domain term: loginAttempts, checkAndRecordAttempt, and
     the outbox's own attempts column. -->
*(a) No per-source limit.* The bucket key is the normalized email. An attacker
trying one password against ten thousand accounts is never limited — each email
gets its own fresh window. Every attempt also costs a full argon2id verify
(`users.ts:46` deliberately runs one on the unknown-email path too, which is
correct for timing but expensive), so this is simultaneously a CPU exhaustion
vector against a single-threaded runtime.

*(b) The capacity backstop denies service.* When the map holds
`MAX_TRACKED_EMAILS` (50,000) live windows, `:63` returns `"limited"` for every
*new* email. An attacker submits 50,000 distinct addresses within 15 minutes —
trivially scriptable, and cheap for them since these are unknown-email
paths — and from then until the window rolls, no user whose email is not
already tracked can log in at all. The comment argues fail-closed is the safe
choice; for a capacity limit whose failure mode is total login denial, it is
the more damaging one.

**Why it matters:** (a) makes credential stuffing effectively unthrottled;
(b) is a remote, unauthenticated, low-cost denial of service against
authentication itself.

<!-- antislop: allow synonym-rotation long-words -->
<!-- "client IP" names the transport peer, not the user; "attempt" as above. -->
**Recommendation:** Add a second bucket keyed on client IP with a higher
threshold (the two compose: an attempt must pass both), and evict least-recently-used
entries at capacity instead of refusing:

```ts
// Reclaim expired first (as today); if still full, drop the oldest window
// rather than deny — an evicted entry is at worst an un-throttled attempt,
// where denial is a guaranteed outage for every untracked user.
if (map.size >= MAX_TRACKED_EMAILS) {
  const oldest = [...map.entries()].reduce((a, b) => (a[1].windowStart <= b[1].windowStart ? a : b));
  map.delete(oldest[0]);
}
```

The IP must come from the request, so `handleLogin` needs the client address
threaded in (behind nginx, from a trusted `X-Forwarded-For` — trusted meaning
the proxy overwrites it, which `docker/nginx.conf` does not currently do and
should).

---

**SEC-4 · Medium · `frame-ancestors` in a `<meta>` CSP does nothing; nginx sets no security headers**

**Location:** `packages/{app,admin,studio}/vite.config.ts` (the
`contentSecurityPolicy` plugin), `docker/nginx.conf`.

**Description:** The CSP is a good policy, delivered the one way that drops
part of it. Per the CSP specification, `frame-ancestors`, `report-uri` and
`sandbox` are ignored when the policy arrives in a `<meta http-equiv>` element
— they are honored only as an HTTP response header. So
`frame-ancestors 'none'` in these builds is inert. `docker/nginx.conf`, which
serves all three SPAs, sets no `Content-Security-Policy`, no
`X-Frame-Options`, no `X-Content-Type-Options` and no `Referrer-Policy`; its
comment correctly notes it replaces the base image's server block entirely, so
nothing is inherited.

<!-- antislop: allow synonym-rotation -->
<!-- "cancel instance" is the name of the operation, not a synonym for "stop". -->
**Why it matters:** Studio and Admin can be framed by any origin. Both are
click-to-act interfaces over destructive operations — publish, run migration,
disable user, redact instance, cancel instance — which is exactly the target
profile for clickjacking.

**Recommendation:** Move the policy to nginx, where the whole thing works, and
keep the meta tag only if you also want it on non-nginx hosting:

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${API_ORIGIN}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy no-referrer always;
```

`X-Frame-Options: DENY` alongside costs nothing and covers pre-CSP-Level-2
clients.

---

**SEC-5 · Medium · Disabling a user does not revoke their token**

**Location:** `src/auth/users.ts:78-87` (`setDisabled`), `src/auth/jwt.ts:66-69`
(local verification), `src/auth/login.ts:21` (8-hour lifetime).

**Description:** `disabled` is read once, at login (`verifyLogin:47`). The
issued JWT carries `sub` and `roles` and is verified thereafter against the
signing key alone. `POST /admin/users/:id/disable` therefore has no effect on a
session already in progress; the user keeps every permission for up to eight
hours.

**Why it matters:** Disabling an account is the operator's response to a
departure or a compromise, and the Admin UI presents it as one. Right now it is
a control that appears to work and does not. There is no revocation mechanism
of any kind — no denylist, no `tokens_valid_after`, no short refresh cycle.

**Recommendation:** For locally-issued (`iss: "bps"`) tokens, check the account
on each resolution — one indexed lookup by `user_id`, on a table that is small
by construction:

```ts
// jwt.ts, local branch, after jwtVerify
const actor = toActor(payload, localRolesClaim);
if (await isDisabled(actor.id, db)) throw new ActorResolutionError("account is disabled");
return actor;
```

Externally-issued tokens are the IdP's problem and correctly stay out of scope.
If the per-request query is unwelcome, a `tokens_valid_after` timestamp per user
compared against the token's `iat` gives the same guarantee with the value
cached in memory.

---

**SEC-6 · Medium · `GET /metrics` is unauthenticated**

**Location:** `src/http/server.ts:243-245`, `src/http/metrics.ts`.

**Description:** `/metrics` sits in the same unauthenticated tier as `/livez`
and `/readyz`, before any resolver call. Each scrape runs three aggregate
queries (`countOutboxByStatus`, `getTimerLagStats`, `countInstancesByStatus`)
against the live database, unthrottled.

**Why it matters:** Two things. The disclosure is mild but real — outbox
backlog, dead-letter count, faulted-instance count and timer lag tell an
outsider how loaded and how healthy the system is, and when it is degraded.
The load is the larger issue: an unauthenticated endpoint that performs three
full aggregate scans per request is a cheap way to push the database over.
`/livez` and `/readyz` are correctly public — a ping is not a query.

**Recommendation:** Gate it. Either need `ADMIN_ROLE` through the ordinary
resolver, or — the usual Prometheus arrangement, and the better fit for a
scraper that has no user identity — a shared bearer compared in constant time
against `METRICS_TOKEN`, with the route unregistered when that variable is
unset. Binding metrics to a second, non-public port is equally acceptable and
needs no code beyond a second `Bun.serve`.

---

**SEC-7 · Low · `MAX_ATTACHMENT_BYTES` fails open on a malformed value**

**Location:** `src/http/routes.ts:67`, enforced at `:230`.

**Description:** `Number(process.env.MAX_ATTACHMENT_BYTES ?? 5 * 1024 * 1024)`
yields `NaN` for anything non-numeric — `"5MB"`, `"5_000_000"`, a trailing
space. Every comparison against `NaN` is false, so `data.length > MAX_ATTACHMENT_BYTES`
never fires and the only remaining bound is `MAX_REQUEST_BODY_SIZE` (8 MiB).

**Why it matters:** The one operator who tries to *tighten* this limit and
mistypes the value silently loosens it instead. `host.ts::parseRetentionDays`
already establishes the right pattern in this codebase, and its doc comment
explicitly contrasts itself with `MAX_ATTACHMENT_BYTES` — the inconsistency is
known, just not closed.

**Recommendation:** Validate at module load and throw, exactly as
`parseRetentionDays` does; a bad bound on a size limit deserves the same
treatment as a bad bound on a destructive sweep.

---

**SEC-8 · Low · Notes without an immediate fix**

- **Tokens in `localStorage`** (`packages/{app,admin,studio}/src/session.ts`).
  Standard for a bearer-token SPA and defensible given the strict `script-src`,
  but it means any script execution is a full account takeover. Worth revisiting
  if a refresh-token flow is ever added; not worth churn today.
- **`CORS_ALLOWED_ORIGINS=*` permits `Authorization`** (`server.ts:120`). Safe
  as written — the wildcard cannot carry credentials, and the allowlist branch
  echoes only after checking — but the wildcard should be documented as
  dev-only.
- **API responses carry no `Cache-Control`.** Instance views containing personal
  data are cacheable by any intermediary by default. `Cache-Control: no-store`
  on the JSON envelope is a one-line addition in `toResponse`.
- **`docker/nginx.conf` does not normalize `X-Forwarded-For`.** Needed before
  SEC-3's per-IP limiting can trust it. **Correction:** that server block
  holds no `proxy_pass` and forwards nothing, so the directive has no place
  in it. The rule belongs to a deployment that fronts the engine with its own
  proxy, and `document-deployment-and-self-enable-the-hook` puts it in the
  deployment runbook.

### Architecture

**ARCH-1 · Medium · `NotFoundError` is served as HTTP 500**

**Location:** `src/http/errors.ts:82`, and the header comment at `:10-16`
recording it as deliberate.

Requesting a nonexistent instance returns `500 {"error":{"type":"internal",
"message":"instance not found: inst_..."}}`. This is inconsistent within the
same layer — `handleGetDraft`, `handleGetVersionBody` and `handleGetMigrationPlan`
all hand-roll a proper 404 — and it is corrosive operationally: every dashboard,
alert and SLO built on 5xx rate now fires on ordinary client typos, which is
precisely the noise that trains an on-call to ignore the signal. The choice is
recorded as spec-pinned, so this needs a spec change rather than a patch, but it
should get one.

**ARCH-2 · Medium · Attachment bytes live in the instance database**

**Location:** `src/engine/store.ts:124-134` (`data bytea NOT NULL`),
`src/runtime/api.ts:1071-1085`.

Files up to 5 MB are stored inline and read whole into memory on download; the
upload path additionally holds the base64 string, the decoded buffer and the
`Buffer.from` copy simultaneously. This inflates backups and WAL, ties file
retention to database retention, and gives a single-threaded runtime a
memory-proportional-to-file-size profile with no streaming anywhere. It is a
reasonable v1 shortcut and is not urgent; what it needs is a seam
(`AttachmentStore` with a DB-backed default) so that moving to object storage
later is a wiring change rather than a schema migration.

**ARCH-3 · Low · Delegation targets are unverified**

`src/runtime/api.ts:713-724` documents that `toActorId` is checked against
neither `assignment.candidates` nor any account directory. A typo parks the
task on an identity that will never claim it, with no error and no event that
distinguishes it from a legitimate delegation. Since local accounts exist in
`auth_users`, at minimum verifying the target resolves there would catch the
common case.

### Error Handling

**ERR-1 · High · Both worker error boundaries are silent**

**Location:** `src/engine/poll.ts:11-13`, `src/engine/outbox.ts:338-341`.

`pollForever` wraps every tick of all four background workers — outbox,
resolution, timers, retention — and discards any thrown error with an empty
`catch` and a comment asserting it is transient. `drainOutbox`'s per-row
boundary does the same for a corrupt action row or a failed tx2 mark.

The reasoning ("the next tick retries") is right for a blip and wrong for
everything else. A schema drift, a permissions change, a bug in
`sweepRetention`, an exhausted connection pool: all build a worker that
throws on every tick forever, with no log line, no metric and no external
symptom except work quietly not happening. The observability change that just
shipped added `/metrics` and structured logging while leaving the two loops
those metrics describe unable to report their own failure.

**Recommendation:** Log, and let the metric follow:

```ts
// poll.ts — the caller names itself so the line is actionable
} catch (err) {
  log.error("worker tick failed", { worker: name, message: err instanceof Error ? err.message : String(err) });
}

// outbox.ts:338
} catch (err) {
  log.error("outbox row skipped", { idempotencyKey: raw.idempotency_key, message: err instanceof Error ? err.message : String(err) });
}
```

`pollForever` takes a `name` argument at four call sites in `host.ts`. Rate-limit
the line if a tight interval makes it noisy — but silence is not the way to
achieve that.

**Correction.** `pollForever` takes no `name` argument today, and no call
site sits in `host.ts`. The four are `outbox.ts:353`, `resolution.ts:125`,
`timers.ts:100` and `retention.ts:81`. The change `surface-worker-failures`
adds the argument and passes it from those four.

**ERR-2 · Low · `LOG_LEVEL=debug` is accepted and unreachable**

**Closed since this review.** `src/log.ts:30` now exports `log.debug`, so the
level reaches something. The paragraph below describes the tree as it stood
on 2026-08-01.

`src/log.ts:11-33` orders four levels and resolves a `debug` threshold, but the
exported `log` object has only `info`, `warn` and `error`, so
`LOG_LEVEL=debug` has no effect. Either add the function or drop the level from
`LEVEL_ORDER`; a configuration knob that silently does nothing is worse than
one that does not exist.

### Testing

**TEST-1 · High · There is no CI**

**Location:** `.github/workflows` (absent), `.githooks/pre-push`.

The only automated gate is a pre-push hook that (a) each clone must enable by
hand with `git config core.hooksPath .githooks`, (b) requires the devcontainer
to be running or it refuses, and (c) is skipped by `git push --no-verify`,
which its own error message advertises. Nothing runs on the server side; a
push from a fresh clone, from a machine with Docker down, or from anyone who
takes the `--no-verify` hint lands unverified.

This is a live risk, not a theoretical one, because of how the suite is
structured: 667 test call sites across 91 files, of which 36 are `skipIf(!DB)`
— so a run without `DATABASE_URL` reports green while exercising a minority of
the suite. `CLAUDE.md` documents this hazard at length and instructs a human to
check the skip count. That instruction is exactly the kind of thing CI exists
to stop being a human's job.

**Recommendation:** A workflow with a Postgres 16 service, running
`bun run check`, and failing if anything skipped:

```yaml
services:
  postgres:
    image: postgres:16
    env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: workflow_engine }
    options: >-
      --health-cmd pg_isready --health-interval 10s --health-retries 5
env:
  DATABASE_URL: postgres://postgres:postgres@localhost:5432/workflow_engine
```

Keep the pre-push hook — fast local feedback is worth having — but it is a
convenience, not a gate. The prior review's TEST-1 was closed by replacing a CI
workflow with this hook; that trade should be revisited.

**TEST-2 · Low · Test quality is otherwise a strength**

Worth stating plainly since the finding above is about process, not tests: the
suite has no mocking of the database, exercises real interleaved-transaction
races (`test/assignment.runtime-api.test.ts:123`/`:158`), and every invariant
that landed shipped with a test that rejects a violating input. The
`bunfig.toml` preload giving `bun test` its own `_test` database — the fix for
what had been diagnosed as suite flakiness — is exactly the right resolution of
that problem. Test coverage of the frontend packages is thinner (pure logic is
extracted and unit-tested, components are not rendered), which is a reasonable
place to stop.

### Dependencies

**DEP-1 · Medium · No automated dependency or vulnerability monitoring**

No Dependabot or Renovate configuration, and no `bun audit` (or equivalent) in
any gate. `jose` and `zod` float on carets; `@marcbachmann/cel-js` is correctly
pinned exactly, with `CLAUDE.md` explaining why an incidental `bun update` of
that one would be a correctness hazard. The lockfile is committed and the
production image builds `--frozen-lockfile`, which covers reproducibility but
not staleness.

**Recommendation:** A weekly Dependabot config plus `bun audit` in the CI
workflow from TEST-1. Low effort, and the surface is so small that the noise
will be near zero.

**DEP-2 · Positive · The dependency surface is a genuine asset**

Three runtime dependencies for the whole engine (`zod`, `jose`,
`@marcbachmann/cel-js`); password hashing, SQL, HTTP serving, testing and the
SMTP client are all either Bun built-ins or hand-written against them. The
frontends add only React and Vite. This is unusually disciplined for a project
of this scope and should be defended.

### Code Quality

**CQ-1 · Low · `server.ts`'s router is 270 lines of sequential `if`**

**Closed since this review.** The archived change
`2026-08-05-http-route-table` replaced the chain with a route table, and the
preflight answer now derives from that table. The paragraph below describes
the tree as it stood on 2026-08-01.

`src/http/server.ts:237-496`. Every request walks up to sixty predicate chains,
and each route's CORS preflight is a second hand-written entry that must be kept
in sync with the route itself by hand. It works, it is explicit, and the file
comment justifies the framework-free choice well. But the preflight/route
duplication is the kind of pairing that drifts silently — a route added without
its preflight breaks only for browser clients, and only cross-origin. A small
table (`{method, segments, handler, preflight}`) matched in a loop would remove
the class of bug without introducing a framework.

**CQ-2 · Positive · Comment discipline**

The doc comments in this codebase explain *why*, at the point of the decision,
and they are accurate — several findings above were confirmed or ruled out
directly from them, and none was contradicted by the code. `outbox.ts`'s
account of the claim/deliver/mark split and `compile.ts::compileProcessBody`'s
note on check placement are the standouts. This is rare and is worth naming.

### Performance

**PERF-1 · Low · `parseLimit` bounds are applied late**

`routes.ts:270` accepts any positive integer; the cap (`MAX_LIST_LIMIT` 200,
`MAX_RECORD_LIMIT` 500) is applied inside `runtime/api.ts` via `Math.min`. Safe
today. The risk is that a future list endpoint reads `limit` and forgets the
clamp, since the HTTP layer's own parser imposes none. Clamping at the boundary
too would be belt-and-braces.

**PERF-2 · Low · `listInstances` resolves one body per row**

`api.ts:824` maps each row through `toSummary`, which calls
`store.resolveBody`. The definition store caches, so this is not N+1 against
the database — but it is worth confirming that cache is unbounded-in-practice
rather than unbounded-in-fact, since it keys on `(processId, version)` and
published versions accumulate forever.

### Documentation

**DOC-1 · Positive with one gap.** `CLAUDE.md`, `docs/current-state.md`,
`ROADMAP.md`, `docs/openapi.yaml` and the OpenSpec change history together form
better documentation than most commercial codebases carry, and the spec-driven
workflow visibly produces it as a by-product rather than as an afterthought.
The gap is deployment: there is no document describing the required environment
for a real deployment — which of `AUTH_JWT_SECRET`, `AUTH_ISSUERS`,
`CORS_ALLOWED_ORIGINS`, `DATA_RETENTION_DAYS`, `SMTP_*`, `MAX_ATTACHMENT_BYTES`,
`LOG_LEVEL` and `PORT` are mandatory, what each defaults to, and which defaults
are unsafe. `docker/` ships images with no accompanying runbook for what to set
when running them. `docs/runbooks/` exists and is the natural home.

## Positives

- **The contract holds.** One serialized JSON artifact, Zod as its single
  expression, hashing over the body only, immutability of published versions,
  explicit pin-by-default migration. The invariants that types cannot express
  are enumerated and each has a rejecting test.
- **Publish-time validation is unbypassable.** Verified directly:
  `compileProcessBody` runs all six structural checks plus duration validation
  before the already-compiled early return, so the environment-promotion import
  path — which publishes a compiled body straight from a file — cannot skip
  them. This was the shape of the prior review's SEC-3 and it is properly closed.
- **Concurrency is correct and reasoned.** Optimistic concurrency on
  `transitionSeq`, `SELECT ... FOR UPDATE` where a wholesale patch would race a
  writeback, `FOR UPDATE SKIP LOCKED` claiming with lease reclaim, CAS-gated
  completion, and a version-fold predicate closing the migration race. Each is
  explained where it lives.
- **Authorization is one predicate, shared.** `loadInstanceForActor` is used by
  every participant-facing read, `isEligibleCandidate` is shared with
  `claimStep` so the two cannot drift, and unauthorized reads collapse
  "doesn't exist" and "not yours" into one opaque error consistently.
- **No SQL injection surface.** Every query in the codebase is a tagged
  template with bound parameters; no `sql.unsafe`, no string-built SQL. The one
  dynamic path array (`{data,${fid}}`) is fed a validated `field_<uuid>` and
  says so.
- **No XSS surface in the SPAs.** Zero `dangerouslySetInnerHTML`, `innerHTML`,
  `eval` or `new Function` across four packages.
- **Authentication fundamentals are right.** argon2id via `Bun.password`, a
  dummy-hash verify on the unknown-email path so timing does not disclose
  account existence, identical responses for wrong-password/unknown/disabled, a
  32-byte minimum on the signing key, and a startup that refuses to run without
  authentication unless explicitly told to.
- **Data-protection primitives exist and are correct.** `redactInstance` is
  transactional and idempotent, the automatic sweep is keyset-paged rather than
  unbounded, and it correctly excludes `faulted` instances from erasure.

## Open Questions / Assumptions

1. **Deployment topology.** SEC-1's severity depends on whether the API and the
   SPAs are ever served from one origin. `docker/nginx.conf` serves only static
   assets, but nothing documents the intended arrangement. Assessed at High on
   the assumption that a shared origin is possible; if it is architecturally
   forbidden and documented as such, it is a Medium.
2. **Trust model for process authors.** SEC-2 is rated High rather than
   Critical on the assumption that `system:publish` holders are trusted
   employees, not customers. If a future SaaS mode (Roadmap #24) ever lets a
   tenant author their own definitions, SSRF becomes Critical and cross-tenant.
3. **Not executed.** No test run, no build, no live instance was exercised for
   this review — findings are from reading the code, and each cites the exact
   location so it can be checked. The prior review's own verification run
   (1319 pass / 0 fail) was taken as accurate for the tree as it stood on
   2026-07-29.
4. **Not reviewed in depth.** `src/engine/transition.ts`, `migration.ts` and
   `subprocess.ts` were read for their interfaces and their interaction with the
   outbox, not line by line — the prior review covered them and nothing since
   has changed them materially. `packages/form-ui` and the SPA component trees
   were swept for injection patterns only.
5. **Multi-process deployment.** The login rate limiter is explicitly
   single-process (`login.ts:31-37`). If any deployment already runs more than
   one engine process behind a load balancer, SEC-3 is worse than described —
   the per-email limit divides by the process count.

## Prioritized Action List

Ordered by impact ÷ effort. The first four are a single afternoon. The
coverage table above says which change now holds each item.

1. **SEC-1** — add `Content-Disposition: attachment`, `X-Content-Type-Options:
   nosniff`, and a MIME-token regex on upload. ~10 lines, two files.
2. **ERR-1** — add `log.error` to `pollForever`'s and `drainOutbox`'s catch
   blocks; thread a worker name through `pollForever`. ~10 lines.
3. **SEC-2** — host allowlist plus `redirect: "manual"` in `http.request`. ~15
   lines, one file, one new environment variable to document.
4. **SEC-7** — validate `MAX_ATTACHMENT_BYTES` at load, following
   `parseRetentionDays`. ~5 lines.
5. **TEST-1** — GitHub Actions workflow with a Postgres 16 service running
   `bun run check`. One new file; the highest-leverage item on this list over
   any horizon longer than a week.
6. **SEC-4** — move the CSP to an nginx response header, add
   `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`. One config
   file.
7. **SEC-6** — gate `/metrics` behind `METRICS_TOKEN` or `ADMIN_ROLE`.
8. **SEC-5** — check `disabled` during local-token resolution so account
   disabling takes effect immediately.
9. **SEC-3** — add a per-IP login bucket, and switch the capacity backstop from
   deny to LRU eviction. Needs the client IP threaded in, and nginx to normalize
   `X-Forwarded-For`.
10. **DEP-1** — Dependabot config and `bun audit` in CI.
11. **ARCH-1** — change the spec so `NotFoundError` maps to 404, then the code.
12. **DOC-1** — a deployment runbook enumerating every environment variable,
    its default, and whether that default is safe.
13. **ERR-2** — add `log.debug` or drop the level.
14. **ARCH-2** — introduce an `AttachmentStore` seam before file volume makes
    the migration expensive. Not urgent; cheap now, costly later.
