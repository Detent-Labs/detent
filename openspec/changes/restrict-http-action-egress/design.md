## Context

See proposal.md for motivation. Three facts about the current handler shape
the approach.

The config schema is `httpConfigSchema` in `src/handlers/http.ts`. The
registry parses it at publish time through `HandlerDef.configSchema`, and the
handler parses it again at delivery. A rule placed in that schema therefore
runs in both places.

The failure classification already exists. A `PermanentError` from
`src/engine/outbox.ts` dead-letters the row at once. Anything else retries
with backoff. The status branch already treats a non-2xx answer as permanent.

The handler already holds a bound the author cannot lift. The timeout applies
whether or not the action declares one. The egress policy takes the same
shape: a deployment-held rule the process body cannot reach.

## Goals / Non-Goals

**Goals:**

- No process body can name a target the deployment did not permit.
- A refusal is visible. The dead-letter row names the host or the scheme.
- The same definition file promotes between environments unchanged.

**Non-Goals:**

- No hostname resolution and no private-range check. See the proposal's
  out-of-scope note.
- No per-process or per-tenant policy. One deployment holds one list. A SaaS
  mode that lets a tenant author bodies needs its own decision here, and
  ROADMAP stage 24 owns that.
- No allowlist entry with a path or a wildcard. A host is the unit.

## Decisions

**The check runs at delivery, not at publish.** A publish-time check reads
the environment of the process that publishes. Environment promotion moves a
published body between environments as a file. A body validated against the
development list would fail on import to production. A stale list is worse:
there, the same body passes. The definition stays environment-independent, for the
same reason no `SMTP_*` setting sits in a body. Delivery is the one place
that holds the right environment.

**A refused target dead-letters instead of retrying.** A retry meets the same
list. Every try would burn an outbox slot and reach nothing. The operator
sees the row in the admin dead-letter view, with the host in the message.
Changing the environment needs a restart. The retry button in the admin area
then re-delivers.

**The scheme rule is separate from the host rule.** An entry that carried a
scheme would invite `http://internal`. That is the case the rule exists to
stop. One escape hatch keeps the list a list.

**`redirect: "manual"` rather than a redirect loop the handler drives.**
Following a redirect by hand means checking each hop against the policy. That
is more code, and one more place to get an edge case wrong. The existing
non-2xx branch already dead-letters a 3xx. A target that redirects is a
target the author configured wrongly.

**The handler trims each entry and ignores case.** A URL's host arrives
lower-case, without a default port. An operator writes the list by hand, in
YAML or in a deployment console. That
operator writes `a.example.com, b.example.com` with a space. A raw string
comparison then refuses both. The dead-letter message names a host the
operator can see in the list. The evidence points away from the cause.

**No `configSchema` change.** The URL stays `z.string().url()`. Putting the
list in the schema would move an environment-dependent rule into
publish-time validation. The first decision rejects that.

## Risks / Trade-offs

- Every deployment using `http.request` breaks until it sets
  `HTTP_ACTION_ALLOWED_HOSTS` → the proposal marks this **BREAKING**. The
  dead-letter message names the missing host, so the fix is one variable
  away.
- The test suite targets `http://localhost:<port>` on a picked port → each
  case sets both variables, from the port its server reports.
- A target behind a redirect stops working → the author points the action at
  the final URL. The dead-letter message carries the 3xx status.
- An operator adds an internal host on purpose → the policy holds that
  decision where the deployment can audit it. That is the point.
- The `http.request` handler is not the last outbound caller this engine will
  hold. An HTTP-backed data-source type sits parked in `docs/decisions.md`.
  That caller needs this same policy → `src/handlers/http.ts` exports the
  helper. The second caller then imports the rule instead of writing a second
  copy of it. One variable keeps one meaning. That change, not this one,
  decides whether the helper moves to a file of its own.
- ROADMAP stage 24 runs many tenant databases behind one shared `Bun.serve`
  process. One environment-held list would then cover every tenant. One
  tenant's permitted host becomes reachable from another tenant's body →
  stage 24 moves the policy to a per-tenant source. No requirement here
  names a per-deployment scope, so that move adds a rule rather than undoing
  one.

## Migration Plan

1. Collect the hosts every published body targets. A query over the
   `definitions` table finds every `http.request` action's `url`.
2. Set `HTTP_ACTION_ALLOWED_HOSTS` to those hosts. Set
   `HTTP_ACTION_ALLOW_INSECURE=1` only where a target is plain HTTP.
3. Deploy and restart. A body that targets a host outside the list starts
   dead-lettering. The admin dead-letter view shows which.
4. Retry the dead-lettered rows after the list is right.

Rollback is the previous image. Nothing persists across the two versions that
the older one cannot read.

## Open Questions

- Should the allowlist accept a leading dot for a subdomain match, as in
  `.example.com`? Exact matching covers the targets this repository knows
  about. Adding the form later widens the rule and breaks no body.
