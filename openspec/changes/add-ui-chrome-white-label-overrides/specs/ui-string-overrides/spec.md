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

### Requirement: The write path bounds what the public read returns

The override read needs no token, and it returns the whole table. The
write path SHALL therefore decide that response's size. The system SHALL
refuse a write whose `area`, `locale` or `key` exceeds the key-length
bound the repository already declares. It SHALL refuse a write whose
`value` exceeds a declared value-length bound. It SHALL refuse a write
that would carry the table past a declared row count.

Each refusal SHALL reject the request shape, and SHALL store no row.

#### Scenario: The system refuses an over-long value

- **WHEN** an actor holding `system:admin` submits a `value` longer than
  the declared value-length bound
- **THEN** the system refuses the request and stores no row

#### Scenario: The system refuses an over-long key

- **WHEN** an actor holding `system:admin` submits an `area`, `locale` or
  `key` longer than the declared key-length bound
- **THEN** the system refuses the request and stores no row

#### Scenario: The system refuses a write past the row bound

- **WHEN** the table already holds the declared maximum row count, and an
  actor holding `system:admin` submits a further new `(area, locale, key)`
- **THEN** the system refuses the request and stores no row

### Requirement: An override is never stored empty

An override exists only while it replaces something. The system SHALL
refuse an empty-string `value`, and SHALL treat a `null` value as the
instruction to delete the row.

A stored empty string would resolve ahead of the builtin value and render
a blank label. The resolver reads absence and emptiness differently. The
write path refuses the empty string, and that keeps the fallback total.

#### Scenario: The system refuses an empty value rather than storing it

- **WHEN** an actor holding `system:admin` submits an empty string as the
  `value` for `(area, locale, key)`
- **THEN** the system refuses the request, and keeps any existing
  override for that key as it was

#### Scenario: A key with no override renders its builtin value, never blank

- **WHEN** no override row exists for `(area, locale, key)`
- **THEN** the area's screen shows the builtin catalog value for that key

### Requirement: A failed override read leaves every builtin value in place

The override read runs before the first render. The system SHALL treat a
failed read as an empty override map. It SHALL render every screen from
its builtin catalog. A deployment whose override read fails SHALL still
reach its login screen.

#### Scenario: The override read fails at boot

- **WHEN** the override read returns an error, or the request does not
  complete
- **THEN** the login screen renders, showing its builtin wording
