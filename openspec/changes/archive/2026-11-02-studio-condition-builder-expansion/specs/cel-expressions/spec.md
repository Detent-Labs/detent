# Spec Delta

## ADDED Requirements

### Requirement: The authoring-time check admits ordering between string operands

The authoring-time type check SHALL admit the four ordering comparators,
`<`, `<=`, `>` and `>=`, between two `string` operands. It SHALL admit them
between a `string` operand and a string literal too. A field with `format: "date"` stores `YYYY-MM-DD`, whose lexical order is its calendar order. A `datetime` value may carry seconds and a zone offset, so its lexical order is not its calendar order. The studio's date ordering operators depend on this admission.

#### Scenario: Two date fields compare in order

- **WHEN** a guard reads `data.end_date > data.start_date`
- **AND** both fields are `{type: "string", format: "date"}`
- **THEN** the check accepts the guard

#### Scenario: A date field compares against a date literal

- **WHEN** a guard reads `data.due_date <= "2026-12-31"`
- **AND** `due_date` is a `{type: "string", format: "date"}` field
- **THEN** the check accepts the guard
