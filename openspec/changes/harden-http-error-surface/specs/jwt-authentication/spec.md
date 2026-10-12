# Spec Delta

## ADDED Requirements

### Requirement: The resolver fixes the signature algorithms it accepts

The local branch SHALL accept `HS256` only. The external branch SHALL accept
the asymmetric algorithms only: `RS256`, `RS384`, `RS512`, `PS256`, `PS384`,
`PS512`, `ES256`, `ES384`, `ES512`, `EdDSA` and `Ed25519`. A token signed with
any other algorithm SHALL throw `ActorResolutionError`.

#### Scenario: A locally-issued token signed with HS512

- **WHEN** `jwtResolver` gets a token of the local issuer
- **AND** its header names `HS512` and the configured local key signed it
- **THEN** it throws `ActorResolutionError`

#### Scenario: An external token signed with an HMAC algorithm

- **WHEN** `jwtResolver` gets a token of a configured external issuer
- **AND** its header names `HS256`
- **THEN** it throws `ActorResolutionError`

### Requirement: An external token needs an expiry

The external branch SHALL need the `exp` claim. A token of a configured
external issuer with no `exp` SHALL throw `ActorResolutionError`. An identity
provider that omits `exp` then cannot produce a token that never expires.

#### Scenario: An external token with no exp

- **WHEN** `jwtResolver` gets a correctly-signed token of a configured
  external issuer
- **AND** the token has no `exp` claim
- **THEN** it throws `ActorResolutionError`

#### Scenario: An external token with exp still resolves

- **WHEN** the same token has an `exp` in the future
- **THEN** it resolves to an `Actor`
