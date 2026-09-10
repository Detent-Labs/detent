## MODIFIED Requirements

### Requirement: A view entry's group names a group field the same view carries

A `view.fields[].group` SHALL name the `key` of a `type: "group"` field the
body declares, at any depth in the catalog. The same view SHALL carry a field
entry whose `ref` names that group field. A body failing either half SHALL
fail to publish.

Both halves earn their place. The renderer draws only the entries carrying no
`group`, and a group field draws the entries naming its own key. A `group`
naming nothing therefore hides its entry. A `group` naming a field the view
leaves out hides it the same way. Neither shape produces a message today, and
the author meets a blank form.

An absent `group` and an empty one both mean the entry sits at the form's
root. The rule reaches a non-empty `group` alone.

A third half applies to a field entry, one carrying a `ref`. Its `group` SHALL
name the `key` of the group field that holds that field in the catalog's own
`fields`. The catalog answers where a field belongs, once, for the whole
process. An entry naming any other group field SHALL fail to publish. A field
the catalog holds at the top level SHALL have no `group` at all.

That half reaches a group field's own entry the same way. A group nested
inside another group carries the outer group's key, and no other.

A note entry is exempt from the parentage half. A note names no catalog field,
so no group holds it. Its `group` may name any group field the same view
carries. The first two halves still bind it.

The compile pass carries this check, on the write path. Three published bodies
violate the first two halves today, and more violate the parentage half. A
schema refinement sits on the read path, so it would strand every instance
pinned to one of them. That is the placement criterion
`An authoring invariant argues its own placement` already states.

#### Scenario: Publish rejects a group naming no catalog field

- **WHEN** a step's `view.fields` holds an entry whose `group` matches no field
  key in the body
- **THEN** the body fails to publish, and the error names the step and the
  unresolved group

#### Scenario: Publish rejects a group naming a plain field

- **WHEN** a step's `view.fields` holds an entry whose `group` matches the key
  of a field whose `type` is not `"group"`
- **THEN** the body fails to publish

#### Scenario: Publish rejects a group the view leaves out

- **WHEN** a step's `view.fields` holds an entry whose `group` names a group
  field's key
- **AND** no entry in that same view carries a `ref` naming that group field
- **THEN** the body fails to publish

#### Scenario: Publish rejects a field entry naming a group that does not hold it

- **WHEN** a step's `view.fields` holds a field entry whose `group` names a
  group field the same view carries
- **AND** the catalog holds that field under a different group
- **THEN** the body fails to publish, and the error names the step, the entry
  and the group the catalog declares

#### Scenario: Publish rejects a group on a top-level field

- **WHEN** a step's `view.fields` holds a field entry carrying a non-empty
  `group`
- **AND** the catalog holds that field at the top level, under no group
- **THEN** the body fails to publish

#### Scenario: A field entry naming its own catalog parent publishes

- **WHEN** a step's `view.fields` holds a field entry whose `group` names the
  group field that holds it in the catalog
- **AND** the same view carries a `ref` to that group field
- **THEN** the body publishes, subject to every other invariant

#### Scenario: One field carries one group across every step

- **WHEN** a body places one catalog field on the views of three steps
- **AND** two of those entries name the field's catalog parent group
- **AND** the third names a different group its own view carries
- **THEN** the body fails to publish on the third entry alone

#### Scenario: A note entry follows the same rule

- **WHEN** a step's `view.fields` holds a note entry whose `group` names no
  group field the same view carries
- **THEN** the body fails to publish

#### Scenario: A note entry names a group no catalog tie binds

- **WHEN** a step's `view.fields` holds a note entry whose `group` names a
  group field the same view carries
- **THEN** the body publishes, because a note has no catalog parent to agree
  with

#### Scenario: A well-formed grouped view publishes

- **WHEN** a step's `view.fields` carries a `ref` to a group field, plus
  entries whose `group` names that field's key
- **AND** the catalog holds each of those fields under that group
- **THEN** the body publishes, subject to every other invariant

#### Scenario: An empty group reads as no group

- **WHEN** a step's `view.fields` holds an entry whose `group` is the empty
  string
- **THEN** the body publishes, and the entry sits at the form's root

#### Scenario: A group nested inside another group resolves

- **WHEN** a group field's own view entry carries a `group` naming the outer
  group field that holds it in the catalog
- **AND** the same view carries a `ref` to that outer group field
- **THEN** the body publishes

#### Scenario: A body published before this rule still reads

- **WHEN** an instance pinned to a version violating this rule loads its body
- **THEN** the body parses, because the check sits on the write path alone
