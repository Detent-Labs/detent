<!-- antislop: allow-file passive-voice -->
<!-- Matches this capability's own top-of-file allow-file passive-voice:
     every scenario uses the fixed SHALL/WHEN/THEN Gherkin grammar the
     rest of persistence/spec.md already carries this exemption for. -->

## ADDED Requirements

### Requirement: Instance redaction state is a nullable column

The datastore SHALL carry a nullable `instances.redacted_at
timestamptz` column. `initSchema` SHALL add it with:

`ALTER TABLE instances ADD COLUMN IF NOT EXISTS redacted_at timestamptz`

This is the same additive pattern every prior `instances` column
already follows: `resolve_state`, `cancel_sweep_state`,
`next_timer_at`, and `created_at`. A matching optional
`Instance.redactedAt` field SHALL join `src/schema/definition.ts`.

An instance row with `redacted_at IS NULL` SHALL be treated as not
redacted, whether it predates this column or was never redacted.

#### Scenario: Initialisation adds the column

- **WHEN** the schema is initialised on a database created before this
  capability
- **THEN** `instances` gains a `redacted_at timestamptz` column, nullable,
  with no default

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and `redacted_at` is unchanged

#### Scenario: A pre-existing instance reads as not redacted

- **WHEN** an instance row created before this column existed is read
- **THEN** its `redactedAt` is absent, the same as an instance whose
  `redacted_at` is `NULL`
