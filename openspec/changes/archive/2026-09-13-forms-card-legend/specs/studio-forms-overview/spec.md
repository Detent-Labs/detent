## ADDED Requirements

### Requirement: The Forms tab explains the miniature's marks

The Forms tab SHALL carry one legend above its grid of cards. The legend SHALL
name five marks. Each name SHALL stand beside a sample drawn the way the
miniature draws that mark:

- an outline, named field
- a solid fill, named required
- a dashed outline, named required if a condition holds
- a group break, named section
- three outlines of rising height, named taller asks for more

The samples SHALL stay out of the accessibility tree. The legend's words SHALL
stay in it, as a list whose name says what the list explains. The legend SHALL
have no control and SHALL take no keyboard focus.

The legend SHALL keep its place while the grid scrolls. Where one line cannot
hold it, the legend SHALL continue on a further line and clip nothing. A Forms
tab with no card SHALL have no legend.

#### Scenario: The legend names every mark

- **WHEN** an author opens the Forms tab of a draft holding one form
- **THEN** one legend stands above the first card
- **AND** it names field, required, required if a condition holds, section,
  and taller asks for more

#### Scenario: A screen reader reads the legend's words alone

- **WHEN** a screen reader walks the legend
- **THEN** it reads a named list of the five names
- **AND** no sample adds anything to what it reads

#### Scenario: The legend takes no focus

- **WHEN** an author walks the Forms tab with the Tab key
- **THEN** the focus never lands inside the legend

#### Scenario: The legend stays while the grid scrolls

- **WHEN** an author scrolls a grid of cards taller than the tab body
- **THEN** the legend stays in view above the grid

#### Scenario: A tab without a card has no legend

- **WHEN** no step in a draft declares a view
- **THEN** the Forms tab says so in words
- **AND** it has no legend

### Requirement: A card's step label is a heading

Each card SHALL print its step's label as a level-2 heading. The header bar's
process name stands at level 1. The Forms tab SHALL add no heading between
those two levels.

The heading SHALL keep the label's look: the body face and text size, weight
800, the ink color and no uppercase.

#### Scenario: Heading navigation moves between cards

- **WHEN** a screen reader user moves by heading through a Forms tab of
  twelve cards
- **THEN** each move lands on the next card's step label

#### Scenario: The card headings sit one level under the process name

- **WHEN** an author reads the Forms tab's heading outline
- **THEN** the process name stands at level 1
- **AND** every card's step label stands at level 2

#### Scenario: The heading keeps the label's look

- **WHEN** an author reads a card
- **THEN** its step label prints at the body text size, in weight 800
- **AND** it prints in the body face, without uppercase

## MODIFIED Requirements

### Requirement: A card draws a miniature of its form for the eye alone

A card SHALL carry a miniature of the step's form. The miniature SHALL follow
the view's own order. Each field entry other than a group entry SHALL
contribute one mark, drawn without a label. A group entry SHALL contribute a
group break in place of a mark. A note entry SHALL contribute neither.

A mark SHALL take its height from the field's kind, so a long-text field reads
taller than a one-line field. Marks that outgrow the card's width SHALL
continue on a further line, each one kept whole.

An ordinary mark SHALL draw as an outline. An entry declaring literal
`required: true` SHALL fill its mark solid, in a color apart from the
outline's. An entry whose `required` holds a CEL expression SHALL draw a
dashed outline in that required color, with no fill. An entry declaring
`required: false`, or no `required` at all, SHALL draw the ordinary outline.

The foot's required count SHALL leave a CEL-conditional entry out. With forced
colors active, the outline, the solid fill, the dashed outline and the group
break SHALL each stay visible.

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
- **AND** a one-line field entry declaring no `required` draws an outline

#### Scenario: The miniature marks a conditionally required entry

- **WHEN** a view entry's `required` holds a CEL expression
- **THEN** that entry's mark draws a dashed outline in the required color
- **AND** the mark has no fill
- **AND** the foot's required count leaves that entry out

#### Scenario: A literal false draws the ordinary outline

- **WHEN** a view entry declares `required: false`
- **THEN** its mark draws the same outline as an entry declaring no
  `required`

#### Scenario: Every mark survives forced colors

- **WHEN** an author reads a card with forced colors active
- **THEN** the outline, the solid fill, the dashed outline and the group
  break each stay visible
- **AND** each still reads apart from the others

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

The control SHALL stand at least 24px tall, the minimum target size of WCAG
2.5.8.

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

#### Scenario: The open control meets the minimum target size

- **WHEN** an author measures any card's open control
- **THEN** it stands at least 24px tall

#### Scenario: The empty card's control keeps its edge

- **WHEN** a step's view has no field entry
- **THEN** its card's foot holds the control alone, at the row's trailing
  edge

#### Scenario: Leaving the form editor returns to Forms

- **WHEN** an author opens the form editor from a card and then leaves it
- **THEN** the Forms tab is the open one

### Requirement: A card reports its step's form issues

A card SHALL carry the number of open issues that name its step's view. A card
whose step's view draws no issue SHALL have no badge.

The badge's accessible name SHALL lead with its visible count. The same
sentence SHALL then name the step's label, as the card's heading prints it.
One open issue and several open issues SHALL each read as one whole
sentence. Badges on two cards with different step labels SHALL carry
different names.

Pressing the badge SHALL open the Checks tab, narrowed to that step.

#### Scenario: A form issue reaches its card

- **WHEN** one view entry names a field the catalog no longer declares
- **THEN** that step's card carries a badge reading one

#### Scenario: The badge names its step

- **WHEN** a draft holds two steps with a form, labelled Intake and Review,
  and each view has one open issue
- **THEN** the badge on Intake's card carries the accessible name "1 open
  issue on Intake"
- **AND** the two badges' accessible names differ

#### Scenario: The badge names several issues in one sentence

- **WHEN** Intake's view has two open issues
- **THEN** its badge carries the accessible name "2 open issues on Intake"

#### Scenario: The badge narrows the Checks tab to its own step

- **WHEN** an author presses a card's issue badge
- **THEN** the Checks tab opens
- **AND** it lists the open issues on that step alone

#### Scenario: A narrowed Checks tab reaches every check again

- **WHEN** an author reads a Checks tab narrowed to one step
- **THEN** the tab carries a control that shows every check again
