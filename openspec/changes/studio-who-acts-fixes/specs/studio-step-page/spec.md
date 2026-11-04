## MODIFIED Requirements

### Requirement: The page opens on the section that needs the author

On open, the page SHALL open the first section carrying an open check. It
SHALL open the first section still to do when no section carries a check. It
SHALL open the first section when none is to do.

A section is to do where it is empty and the step needs it. Those are Ways
out and Which process it calls. Who acts counts on a task step with a manual
way out or none. How the case ends counts where the process declares
outcomes. Who acts also counts wherever it stands and holds a strategy whose
config does not hold.

#### Scenario: A check decides which section opens first

- **WHEN** a step opens with a check on a time limit and none elsewhere
- **THEN** Time limit stands open

#### Scenario: An unassigned task step opens on Who acts

- **WHEN** a task step opens with no assignment and no open check
- **THEN** Who acts stands open

#### Scenario: A complete step opens on its first section

- **WHEN** a task step opens with an assignment, a way out and no open check
- **THEN** Who acts stands open

#### Scenario: An automatic step does not open on Who acts

- **WHEN** a task step with no assignment has two automatic ways out and no
  open check
- **THEN** Who acts has no To do word
- **AND** the page opens on Who acts only because it is the first section

#### Scenario: An incomplete strategy opens Who acts on an automatic step

- **WHEN** a task step with two automatic ways out holds `{ "candidates": [] }` and no open check
- **THEN** Who acts stands open
- **AND** Who acts carries the To do word

## ADDED Requirements

### Requirement: Who acts offers a way back to no assignment

The Who acts strategy picker SHALL open on "Nobody in particular". Choosing it SHALL remove the step's `assignment` key from the draft, its `description` included.

#### Scenario: Choosing nobody removes the key

- **WHEN** a task step assigns a group's members and the author chooses "Nobody in particular"
- **THEN** the draft's step has no `assignment` key
- **AND** the Checks tab gains no issue from the choice

#### Scenario: A stored empty type can still reach nobody

- **WHEN** a step's strategy holds an empty `type`
- **THEN** the picker shows a separate placeholder as its value
- **AND** "Nobody in particular" stays a choice that removes the key

#### Scenario: A switch to nobody and back restores the config

- **WHEN** the author chooses "Nobody in particular" and then chooses the old strategy again
- **THEN** the draft's `config` and `description` hold what that strategy held before

#### Scenario: The way back survives a missing registry

- **WHEN** the registry has not loaded or its read failed
- **THEN** the picker still offers "Nobody in particular"
- **AND** the section draws no free-text type input

### Requirement: An empty Who acts section asks for one choice

A step with no strategy type SHALL show the strategy picker and no other Who acts control. The raw JSON box and the Description input SHALL stand only once the author picks a strategy.

#### Scenario: A new step shows the picker alone

- **WHEN** the author opens Who acts on a new task step
- **THEN** the section shows the strategy picker
- **AND** the section shows no Settings (JSON) box and no Description input

### Requirement: A fixed list names people or roles in words

The fixed-list control SHALL read the caption "People or roles, one per line". The curated strategies' captions SHALL NOT print a config key.

A plugin strategy's generated form keeps its schema key, since the registry states nothing else.

#### Scenario: The caption replaces the key

- **WHEN** a step takes the fixed-list strategy
- **THEN** the control's caption reads "People or roles, one per line"
- **AND** the word `candidates` stands nowhere outside a Developer view and Edit as JSON

### Requirement: The group strategy picks a group by name

The group strategy SHALL show one picker listing the groups open to this process by name. The author SHALL NOT type or see a group id. A held group can stand on the process's list while the route omits it. That group SHALL read its id, marked as not offered.

#### Scenario: Picking a group writes its id

- **WHEN** the author picks the group named IT Ops
- **THEN** the draft's `config` reads `{ "groupId": "group_it_ops" }`

#### Scenario: A held group outside the offer stays visible

- **WHEN** the step holds a group id on the process's list that the route no longer returns
- **THEN** the picker shows that id marked as not offered

### Requirement: The group picker states its waiting, failed and empty states

The group picker SHALL print one line while the groups load. A failed read SHALL print its message where the picker stands. Edit as JSON SHALL stay reachable. An empty list SHALL say that no group is open to this process. It SHALL say that an operator adds one on the admin Groups screen.

#### Scenario: No group is open to the process

- **WHEN** the route returns no group
- **THEN** the section says so in words and offers no empty picker

#### Scenario: An empty route with a held group keeps the picker

- **WHEN** the route returns no group and the step holds an id on the process's list
- **THEN** the picker stands with that id marked as not offered
- **AND** the empty sentence stands under it

#### Scenario: The read fails

- **WHEN** the groups read fails
- **THEN** the section prints the message in the picker's place
- **AND** Edit as JSON stays available

### Requirement: Picking a group keeps the process's group list

A picked group SHALL join `allowedGroups` in the same draft write as its `groupId`. The author SHALL NOT edit that list by hand to finish the strategy.

#### Scenario: The pick writes both lists

- **WHEN** the process has no `allowedGroups` and the author picks IT Ops
- **THEN** `allowedGroups` holds `group_it_ops`
- **AND** the Checks tab shows no group issue for the step

#### Scenario: A group already listed stays once

- **WHEN** `allowedGroups` already holds the picked group
- **THEN** the list holds that id once

#### Scenario: A held id missing from the list reads as unchosen

- **WHEN** the step holds a group id missing from `allowedGroups`
- **THEN** the picker reads its "Choose a group" placeholder
- **AND** picking that group again writes both lists

#### Scenario: A switch back restores the list entry

- **WHEN** leaving a group for the starter's manager took the id off `allowedGroups`
- **AND** the author then chooses the group strategy again
- **THEN** `allowedGroups` holds the id
- **AND** the picker shows the group chosen
- **AND** the Checks tab shows no group issue for the step

### Requirement: Leaving a group drops an entry nothing else reads

Picking another group, choosing another strategy or choosing nobody SHALL remove the old id from `allowedGroups` when two facts hold. No other step's strategy names it, and no bare person field reads the list. A bare person field declares `format: "person"` with neither `options` nor `dataSource`. An emptied list SHALL leave the body.

#### Scenario: An unread entry leaves

- **WHEN** one step names `group_it_ops`, no bare person field exists, and the author picks another group
- **THEN** `allowedGroups` holds the new group alone

#### Scenario: A second step keeps the entry

- **WHEN** another step also names the old group
- **THEN** `allowedGroups` keeps the old id

#### Scenario: A bare person field keeps the entry

- **WHEN** a bare person field exists and the author chooses nobody
- **THEN** `allowedGroups` keeps the old id

#### Scenario: Raw JSON leaves the list alone

- **WHEN** the author edits `groupId` through Edit as JSON
- **THEN** `allowedGroups` stays as it was

### Requirement: The group picker names its effect on a person field

One note SHALL stand under the picker while the step holds a group and a bare person field exists. The note SHALL say the process's people pickers offer this group too.

#### Scenario: The note stands with a bare person field

- **WHEN** the step holds a group and a bare person field exists
- **THEN** the note stands under the picker

#### Scenario: No person field, no note

- **WHEN** the step holds a group and no bare person field exists
- **THEN** no such note stands

### Requirement: The person-field strategy picks a field by label

The person-field strategy SHALL show one picker listing the single-person fields by label, nested fields included. The author SHALL NOT type or see a field id. A held field for several people SHALL read in the list, marked. A note SHALL say the step then reaches nobody.

#### Scenario: Picking a field writes its id

- **WHEN** the author picks the field labelled Approver
- **THEN** the draft's `config` holds that field's `fieldId`

#### Scenario: A list field is not offered

- **WHEN** a process declares a People list field and the step does not hold it
- **THEN** the picker does not list that field

#### Scenario: A note explains a held list field

- **WHEN** the step holds a field of `type: "list"` and `format: "person"`
- **THEN** the picker shows it marked as holding several people
- **AND** a note says the step reaches nobody until the author chooses a field that holds one

#### Scenario: A held field the picker does not offer reads as unchosen

- **WHEN** the step holds a field id the catalog lacks, or a field without `format: "person"`
- **THEN** the picker reads its "Choose a field" placeholder
- **AND** no id stands on screen

### Requirement: The author can add a person field from Who acts

The person-field strategy SHALL offer "Add a person field". It SHALL take a name inline and press Add. One draft write SHALL add the single-person field to the catalog and write its `fieldId` to the strategy. The section SHALL keep the author in place and SHALL NOT place the field on any form.

#### Scenario: Adding selects the new field

- **WHEN** the author names a new field Approver and presses Add
- **THEN** the catalog holds a person field labelled Approver
- **AND** the picker shows it chosen
- **AND** each step's form stays as it was

#### Scenario: An empty name adds nothing

- **WHEN** the name input holds only spaces
- **THEN** the Add control stays disabled

#### Scenario: Cancel leaves the draft alone

- **WHEN** the author cancels the inline name
- **THEN** the draft stays as it was and the control returns

### Requirement: Who acts warns about a field nothing writes

The section SHALL print a note under the person-field picker while no source writes the chosen field. Three sources count: another step's editable, visible form entry, a default, and a structural writer outside this step. The note SHALL say the step reaches nobody until an earlier form asks for the field.

#### Scenario: A new field carries the note

- **WHEN** the author adds a person field no form asks for
- **THEN** the note stands under the picker

#### Scenario: A form entry clears the note

- **WHEN** another step's form asks for the chosen field and the entry is editable
- **THEN** the note does not stand

#### Scenario: An entry on this step does not count

- **WHEN** the chosen field's only editable entry stands on the assigned step
- **THEN** the note stands

#### Scenario: A hidden entry does not count

- **WHEN** the chosen field's only entry declares `visible: false`
- **THEN** the note stands

#### Scenario: An expression default counts

- **WHEN** the chosen field's `default` is a CEL expression
- **THEN** the note does not stand

#### Scenario: This step's own action does not count

- **WHEN** the chosen field's only writer is an action on the assigned step
- **THEN** the note stands

#### Scenario: No note without a chosen field

- **WHEN** the picker reads its placeholder, or the step holds a list field
- **THEN** the note does not stand

#### Scenario: A read-only entry does not count

- **WHEN** the chosen field's only form entry is read-only
- **THEN** the note stands

### Requirement: Who acts reads Done only when its config holds

The Who acts header SHALL carry the Done mark only when the strategy names a type and its config holds. A strategy with no description in `GET /registry` SHALL read Done on its type alone. A held config missing a value SHALL read "To do" on every step kind that stands Who acts. An open check SHALL show its count instead. A person-field strategy whose note says the step reaches nobody SHALL also read "To do".

#### Scenario: An empty group reads as not done

- **WHEN** a step takes the group strategy, its config has no `groupId`, and the draft compiles
- **THEN** the header carries the count of its open check
- **AND** the header has no Done mark

#### Scenario: An empty group reads To do while the draft does not compile

- **WHEN** a step takes the group strategy and its config has no `groupId`
- **AND** another step carries a structural issue
- **THEN** the header reads "To do"
- **AND** the header has no Done mark

#### Scenario: A config that is not an object has no Done mark

- **WHEN** raw JSON stores `null` as a fixed-list strategy's config
- **THEN** the header carries the count of its open check
- **AND** the header has no Done mark
- **AND** the step page keeps rendering

#### Scenario: An incomplete strategy reads To do on an end step

- **WHEN** an end step holds a fixed-list strategy with `{ "candidates": [] }`
- **THEN** the header reads "To do"

#### Scenario: An emptied list reads To do

- **WHEN** a fixed-list step holds `{ "candidates": [] }`
- **THEN** the header reads "To do"
- **AND** the Checks tab shows no issue for it, since a publish accepts it

#### Scenario: A held config reads Done

- **WHEN** a step's group strategy names a group on the process's list
- **THEN** the header carries the Done mark

#### Scenario: A field nothing writes reads To do

- **WHEN** a step's person-field strategy holds a field no source writes
- **THEN** the header reads "To do" and has no Done mark
- **AND** the Checks tab shows no issue for it, since a publish accepts it

#### Scenario: A held list field reads To do

- **WHEN** a step's person-field strategy holds a field for several people
- **THEN** the header reads "To do" and has no Done mark

#### Scenario: A written field reads Done

- **WHEN** another step's form asks for the chosen single-person field
- **THEN** the header carries the Done mark

#### Scenario: A strategy with no description reads on its type

- **WHEN** a step's strategy type has no description in `GET /registry`
- **THEN** the header carries the Done mark
