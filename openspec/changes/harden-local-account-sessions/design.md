<!-- "operator" names the human who administers accounts. "client" names the
     HTTP caller. They are distinct actors here, the way the live
     observability spec's own directive already argues. -->
<!-- antislop: allow-file synonym-rotation -->

## Context

See proposal.md for motivation. Four facts about the current code shape the
approach.

The resolver holds no database handle. `jwtResolver` in `src/auth/jwt.ts`
takes a `JwtResolverConfig` and imports no SQL. The account check needs a way
in.

The request handler holds no client address. `createServer` in
`src/http/server.ts` returns `async (req: Request) => Response`. Bun passes a
second `server` argument to a fetch handler, and `server.requestIP(req)`
answers the peer. Nothing in this repository calls it today.

The route table's handlers take `(params, req)`. The login route is one entry
in that table, built once at construction.

The limiter is one synchronous function. `checkAndRecordAttempt` in
`src/auth/login.ts` stays `await`-free on purpose, so its check and its
increment cannot interleave. The live spec states that.

## Goals / Non-Goals

**Goals:**

- An operator's disable takes effect on the next request.
- One caller cannot try one password against every account for free.
- A full tracking map costs one caller a try, not every caller their login.
- A delegation names an identity the system knows, where a directory exists.

**Non-Goals:**

- No token denylist and no refresh-token flow. The directory read gives the
  same guarantee with no new state.
- No cross-process limiter. The live spec already records the limiter as
  per-process, and this change keeps that.
- No check of a delegation target against `assignment.candidates`. The
  contract permits delegating outside the candidate set, and an
  `assignment.delegated` event records exactly that.

## Decisions

**The resolver takes an `isDisabled` callback, not a database handle.** A
callback keeps `src/auth/jwt.ts` free of SQL. That is how the file reads
today.
The wiring in `src/auth/host.ts` or the server construction passes one that
closes over `db`. A test then passes a plain function, with no database.

**No cache in front of that read.** A cache with a lifetime restores the gap
for that lifetime. A cache without one needs invalidation across
processes. The read is one indexed lookup on `auth_users`, a table an
operator populates by hand. The alternative, a `tokens_valid_after` column
compared against the token's `iat`, gives the same guarantee. It costs a
migration and a second concept, and it still reads a row. It stays available
if the read ever measures as a cost.

**The client address reaches only the login route.** The fetch handler
computes the address once per request. It passes that address as a third
argument to every route handler. Every handler except `handleLogin` ignores it.
TypeScript permits a handler that declares fewer parameters, so no existing
handler changes. The alternative, a special case for the login path inside
the request loop, puts a route's business in the router.

**`server` stays optional.** Tests call `createServer(...)` and invoke the
returned function with a request alone. The handler therefore accepts an
absent `server`, computes no address, and applies the per-email window only.
That keeps every existing test compiling and passing.

**`TRUST_PROXY` gates the header, not the header's presence.** Reading
`X-Forwarded-For` whenever it appears would let any caller pick their own
bucket. Behind a proxy that overwrites the header, the peer address is the
proxy, and every login shares one bucket. Only the deployment knows which
case it is, so only the deployment decides.

**The delegation check keys off the delegator.** The engine cannot ask
whether a deployment uses local accounts. Both resolvers can be active.
It can ask whether the delegating actor's own id sits in `auth_users`. On an
external identity provider that answer is no, and the target check does not
run. On a local deployment the answer is yes for every actor who can reach
the route.

## Risks / Trade-offs

- Every authenticated request gains one indexed read → the table is small,
  and the read is by primary key. If it ever measures as a cost, the
  `tokens_valid_after` column above replaces it without changing this
  requirement.
- A per-address window can lock out a large office behind one address → the
  threshold sits well above ordinary use. The window lasts 15 minutes, and
  the per-email window covers those callers as it does today.
- A proxied deployment that leaves `TRUST_PROXY` unset puts every login in
  one bucket → ordinary use stays under the threshold. The deployment
  runbook names the variable.
- Eviction lets a caller past the address window clear one entry per try →
  the address window already throttles that caller. That is the premise this
  change adds.
- A local deployment may delegate to an actor only its external identity
  provider knows. That now fails → both resolvers can be active, and that
  delegation is rare. The error names the target, so an operator sees why.

## Migration Plan

1. Deploy. The directory read starts at once, and a disabled account's live
   session ends on its next request.
2. Set `TRUST_PROXY=1` in every deployment that runs behind a proxy which
   overwrites `X-Forwarded-For`. Leave it unset otherwise.
3. No table changes. No stored row changes. Rollback is the previous image.

An operator may have disabled an account before this change, expecting the
session to end. That outcome arrives now. The check runs on the next request,
whatever issued the token.

## Open Questions

- What per-address threshold fits? The implementation starts at ten times the
  per-email threshold within the same window. Tuning it changes no
  requirement, because the spec states the property and not the number.
