# Spec Delta

## MODIFIED Requirements

### Requirement: The Forms tab explains the miniature's marks

The Forms tab SHALL carry one legend above its grid of cards. The legend SHALL
name five marks. Each name SHALL stand beside a sample drawn the way the
miniature draws that mark:

- an outline, named field
- a solid fill, named required
- a dashed outline, named required if a condition holds
- a group break, named group
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
- **AND** it names field, required, required if a condition holds, group,
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

#### Scenario: The group mark reads Group

- **WHEN** an author reads the legend
- **THEN** the group break's name reads "Group"
- **AND** no legend word reads "Section"
