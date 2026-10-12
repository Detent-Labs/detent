# Spec Delta

## ADDED Requirements

### Requirement: A request-shape error tells the reader to narrow the date range

When a reporting view answers with a request-shape error, the screen SHALL
tell the reader to narrow the date range. The sentence appears in English and
in German, from the reporting catalog. A reporting view answers a request-shape
error for a range that holds too many instances.

#### Scenario: A refused range tells the reader to narrow it

- **WHEN** the server answers a view request with a request-shape error
- **THEN** the screen shows its error note
- **AND** the note tells the reader to narrow the date range
