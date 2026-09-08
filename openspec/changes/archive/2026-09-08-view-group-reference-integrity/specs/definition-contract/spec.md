## ADDED Requirements

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

The view holds presentation, so a `group` need not follow the catalog's own
nesting. An entry may name any group field the same view carries.

This rule reaches a note entry too. A note carries `group` and takes its place
inside the container like a field entry.

The compile pass carries this check, on the write path. Three published bodies
violate the rule today. A schema refinement sits on the read path, so it would
strand every instance pinned to one of them. That is the placement criterion
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

#### Scenario: A note entry follows the same rule

- **WHEN** a step's `view.fields` holds a note entry whose `group` names no
  group field the same view carries
- **THEN** the body fails to publish

#### Scenario: A well-formed grouped view publishes

- **WHEN** a step's `view.fields` carries a `ref` to a group field, plus
  entries whose `group` names that field's key
- **THEN** the body publishes, subject to every other invariant

#### Scenario: An empty group reads as no group

- **WHEN** a step's `view.fields` holds an entry whose `group` is the empty
  string
- **THEN** the body publishes, and the entry sits at the form's root

#### Scenario: A group nested inside another group resolves

- **WHEN** a group field's own view entry carries a `group` naming an outer
  group field the same view also carries
- **THEN** the body publishes

#### Scenario: A body published before this rule still reads

- **WHEN** an instance pinned to a version violating this rule loads its body
- **THEN** the body parses, because the check sits on the write path alone
