<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the
     rest of this repo's specs use (see data-retention/spec.md's own
     allow-file passive-voice for the same reason). That grammar is
     structurally passive ("WHEN X is called", "THEN Y is deleted");
     rewriting it to dodge the rule would break the required Scenario
     format. -->

## RENAMED Requirements

- FROM: `### Requirement: redactInstance clears personal data across five relations`
- TO: `### Requirement: redactInstance clears personal data across six relations`

## MODIFIED Requirements

### Requirement: redactInstance clears personal data across six relations

`redactInstance(instanceId, db, opts?: { actor?, reason? })`
(`src/engine/retention.ts`) SHALL clear a non-`running` instance's
personal data in one transaction. It SHALL set `instances.body.data` to
`{}` and stamp `instances.redacted_at` to the current time. It SHALL also
delete every row in `instance_comments`, `instance_attachments`, and
`instance_drafts` whose `instance_id` matches.

The optional `opts` names who asked and why. The automatic sweep supplies
neither, and the audit entries then carry a null actor.

It SHALL redact a field only when two conditions both hold. First, the
instance's audit log holds an entry for that field. Second, the
instance's currently pinned version marks the field `redactable` in its
field catalog (`definition-contract`). Consider a field the audit log
holds an entry for, whose currently pinned version does not mark it
`redactable`. That field SHALL keep its existing entries untouched,
including one whose id is absent from the catalog entirely.

The audit log is the fifth relation. It is the only one redaction
neither leaves alone, deletes from, nor clears unconditionally. Its rows
stay and the redactable fields' values go. The log still shows that a
field changed, when, and at whose hand. That holds for a redactable field
as much as for one that stays intact.

The instance's visibility state (`instance-visibility-set`) is the sixth
relation. Redaction SHALL delete it in the same transaction. That covers its
principal rows and any revocation rows standing against them. Each names a
person. Each is personal data itself, and neither outlives the values it stood
beside.

Deleting the set makes a redacted instance invisible under
`scope: "visible"`. That is the intended outcome. A redacted instance holds no
field value a participant could want. The reader who lost it took no action to
lose it.

Redaction is one of the two things that delete a principal. An administrative
revocation is the other. The `instance-visibility-set` capability names both.

The `history_entries` and `instance_events` relations SHALL NOT be
touched. Neither carries a field value, so neither needs redaction. That
reasoning no longer covers the audit log, which holds field values by
design.

#### Scenario: Redacting a completed instance clears data and deletes rows

- **WHEN** `redactInstance` is called for a `completed` instance holding field
  data, comments, attachments, and a form draft
- **THEN** the instance's `data` becomes `{}`, `redacted_at` is set, and every
  `instance_comments`/`instance_attachments`/`instance_drafts` row for that
  instance is deleted

#### Scenario: The audit trail survives redaction

- **WHEN** an instance is redacted
- **THEN** its `history_entries` and `instance_events` rows are
  unchanged, so the instance's transition and event history still reads
  in full

#### Scenario: Redaction clears the audit log's values and keeps its rows

- **WHEN** `redactInstance` runs on an instance whose audit log holds
  an entry for a field marked `redactable: true`
- **THEN** that field's original entries remain, each holding no value and
  no salt. The wipe's own entries and the redaction's stand beside them

#### Scenario: A non-redactable field's audit values survive redaction

- **WHEN** `redactInstance` runs on an instance whose audit log holds
  an entry for a field not marked `redactable`
- **THEN** that field's entries keep their original values and salts
  unchanged, and no `redact` entry is appended for it

#### Scenario: A redacted instance's chain still verifies

- **WHEN** chain verification runs after `redactInstance`
- **THEN** it reports the chain as holding

#### Scenario: Redaction deletes the principal set

- **WHEN** `redactInstance` runs on an instance carrying principals
- **THEN** no principal row for that instance remains

#### Scenario: A redacted instance leaves its participants' visible list

- **WHEN** actor A, a principal of an instance, calls the instance list with
  `scope: "visible"` after that instance is redacted
- **THEN** the result excludes it

#### Scenario: A failed redaction keeps the principal set

- **WHEN** a `redactInstance` transaction fails
- **THEN** the instance's principals are unchanged, alongside its data
