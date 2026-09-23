# Design

## Context

See proposal.md for the motivation. Today the section "Open from the
2026-08-18 code review" in `docs/decisions.md` holds all eight findings. Its
first list holds SEC-2 to SEC-6. Its second list holds SEC-8 to SEC-10. The
owner decided each finding on
2026-09-23, after a walk through the tradeoffs.

The deployment question came first, because SEC-5 and SEC-9 depend on it. The
engine already supports a second process everywhere but one place:

- The outbox drain and the assignment re-resolution claim rows with
  `FOR UPDATE SKIP LOCKED` (`src/engine/outbox.ts:201`,
  `src/engine/resolution.ts:68`).
- The timer drain reads due rows without a lock. A reminder timer's write
  checks the observed sequence and the fired flag
  (`src/engine/transition.ts:893-896`). A transition timer goes through
  `commitTransition`'s optimistic-concurrency predicate (`:889`). There the
  losing process throws `ConcurrencyConflict`, which the drain catches and
  logs (`src/engine/timers.ts:84-91`). Either way the timer fires once.
- `/metrics` reads the database on every scrape (`src/http/metrics.ts`).
- The module-level caches hold published bodies, which are immutable, and
  JWKS sets.
- The login rate-limit windows are two `Map`s in process memory
  (`src/auth/login.ts:54` and `:61`). They are the exception.

Startup is a second, separate limit. `initSchema` (`src/engine/store.ts:76`)
runs its `CREATE ... IF NOT EXISTS` statements with no lock, and the server
calls it at startup (`src/http/server.ts:893`). Two processes that start
together against a new or upgraded schema can race on those statements. One
process that finishes startup first leaves the others no table to add.

## Goals / Non-Goals

**Goals:**

- Each of the eight findings leaves the open list with a verdict and a
  reason.
- Each build verdict names the follow-up change that builds it, and the
  shape the owner chose for it.
- The runbook states the replica rule before any follow-up change lands.

**Non-Goals:**

- Building any verdict. Each build verdict gets its own change and its own
  worktree.
- SEC-1 and SEC-7. The worktree `add-publish-cycle-check-and-cel-deadline`
  covers both.

## Decisions

**The eight verdicts.**

| Finding | Verdict | Follow-up change | Shape the owner chose |
|---|---|---|---|
| SEC-2 | Build | `password-floor-and-self-rotation` | A length-only floor of 15 characters in `src/auth/users.ts`, on every write path. NIST SP 800-63B sets 15 when a password is the only factor, and forbids composition rules. |
| SEC-3 | Build | `password-floor-and-self-rotation` | `PATCH /account/me` takes the current and the new password. The account screen gets a field for it. |
| SEC-4 | Accept | none | See below. |
| SEC-5 | Build | `postgres-login-rate-limit` | One table. One statement checks and increments together. |
| SEC-6 | Build | `instance-attachment-byte-ceiling` | A new variable `MAX_INSTANCE_ATTACHMENT_BYTES`. One `SUM` inside `uploadAttachment`'s transaction, under the instance row lock, so two concurrent uploads cannot both pass. Over the limit answers the status the per-file limit answers today: 400, `RequestShapeError` (`src/http/routes.ts:359`). |
| SEC-8 | Accept | none | See below. |
| SEC-9 | Build | `live-roles-for-local-tokens` | For a token this engine issued, the per-request account read returns the roles too. They replace the token's claim. A token from an external issuer keeps its claim. |
| SEC-10 | Accept | none | See below. |

SEC-2 and SEC-3 share one change, because SEC-3 needs SEC-2's check.

**Why each accepted finding stays.**

- SEC-4: the built `index.html` sets `script-src 'self'`
  (`packages/web/csp.ts:23`). That blocks inline script and script from
  another origin. It does not block script that the app's own origin
  serves, such as a compromised bundled dependency.

  A bearer header is immune to CSRF. An integration authenticates with a
  bearer token anyway, so a cookie would add a second authentication path.
  That path needs a CSRF token on every mutating route. CORS would then run
  in credentials mode, and `CORS_ALLOWED_ORIGINS` loses the `*` value.

  A script that runs on the origin can read the token from `localStorage`
  and send it away. The attacker can then replay it from anywhere until it
  expires, up to eight hours (`TOKEN_LIFETIME_HOURS`,
  `src/auth/login.ts:21`). An `HttpOnly` cookie would stop that theft. It
  would still let such a script misuse the open session. The owner accepted
  this residual risk on 2026-09-23.
- SEC-8: three layers stop a stored file from rendering. The download route
  needs a bearer header, so a plain link cannot open the file. The API
  response carries `X-Content-Type-Options: nosniff` and
  `Content-Disposition: attachment` (`src/http/server.ts:200-212`), and
  `test/http-disposition.test.ts` guards the disposition. The SPA fetches the
  file and saves it through `<a download>`
  (`packages/web/src/areas/app/screens/TaskScreen.tsx:404-412`). The SPA's
  own CSP does not reach the download response. An allowlist would turn each
  new file type into a configuration change. The residual risk sits in the
  SPA: the saved blob carries the caller's type and the app's origin. A later
  inline preview of that blob would render stored HTML there. Such a feature
  reopens SEC-8.
- SEC-10: the production image in `docker/engine.Dockerfile` inherits neither
  default. The server prints `AUTH DISABLED` at startup whenever the first one
  applies.

<!-- antislop: allow trailing-negation -->
<!-- "Decided, not yet built" quotes an existing section heading verbatim. -->
**Where the entries go.** A build verdict moves to "Decided, not yet built",
which already exists for this purpose. An accepted finding has no work left.
That section and "Decided and built" both describe work. A new section,
"Accepted risks (decided, nothing to build)", holds the three. It sits after
"Decided, not yet built". Each entry keeps its file anchors, so a later
review can re-check the reason against the tree.

**The runbook lists a class of state.** The requirement covers all
process-local state. The login limiter is its one member today. The
follow-up change `postgres-login-rate-limit` then removes one entry. It
reverses no rule. A later change that adds process-local state has a place to
declare it.

**The startup rule stays a runbook rule for now.** An advisory lock around
`initSchema` would retire it. That is code, and this change writes none.
`docs/decisions.md` records the lock under "Decided, not yet built". The
multi-tenant section of the runbook said "from one process" and "the same
process". Both places now read "the same deployment".

**The runbook section sits before "The proxy rule".** Both sections describe
the login limiter's counts. A reader then meets them together.

## Risks / Trade-offs

- [The sibling worktree edits the same section of `docs/decisions.md`] →
  Whichever branch merges second resolves the conflict. The counts in the
  section intros ("All ten items", "All nine stay open") change on both
  branches.
- [The runbook allows replicas while SEC-5 is unbuilt] → The runbook names the
  limiter and its effect. A deployment that needs the full threshold runs one
  process until `postgres-login-rate-limit` lands.
- [A verdict recorded here is later reversed] → The reason stays in the entry.
  A reversal edits that entry and cites the new reason.

## Migration Plan

Documentation only. Nothing to deploy and nothing to roll back.

## Open Questions

None. The owner answered each finding.
