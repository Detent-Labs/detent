## ADDED Requirements

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
