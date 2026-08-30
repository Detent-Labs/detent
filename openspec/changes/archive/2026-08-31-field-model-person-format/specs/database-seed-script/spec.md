## ADDED Requirements

### Requirement: The script seeds one demo group under a fixed id

The seed script SHALL write one demo group whose id is the literal
`group_it_ops`. The row SHALL carry a global scope. It SHALL list the seeded
`system:admin` and `system:author` accounts as its members. A re-run SHALL
refresh that row's name, scope and members. It SHALL NOT add a second row,
and it SHALL NOT fail.

The script SHALL write the row directly rather than through `createGroup`.
That helper mints a `group_<uuid>` on every call. `group-administration`
keeps the mint a guarantee, so the two paths stay separate. A fixture an
example body names by id needs the opposite of a minted id.

`examples/access-request.json` names `group_it_ops` in its `allowedGroups`
and in its `org.group-members` step. The script SHALL publish that example
after the group row exists. The publish-time check in
`group-scope-validation` resolves every `allowedGroups` entry against the
store, so the order is load-bearing.

#### Scenario: Seeding the demo group on an empty database
- **WHEN** a contributor runs `bun run seed` against a database holding no
  group
- **THEN** a group with the id `group_it_ops` exists, globally scoped,
  carrying the two demo accounts as members

#### Scenario: The person-format example publishes unchanged
- **WHEN** the seed script publishes `examples/access-request.json` after
  writing that group row
- **THEN** the publish succeeds, and the committed body carries the same
  group id it always named

#### Scenario: Re-running does not duplicate the group
- **WHEN** the seed script runs a second time with the group already present
- **THEN** `groups` still holds one `group_it_ops` row, and its name, scope
  and members match the script's current definition
