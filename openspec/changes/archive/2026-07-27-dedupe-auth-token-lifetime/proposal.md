## Why

`src/auth/login.ts:21-22` encodes the login token's 8-hour lifetime twice,
in two different forms kept in sync by hand: `TOKEN_LIFETIME = "8h"`
(passed to `jose`'s `setExpirationTime`, which parses it as a relative
duration string) and `TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000` (used to
compute the `expiresAt` timestamp returned in the login response body).
`PONYTAIL-AUDIT.md` (2026-07-26 scan, finding 7) flags this: changing the
lifetime today means remembering to edit both constants, with no compiler
or test signal if one is missed.

## What Changes

- Introduce one canonical numeric source, `TOKEN_LIFETIME_HOURS = 8`, and
  derive both existing constants from it: `TOKEN_LIFETIME = ` `${TOKEN_LIFETIME_HOURS}h`` `
  (still the exact literal string `"8h"` `jose` receives) and
  `TOKEN_LIFETIME_MS = TOKEN_LIFETIME_HOURS * 60 * 60 * 1000` (still
  `28800000`, computed the same way). Both produced values are
  byte-for-byte identical to today's hand-written literals — this is a
  single-source-of-truth change, not a behavior change.
- Considered and rejected: parsing `TOKEN_LIFETIME_MS` out of the `"8h"`
  string (would need a small duration-string parser for a format `jose`
  defines, not this codebase — more code than the constant it replaces,
  and this string format isn't the same grammar as the engine's ISO-8601
  timer durations, so `src/engine/duration.ts` isn't reusable here);
  passing `TOKEN_LIFETIME_MS` as a number to `jose`'s `setExpirationTime`
  (rejected — a `number` there means an ABSOLUTE unix-seconds timestamp
  to `jose`, not a relative duration, so passing a millisecond duration
  number would silently set the token to expire in 1970, a behavior
  change, not a preservation of it — verified against `jose`'s
  `jwt_claims_set.js` source before ruling this out).

## Capabilities

### New Capabilities
- `auth-token-lifetime-consolidation`: a structural requirement that the
  login token's lifetime is derived from one canonical value
  (`TOKEN_LIFETIME_HOURS`), not hand-duplicated across the two forms
  (`jose`'s duration string, the millisecond count used for `expiresAt`)
  it's consumed in. Smaller in scope than the other `*-consolidation`
  capabilities in this audit pass (two constants in one file, not a
  pattern reused across call sites), but the same "don't re-duplicate
  this" reasoning applies, and `openspec`'s spec-driven schema requires
  every change to carry at least one delta — there is no plain-deletion
  option here the way finding 6/8 had a capability-bearing sibling
  finding to ride along with.

### Modified Capabilities
None. `openspec/specs/jwt-authentication/spec.md` documents token
issuance/validation *behavior* (issuer, signing, expiry rejection) but
does not codify the exact lifetime value as a requirement — this change
doesn't alter the lifetime (still exactly 8 hours / 28,800,000 ms), only
how it's encoded internally.

## Impact

- Affected file: `src/auth/login.ts` only (lines 21-22, plus the two
  read sites at lines 86 and 89 stay textually unchanged — they still
  reference `TOKEN_LIFETIME`/`TOKEN_LIFETIME_MS` by name).
- No change to the actual token lifetime, the login response shape, or
  any auth/JWT behavior. `test/auth-*.test.ts` (or wherever login/JWT
  behavior is covered) must keep passing unmodified as the acceptance
  signal.
- No dependency changes.
