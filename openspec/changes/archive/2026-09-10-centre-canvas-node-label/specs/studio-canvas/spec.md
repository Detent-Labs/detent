## ADDED Requirements

### Requirement: A step node prints the step's label, centred and resolved for the content locale

A step node SHALL print the step's `label`, resolved against the studio's
content locale with fallback to the draft's `baseLocale`. It SHALL fall back
to the step's `key` only when that resolution yields nothing. It SHALL fall
back to the unnamed-step string only when the step has no key either.

That resolved text is the only text the node body draws. The node SHALL NOT
draw the step's key on a line of its own. The terminal and initial stamps are
not node body text, and this requirement does not touch them.

The text SHALL wrap inside the node's own width, over at most two lines. It
SHALL stay within the node's four edges at every length. It SHALL also stay
clear of the connect handle on the right edge.

A word wider than that width SHALL break rather than run past it. German
compounds into one long token. A rule that breaks only at spaces therefore
leaves the ordinary German label one line wide and uncut.

Text too long for two lines SHALL end in an ellipsis. The node SHALL carry the
untruncated text as its hover title, and only where the text is cut. A title on
every node, cut or not, stops saying that more text is hiding.

The node's own size SHALL NOT change with the label's length. The label block
SHALL sit centred between the node's top and bottom edges. That holds at one
line and at two, so every node reads from its own middle.

The key stays legible elsewhere. The step's accessible name names it, and the
inspector and the JSON view both carry it.

Changing the content locale SHALL change what every node prints, for a step
carrying a translation in the chosen locale.

<!-- antislop: allow trailing-negation -->
<!-- The scenario tests the label against the key, so the contrast is its name. -->
#### Scenario: A node prints the label, not the key

- **WHEN** the canvas renders a step keyed `capture` and labelled
  `{ en: "Capture the request" }`, with the content locale `en`
- **THEN** the node body reads "Capture the request"
- **AND** the node draws no key line, so `capture` is nowhere in the node body

#### Scenario: A label wider than the node wraps to a second line

- **WHEN** the canvas renders a step labelled "Confirm Completion to Opteon"
- **THEN** the node body reads the whole label, over two lines
- **AND** no part of it crosses the node's own border
- **AND** neither line runs under the connect handle

#### Scenario: A label too long for two lines truncates and keeps its full text

- **WHEN** a step's label needs more than two lines at the node's width
- **THEN** the node body ends in an ellipsis
- **AND** the node's hover title carries the label untruncated

#### Scenario: A German compound breaks instead of running past the node

- **WHEN** a step carries the label `Arbeitsunfähigkeitsbescheinigungsprüfung`,
  one word wider than the node
- **THEN** the word breaks and the label takes two lines
- **AND** no part of it is cut mid-glyph without an ellipsis

#### Scenario: A label that fits has no hover title

- **WHEN** a step labelled "Done" renders beside one the clamp cut
- **THEN** the cut node carries its full label as a hover title
- **AND** the node reading "Done" carries none

#### Scenario: One line and two lines share a centre

- **WHEN** one node's label takes one line and its neighbour's takes two
- **THEN** each label block sits centred between its own node's top and
  bottom edges
- **AND** the two blocks read from one shared centre line

#### Scenario: A long label leaves the node's size alone

- **WHEN** one step carries the label "Go" and the next needs both lines
- **THEN** the two nodes measure the same width and the same height

#### Scenario: The content locale switch reaches the canvas

- **WHEN** a step's `label` is `{ en: "Review", de: "Prüfen" }` and the author
  switches the content locale to `de`
- **THEN** the node prints "Prüfen"

#### Scenario: A step with no resolvable label falls back to its key

- **WHEN** a step carries key `capture` and a `label` with no entry for the
  content locale and none for the base locale
- **THEN** the node prints `capture`

## REMOVED Requirements

### Requirement: A step node prints the step's label, resolved for the content locale

**Reason**: The vertical-alignment rule inverts, so the scenario that named
the old rule needs a new name. A MODIFIED delta cannot rename a scenario. The
validator reads the old name as a silent drop and rejects the change. This
delta therefore drops the whole block and adds it back, under a name that
states the centring.

**Migration**: None. The replacement requirement above carries every scenario
this one had, one of them renamed.
