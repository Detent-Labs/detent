<!-- antislop: allow-file passive-voice -->
<!-- WHEN/THEN scenarios name a condition, not an actor. Every spec under
     openspec/specs/ carries the same passive phrasing. -->

## ADDED Requirements

### Requirement: The script refuses to run without an explicit opt-in.
The seed script SHALL read the `SEED_ALLOW` environment variable. Without
a value, the script SHALL exit non-zero and write nothing to the
database. The demo accounts carry a fixed, published password, and one of
them holds `system:admin`. The person who runs the script therefore names
the target database as a development one.

`add-database-seed-data` accepted a weaker mitigation. The script never
runs on its own. No production deployment path existed then. Roadmap #14
shipped one.

#### Scenario: Running without the opt-in
- **WHEN** a contributor runs `bun run seed` with no `SEED_ALLOW` value
- **THEN** the script exits non-zero, and writes no process version and
  no demo user
