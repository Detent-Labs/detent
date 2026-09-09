## MODIFIED Requirements

### Requirement: A step node prints the step's label, resolved for the content locale

A step node SHALL print the step's `label`, resolved against the studio's
content locale with fallback to the draft's `baseLocale`. It SHALL fall back
to the step's `key` only when that resolution yields nothing. It SHALL fall
back to the unnamed-step string only when the step also carries no key.

That resolved line is the only text the node body draws. The node SHALL NOT
draw the step's key on a line of its own. The line SHALL sit centred between
the node's top and bottom edges. The terminal and initial stamps are not node
body text, and this requirement does not touch them.

The key stays legible elsewhere. The step's accessible name names it, and the
inspector and the JSON view both carry it.

Changing the content locale SHALL change what every node prints, for a step
carrying a translation in the chosen locale.

#### Scenario: A node prints the label, not the key

- **WHEN** the canvas renders a step keyed `capture` and labelled
  `{ en: "Capture the request" }`, with the content locale `en`
- **THEN** the node body reads "Capture the request", on one line
- **AND** the node draws no key line, so `capture` is nowhere in the node body

#### Scenario: The content locale switch reaches the canvas

- **WHEN** a step's `label` is `{ en: "Review", de: "Prüfen" }` and the author
  switches the content locale to `de`
- **THEN** the node prints "Prüfen"

#### Scenario: A step with no resolvable label falls back to its key

- **WHEN** a step carries key `capture` and a `label` with no entry for the
  content locale and none for the base locale
- **THEN** the node prints `capture` on its one line
