# definition-store — delta for hash-the-parsed-body

## ADDED Requirements

### Requirement: Publish round-trips through validation

The body a publish persists, the body it returns, and the `definitionHash` it
computes SHALL all derive from the validated parse output of the authored body,
not from the raw input. Content the contract schemas do not declare (unknown
keys, at any depth) therefore SHALL NOT reach the hash or the store: publishing
a body carrying such content is equivalent to publishing its stripped form. A
publish→read round trip is hash-stable — for every persisted version,
`definitionHash(resolveBody(pin)) === pin.definitionHash` — and both publish
return paths (fresh insert and idempotent hash-hit) return a body with this
property.

#### Scenario: Unknown authored keys never reach the hash or the store

- **WHEN** an authored body carrying an extra unknown key (e.g. an editor
  annotation on a step) is published
- **THEN** the persisted body and the returned `definition` do not contain the
  key, and the version's `definitionHash` equals the hash of the stripped body

#### Scenario: A publish→read round trip is hash-stable

- **WHEN** a body published with an extra unknown key is later resolved through
  the store
- **THEN** recomputing `definitionHash` over the resolved body yields the
  version's persisted `definitionHash`

#### Scenario: An instance created from the publish return value rehydrates

- **WHEN** an instance is created from the `definition` returned by the insert
  path of a publish whose authored input carried an unknown key
- **THEN** rehydrating that instance against the store-resolved body succeeds
  (no pin mismatch)

#### Scenario: Re-publishing the read-back body is a no-op

- **WHEN** the body resolved from a published version is published again for the
  same `processId`
- **THEN** no new version is created and the existing version is returned
