# studio-forms-overview Specification

## Purpose

The Forms tab gathers every form a process asks a participant to fill in. One
card per step carries a miniature of that step's form. An author reads the
whole process's paperwork at a glance and opens any one of them.

## Requirements

### Requirement: The Forms tab carries one card per step that asks for something

The Forms tab SHALL carry one card for every step that declares a view. A step
declaring no view SHALL have no card. The cards SHALL follow the same order the
steps rail uses, which is the draft's own order.

The tab SHALL lay the cards in a grid that reflows with the window width.

<!-- Why: "carries no card" is the screen's own phrasing, and a delta must match this scenario name. -->
<!-- antislop: allow negation-habit -->
#### Scenario: A step without a view carries no card

- **WHEN** a draft holds three task steps and one of them declares no view
- **THEN** the Forms tab carries two cards

#### Scenario: The cards follow the steps order

- **WHEN** an author reads the Forms tab
- **THEN** the first card names the first step in the draft's own order that
  declares a view

### Requirement: A card names its step and counts the fields it draws

A card SHALL carry a kicker naming the step's kind. Under the kicker it SHALL
carry the step's label. The card's foot SHALL carry the number of field
entries the view holds that the miniature draws as a mark. A group entry and
a note entry add nothing to that number. Where at least one of those entries
declares `required: true`, the same sentence SHALL state how many do. That
text SHALL share one row with the control that opens the form editor.

A view holding no entry that draws a mark SHALL read as an empty form. A view
holding only notes, only group entries, or both reads as empty too. That card
SHALL take the advisory color the checks already use for an empty form. Its
foot SHALL leave the count out.

#### Scenario: A card counts its field entries

- **WHEN** a step's view holds four field entries
- **THEN** its card reads four fields

#### Scenario: A group entry adds nothing to the count

- **WHEN** a step's view holds a group entry and two field entries inside it
- **THEN** its card reads two fields

#### Scenario: The count states the required entries

- **WHEN** a step's view holds four field entries and one of them declares
  `required: true`
- **THEN** its card's foot reads four fields, one required

#### Scenario: A form without a required entry reads its count alone

- **WHEN** a step's view holds three field entries and none declares
  `required: true`
- **THEN** its card's foot reads three fields
- **AND** the foot states no required count

#### Scenario: The count stands beside the open control

- **WHEN** an author reads a card
- **THEN** the field count and the open control share the card's last row

#### Scenario: An empty form marks itself

- **WHEN** a step's view has no field entry
- **THEN** its card names the form as empty
- **AND** the card takes the advisory color
- **AND** its foot leaves the count out

#### Scenario: A form of notes alone reads as empty

- **WHEN** a step's view holds one note and no field entry
- **THEN** its card names the form as empty

#### Scenario: A form of group entries alone reads as empty

- **WHEN** a step's view holds one group entry and no other field entry
- **THEN** its card names the form as empty

### Requirement: A card draws a miniature of its form for the eye alone

A card SHALL carry a miniature of the step's form. The miniature SHALL follow
the view's own order. Each field entry other than a group entry SHALL
contribute one mark, drawn without a label. A group entry SHALL contribute a
group break in place of a mark. A note entry SHALL contribute neither.

A mark SHALL take its height from the field's kind, so a long-text field reads
taller than a one-line field. An ordinary mark SHALL draw as an outline. A
required entry's mark SHALL fill solid, in a color apart from the outline's.
Marks that outgrow the card's width SHALL continue on a further line, each
one kept whole.

The miniature SHALL stay out of the accessibility tree, with no name and no
role of its own. The card's foot states its counts in text instead. The
miniature SHALL take no keyboard focus and no pointer interaction. On an
empty form's card, a sentence SHALL stand in the miniature's place, saying
the form has no fields yet. That sentence SHALL stay in the accessibility
tree.

#### Scenario: The miniature follows the view order

- **WHEN** a step's view holds a long-text notes field before a one-line
  amount field
- **THEN** the miniature's first mark stands taller than its second

#### Scenario: The miniature marks a required entry

- **WHEN** a view entry declares `required: true`
- **THEN** that entry's mark fills solid in the required color
- **AND** a one-line field entry without `required: true` draws an outline

#### Scenario: A group entry draws a group break

- **WHEN** a step's view holds a group entry and two field entries inside it
- **THEN** the miniature carries one group break and two marks

#### Scenario: A note draws no mark

- **WHEN** a step's view holds one field entry and one note
- **THEN** the miniature carries exactly one mark

#### Scenario: A long form continues on a further line

- **WHEN** a step's view holds more marks than one line of its card fits
- **THEN** the miniature continues on a second line
- **AND** every mark stays whole and visible

#### Scenario: A screen reader hears the counts once

- **WHEN** a screen reader walks a card whose view holds four field entries,
  one of them required
- **THEN** it reads four fields, one required, from the card's foot
- **AND** the miniature adds nothing to what it reads

#### Scenario: The miniature takes no focus

- **WHEN** an author walks the Forms tab with the Tab key
- **THEN** the focus never lands inside a miniature

#### Scenario: An empty form says it has no fields yet

- **WHEN** a step's view has no field entry
- **THEN** the miniature's place on its card says the form has no fields yet
- **AND** a screen reader reads that sentence

### Requirement: A card opens the form editor for its step

A card SHALL carry one control that opens the form editor for that step. The
control SHALL name whether it starts a form or opens an existing one. Its
accessible name SHALL lead with those visible words. It SHALL then state the
step's label, as the card's head prints it. Controls on two cards with
different step labels SHALL carry different names. Pressing the control
SHALL open the form editor at `edit/form/:stepId`.

On an empty form's card the control SHALL stand alone in the foot, at the
row's trailing edge.

Leaving the form editor SHALL return to the Forms tab where the author started.

#### Scenario: An empty form offers to start one

- **WHEN** a step's view has no field entry
- **THEN** its card's control names starting the form

#### Scenario: Each control names its step

- **WHEN** a draft holds two steps with a form, labelled Intake and Review
- **THEN** the control on Intake's card carries an accessible name that
  leads with its visible words and names Intake
- **AND** the two controls' accessible names differ

#### Scenario: The empty card's control keeps its edge

- **WHEN** a step's view has no field entry
- **THEN** its card's foot holds the control alone, at the row's trailing
  edge

#### Scenario: Leaving the form editor returns to Forms

- **WHEN** an author opens the form editor from a card and then leaves it
- **THEN** the Forms tab is the open one

### Requirement: A card reports its step's form issues

A card SHALL carry the number of open issues that name its step's view. A card
whose step's view draws no issue SHALL carry no badge.

Pressing the badge SHALL open the Checks tab, narrowed to that step.

#### Scenario: A form issue reaches its card

- **WHEN** one view entry names a field the catalog no longer declares
- **THEN** that step's card carries a badge reading one

#### Scenario: The badge narrows the Checks tab to its own step

- **WHEN** an author presses a card's issue badge
- **THEN** the Checks tab opens
- **AND** it lists the open issues on that step alone

#### Scenario: A narrowed Checks tab reaches every check again

- **WHEN** an author reads a Checks tab narrowed to one step
- **THEN** the tab carries a control that shows every check again
