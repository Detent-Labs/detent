<!-- antislop: allow-file passive-voice -->
<!-- passive-voice: SHALL-form normative spec prose, the convention the base
     spec at openspec/specs/local-user-accounts/spec.md already follows. -->

## ADDED Requirements

### Requirement: Addresses resolve from a set of user ids in one lookup

The account store SHALL answer a set of `user_id` values with the email
address each one holds. The answer SHALL carry no entry for an id matching no
row. It SHALL carry no entry for a disabled account either.

A disabled account is one nobody may act under. An address that reaches nobody
who can answer is worse than no address: it looks delivered and is not.

The lookup SHALL take one round trip whatever the size of the set. A caller
resolving a candidate list would otherwise send one query per candidate.

The lookup SHALL accept the empty set and answer with nothing. Every caller
holds a list whose length it did not choose. The empty case is therefore
ordinary, not a fault.

#### Scenario: Two ids resolve to two addresses

- **WHEN** a caller asks for the addresses of two enabled accounts
- **THEN** the answer carries both addresses

#### Scenario: An unknown id contributes nothing

- **WHEN** a caller asks for the addresses of one enabled account and one id
  matching no row
- **THEN** the answer carries the enabled account's address alone

#### Scenario: A disabled account contributes nothing

- **WHEN** a caller asks for the addresses of one enabled and one disabled
  account
- **THEN** the answer carries the enabled account's address alone

#### Scenario: The empty set answers with nothing

- **WHEN** a caller asks for the addresses of no ids
- **THEN** the answer is empty, and the store is not queried
