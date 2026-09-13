## MODIFIED Requirements

### Requirement: A card names its step and counts the fields it draws

A card SHALL carry a kicker naming the step's kind. Under the kicker it SHALL
carry the step's label. The card's foot SHALL carry the number of field
entries the view holds that the miniature draws as a mark. A group entry and
a note entry add nothing to that number. Where at least one of those entries
declares `required: true`, the same sentence SHALL state how many do. That
text SHALL share one row with the control that opens the form editor.

A view holding no entry that draws a mark SHALL read as an empty form. A view
holding only notes, only group entries, or both reads as empty too. That
card's border SHALL take the advisory role, the tone a warning callout's rule
takes. The border SHALL clear WCAG 1.4.11's 3:1 non-text minimum against the
card's ground, in both color schemes. Its foot SHALL leave the count out.

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
- **AND** the card's border takes the advisory role
- **AND** its foot leaves the count out

#### Scenario: The empty card's border clears the non-text minimum

- **WHEN** an author reads an empty form's card in either color scheme
- **THEN** its border measures at least 3:1 against the card's ground

#### Scenario: A form of notes alone reads as empty

- **WHEN** a step's view holds one note and no field entry
- **THEN** its card names the form as empty

#### Scenario: A form of group entries alone reads as empty

- **WHEN** a step's view holds one group entry and no other field entry
- **THEN** its card names the form as empty
