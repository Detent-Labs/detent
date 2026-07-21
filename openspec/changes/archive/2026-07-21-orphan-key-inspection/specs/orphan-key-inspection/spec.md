## ADDED Requirements

### Requirement: Scan a process version's instances for orphan data keys
Given a `processId` and a published `version`, the engine SHALL provide a read-only
scan that reports, for every instance currently pinned to that `{processId, version}`,
which keys in `data` are absent from that version's field catalog. The catalog is
flattened to leaf field ids only — a `group` field is a UI container and never a
`data` key, so it SHALL NOT appear as, or be checked against, an orphan key. The scan
SHALL NOT modify any instance, plan, or definition; it is purely observational.

#### Scenario: An instance carries a key its pinned version's catalog does not declare
- **WHEN** a scan runs for `{processId, version}` and a pinned instance's `data` holds
  a key with no matching leaf field id in that version's catalog
- **THEN** that instance id and the offending key(s) appear in the scan's result

#### Scenario: Every data key is declared
- **WHEN** a scan runs for `{processId, version}` and every pinned instance's `data`
  keys all match a leaf field id in that version's catalog
- **THEN** the scan's result contains no entry for those instances

#### Scenario: A group field is never treated as a data key
- **WHEN** a version's catalog declares a `group` field and a scanned instance's
  `data` happens to hold a key equal to that group's field id
- **THEN** the scan still reports that key as orphaned, since a group id is never a
  valid `data` key regardless of catalog declaration

### Requirement: Scan covers every instance status
The scan SHALL include instances of any status pinned to the given `{processId,
version}`, not only running ones — a terminal instance's `data` is a permanent record
and can carry an orphan key exactly as a running instance can.

#### Scenario: A completed instance carries an orphan key
- **WHEN** a scan runs for `{processId, version}` and a terminal (non-running)
  instance pinned to that version holds a `data` key absent from the catalog
- **THEN** that instance id and the offending key(s) appear in the scan's result

### Requirement: An unreadable instance row does not abort the scan
Consistent with the fault-isolation already required of the migration operation and
the three background drains, the scan SHALL process each instance row independently:
a row whose stored body cannot be parsed is reported separately and SHALL NOT prevent
the scan from completing over the rest of the instances pinned to that version.

#### Scenario: One unreadable row among readable ones
- **WHEN** a scan runs over a page of instances pinned to `{processId, version}` and
  one row's stored body fails to parse
- **THEN** that instance id is reported as unreadable, and every other instance in
  the page is still scanned for orphan keys

### Requirement: An unresolvable version fails the call
The scan SHALL fail immediately, without scanning any instance, when the version
resolver cannot resolve the given `{processId, version}` to a published body — the
caller supplied an invalid version, which is not the same failure as an individual
instance row being unreadable.

#### Scenario: The given version is not published
- **WHEN** a scan is requested for a `{processId, version}` that does not resolve to
  a published body
- **THEN** the call fails and no instance is scanned or reported
