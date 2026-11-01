## ADDED Requirements

### Requirement: A path's guard reads as a sentence on its canvas way out

The canvas SHALL read a path's guard in the builder's clause words, on the
way out's line. That holds for an automatic path and for a manual path. The
words SHALL come from the same `Condition`/`Row` model the builder computes.
A condition with no readable row SHALL read "a hand-written rule holds". The
line SHALL NOT print CEL source. `studio-canvas` states the sentence around
the condition.

#### Scenario: A single-row guard reads in words

- **WHEN** an automatic path's guard reads `data.status == "approved"`, and
  the builder shows it as one row
- **THEN** the path's line carries the row's clause in words

#### Scenario: An unbuildable guard reads as a hand-written rule

- **WHEN** a path's guard reads `size(data.amount) > 3`
- **THEN** the path's line reads "Only if a hand-written rule holds"
- **AND** the guard's source text appears nowhere on the canvas

#### Scenario: A manual path's guard draws its sentence and no number

- **WHEN** a manual path's guard reads `data.amount > 1000.0`
- **THEN** the path's line reads "Only if Amount is greater than 1,000"
- **AND** no number draws on the line

## MODIFIED Requirements

### Requirement: The builder's rows print no CEL

The joiner control SHALL read "and" or "or", and flipping it SHALL keep its
behavior. A raw row SHALL print a sentence in place of its fragment's text.
That sentence SHALL point to the Developer view. The row SHALL keep the
fragment unchanged in the written expression, and its remove control SHALL
stay. In the condition's sentence, a raw row SHALL read "a hand-written
rule". The canvas way out's sentence and the form preview's note read a raw
row the same way, per `studio-canvas`.

#### Scenario: The joiner reads a word

- **WHEN** a guard holds two rows joined by `||`
- **THEN** the joiner control reads "or"
- **AND** pressing it makes the joiner read "and" and writes `&&`

#### Scenario: A raw row reads as a sentence

- **WHEN** a guard reads `data.tags.exists(t, t == "vip") && data.amount > 1000.0`
- **THEN** the raw row reads "A hand-written rule. The Developer view holds
  its text."
- **AND** the page shows `data.tags.exists(t, t == "vip")` only inside the
  Developer view
- **AND** the sentence reads "A hand-written rule and Amount is greater than
  1,000."

## REMOVED Requirements

### Requirement: A path's guard shows a plain-English summary on its canvas edge

**Reason**: Its scenario "An unbuildable guard shows raw CEL on the edge"
reverses: no CEL prints on the canvas now. A MODIFIED block cannot drop a
scenario.

**Migration**: The ADDED requirement "A path's guard reads as a sentence on
its canvas way out" states the rule. The capability `studio-canvas` states the
sentence around it.
