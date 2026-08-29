<!-- antislop: allow-file passive-voice -->
<!-- The SHALL/WHEN/THEN Gherkin grammar this repo's specs use is structurally passive; see instance-audit-log/spec.md and admin-operations-api/spec.md under openspec/specs/ for the same directive and reason. -->

## ADDED Requirements

### Requirement: An authorized reader can list one instance's entries in order

The engine SHALL expose a read over one instance's audit log, beside the
existing chain verification. It SHALL return entries in ascending `seq`
order, keyset-paginated the way `getInstanceRecord` already paginates the
transition/event record.

Each returned entry SHALL carry its `seq`, `transitionSeq`, `fieldId`,
`op`, `actor`, `source`, `reason` and `at`. A `set` entry SHALL also
carry `value`. A `redact` entry, and a `set` entry a later redaction
cleared, SHALL carry no `value`. No returned entry SHALL carry `salt`,
`valueHash`, `prevHash` or `hash`. Those columns exist for the chain,
not for a reader.

This read SHALL NOT recompute or bypass `verify_instance_chain`. Reading
entries and verifying the chain stay two separate operations. A caller
who only lists entries never pays the cost of a full-chain verification.
A caller who only verifies never pays the cost of paging through
values.

#### Scenario: Entries read in sequence order

- **WHEN** an instance's audit log holds five entries across two fields
- **THEN** a read of that instance's audit log returns all five, ordered
  by `seq` ascending

#### Scenario: A redacted entry's value reads as absent, not null-as-a-value

- **WHEN** a field's earlier entries were redacted
- **THEN** each redacted entry's `value` is absent, distinguishable from a
  `set` entry whose value is a JSON null

#### Scenario: The read carries no chain-internal columns

- **WHEN** an instance's audit log is read
- **THEN** no returned entry carries `salt`, `valueHash`, `prevHash` or
  `hash`
