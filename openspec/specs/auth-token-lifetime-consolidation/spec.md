# auth-token-lifetime-consolidation

## Purpose

A structural (mechanism-level) constraint on `src/auth/login.ts`: the
login token's lifetime is derived from one canonical numeric constant
(`TOKEN_LIFETIME_HOURS`), not hand-duplicated across the two forms it's
consumed in (a `jose`-facing duration string, a millisecond count for the
response's `expiresAt`). External behavior (an 8-hour token lifetime) is
unaffected — this is a pure, behavior-preserving refactor. Smaller in
scope than this audit pass's other `*-consolidation` capabilities (two
constants in one file, not a pattern reused across call sites), recorded
because the spec-driven schema requires every change to carry at least
one delta and there was no capability-bearing sibling finding to fold
this plain simplification into. Added for `PONYTAIL-AUDIT.md`'s
2026-07-26 scan, finding 7.

## Requirements

### Requirement: Login token lifetime derives from one canonical value

`src/auth/login.ts` SHALL derive both the `jose`-facing expiration
duration string and the millisecond count used to compute the login
response's `expiresAt` from one canonical numeric constant
(`TOKEN_LIFETIME_HOURS`), not from two independently hand-written
literals. The produced values SHALL be unchanged from pre-consolidation
behavior: an 8-hour token lifetime.

#### Scenario: A newly issued token expires 8 hours from issuance

- **WHEN** a login succeeds and a token is issued
- **THEN** the signed JWT's `exp` claim is 8 hours (28,800 seconds) after
  its `iat`, unchanged from pre-consolidation behavior

#### Scenario: The response's expiresAt matches the token's actual expiration

- **WHEN** a login response is returned
- **THEN** its `expiresAt` field is (to within normal request-handling
  timing variance) 8 hours after the response is generated, computed from
  the same canonical duration the token's own `exp` claim derives from
