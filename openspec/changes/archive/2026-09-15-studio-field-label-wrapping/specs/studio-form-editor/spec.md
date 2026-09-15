## ADDED Requirements

### Requirement: A placed field's key breaks at its underscores before anywhere else

A placed field's card SHALL render the field's `key` so it wraps at a `_`
character first. On a wrap it SHALL break immediately after a `_` character
in preference to any other position. It SHALL break elsewhere only when a
single run does not fit the card's width. A run is the span between two `_`
characters. It can also be the span before the first `_`, or the span after
the last `_`.

The card's key is a mono, unspaced identifier. A break at an arbitrary
character reads as garbled text; a break after `_` still reads as two whole
segments.

#### Scenario: A narrow card breaks the key at its underscore

- **WHEN** a placed field's card is too narrow for its key to fit on one
  line
- **AND** the key contains at least one `_`
- **THEN** the key wraps immediately after a `_`
- **AND** no line of the wrapped key ends or begins in the middle of a
  contiguous run of letters
- **AND** that run itself fits the card

#### Scenario: An oversized run breaks only as a last resort

- **WHEN** a placed field's card is narrower than a single
  underscore-delimited run of the key
- **THEN** that run breaks so the key stays inside the card
- **AND** every other run in the same key still breaks at its own `_`
  boundary first
