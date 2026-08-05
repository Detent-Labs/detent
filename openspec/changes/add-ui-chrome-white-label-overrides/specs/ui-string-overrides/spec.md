## Purpose

Lets a deployment override its own UI-chrome wording. It works area by
area and locale by locale, without a code change or a redeploy.

## ADDED Requirements

### Requirement: An override wins over the builtin catalog value

Take a given area, locale, and key. The system SHALL prefer a stored
override's value over the area's builtin catalog value. Absent an
override, the system SHALL use the builtin value. This SHALL hold for
every area that already carries a `t(locale, key)` catalog.

#### Scenario: An override replaces the builtin wording

- **WHEN** an override row exists for `(area, locale, key)`
- **THEN** `t(locale, key)` in that area returns the override's value

#### Scenario: No override falls back to the builtin value

- **WHEN** no override row exists for `(area, locale, key)`
- **THEN** `t(locale, key)` in that area returns the builtin value

### Requirement: The override read is public and available before login

The system SHALL expose every stored override through one unauthenticated
route. A caller with no token SHALL receive the same data as an
authenticated one. This SHALL let the pre-login screen's own wording
carry an override.

#### Scenario: An unauthenticated caller reads overrides

- **WHEN** a request to the override-read route carries no auth token
- **THEN** the system returns every stored override

#### Scenario: A pre-login screen shows its override

- **WHEN** the `shell` area has an override for a login-screen key
- **THEN** the login screen, rendered before authentication, shows that
  override

### Requirement: Only `system:admin` sets an override

Only an actor holding `system:admin` SHALL create, change, or clear an
override. The system SHALL refuse an actor without that role. A cleared
override SHALL delete its stored row, not merely blank its value.

#### Scenario: An admin sets an override

- **WHEN** an actor holding `system:admin` submits a value for
  `(area, locale, key)`
- **THEN** the system stores that value as the override

#### Scenario: An admin clears an override

- **WHEN** an actor holding `system:admin` clears the override for
  `(area, locale, key)`
- **THEN** the system deletes that override, and the builtin value applies
  again

#### Scenario: A non-admin cannot set an override

- **WHEN** an actor without `system:admin` attempts to set an override
- **THEN** the system refuses the request
