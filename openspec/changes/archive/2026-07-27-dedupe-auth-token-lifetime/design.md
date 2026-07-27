## Context

`src/auth/login.ts:21-22`:

```ts
const TOKEN_LIFETIME = "8h";
const TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000;
```

`TOKEN_LIFETIME` is passed to `jose`'s `SignJWT.setExpirationTime` (line
86) — for a `string` argument, `jose` computes `exp = epoch(now) +
secs(TOKEN_LIFETIME)`, parsing `"8h"` with its own duration-string
grammar. `TOKEN_LIFETIME_MS` is used to compute the `expiresAt` field
returned in the login response body (line 89): `new Date(Date.now() +
TOKEN_LIFETIME_MS).toISOString()`. Both must encode the same 8-hour span;
today that's enforced only by a human remembering to edit both lines.

Verified `jose`'s `setExpirationTime` contract directly in
`node_modules/.bun/jose@6.2.4/node_modules/jose/dist/webapi/lib/jwt_claims_set.js`
before designing this change — this matters because the two overload
behaviors diverge sharply: a `number` argument is treated as an
**absolute** Unix-seconds timestamp (`this.#payload.exp =
validateInput('setExpirationTime', value)` — no addition of current
time), while a `string` argument is treated as a **relative** duration
(`epoch(new Date()) + secs(value)`). Passing `TOKEN_LIFETIME_MS` (a
millisecond count) as the numeric argument would not shrink the token's
lifetime — it would set `exp` to an absolute timestamp around 1970,
immediately expired. This rules out the seemingly obvious "just pass the
number" fix.

## Goals / Non-Goals

**Goals:**
- One canonical numeric source; both existing constants derived from it.
- Every produced value byte-identical to today's: the string literal
  `jose` receives is still exactly `"8h"`; `TOKEN_LIFETIME_MS` is still
  exactly `28800000`.

**Non-Goals:**
- Changing the actual token lifetime.
- Changing how `expiresAt` is computed relative to the token's actual
  `exp` claim (both are computed via `Date.now()`-based arithmetic at
  slightly different points in `handleLogin`, as today; this change
  doesn't touch that timing, only where the duration constant comes
  from — fixing that separate, pre-existing, unrelated skew is out of
  scope for this finding).
- Writing a general-purpose duration-string parser. `"8h"` is `jose`'s
  own duration-string grammar (a small superset of "number + unit"),
  distinct from the engine's ISO-8601 timer-duration grammar
  (`src/engine/duration.ts`'s `parseIsoDuration`, which parses `PT8H`-style
  strings) — not reusable here, and parsing `"8h"` back into a number
  would be more code than the constant it replaces.

## Decisions

### One numeric source, two derived constants

```ts
const TOKEN_LIFETIME_HOURS = 8;
const TOKEN_LIFETIME = `${TOKEN_LIFETIME_HOURS}h`;
const TOKEN_LIFETIME_MS = TOKEN_LIFETIME_HOURS * 60 * 60 * 1000;
```

Both read sites (`.setExpirationTime(TOKEN_LIFETIME)` at line 86,
`Date.now() + TOKEN_LIFETIME_MS` at line 89) stay textually unchanged —
they still reference `TOKEN_LIFETIME`/`TOKEN_LIFETIME_MS` by name, now
computed rather than hand-written. Changing the lifetime in the future is
a one-line edit to `TOKEN_LIFETIME_HOURS`, with both consumers picking it
up automatically.

Alternative considered (and rejected — see Context/Non-Goals): passing
`TOKEN_LIFETIME_MS` directly as `jose`'s numeric expiration argument.
Rejected because `jose` treats a numeric argument as an absolute
timestamp, not a duration — this would silently break token expiry, not
preserve it.

Alternative considered (and rejected — see Non-Goals): deriving
`TOKEN_LIFETIME_MS` by parsing the `TOKEN_LIFETIME` string. Rejected as
more code (a parser) than the single constant it would replace, for a
format (`jose`'s duration grammar) this codebase has no other reason to
parse.

## Risks / Trade-offs

None identified — every produced value is unchanged (`"8h"` and
`28800000` respectively); this is a pure single-source-of-truth
refactor with no behavior change.

## Migration Plan

Pure refactor, no schema/contract/data changes, no change to issued-token
behavior. Rollback is reverting `login.ts`.

## Open Questions

None outstanding.
