# Spec Delta

## REMOVED Requirements

### Requirement: Every author-facing string on a studio screen comes from the studio catalog

**Reason**: One paragraph and one scenario put a JSON property's name after
a caption's plain words, in the mono face. Stage 64's principle 2 reverses
that. A key appears only inside a Developer view. A MODIFIED block cannot
drop the scenario. The requirement therefore returns as four shorter
requirements, with that paragraph and that scenario replaced.

**Migration**: Read the four ADDED requirements below. Together they carry
every other paragraph and scenario of this requirement word for word.

## ADDED Requirements

### Requirement: Every author-facing string on a studio screen reads from the studio catalog

A studio screen SHALL render no author-facing string from a literal in its
own component. Every such string SHALL carry a key in the studio catalog. It
SHALL reach the screen through the studio area's catalog lookup. An override
row names an area, a locale and a key. A string with no key has no row to
name it, so no operator can override it.

A string carried over from a screen's earlier version SHALL keep its key or
take a new one. It SHALL NOT become a literal on the way.

#### Scenario: A new studio string is overridable

- **WHEN** an operator sets an override for area `studio`, a locale, and the
  key a newly added studio string declares
- **THEN** the studio screen showing that string renders the override's value

#### Scenario: A rebuilt screen renders no bare literal

- **WHEN** a developer reads a rebuilt studio screen's component
- **THEN** every author-facing string it renders reads through the studio
  catalog lookup, and none is a literal in the component

#### Scenario: A literal caption in a studio panel fails the suite

- **WHEN** a developer adds a text node or a literal caption to a studio
  panel component
- **AND** the text is not a named machine value
- **THEN** the full test suite fails and names the file and the text

### Requirement: A studio caption prints its catalog words alone

A field caption is author-facing text. It SHALL read as plain words from the
catalog, and nothing SHALL follow those words. The JSON property the control
writes is an engine value. It has no catalog key, and it SHALL NOT stand
beside the caption. It reaches an author inside a Developer view alone.

#### Scenario: A caption prints its catalog words alone

- **WHEN** an author opens an automatic way out on the step page
- **THEN** the priority input's caption reads the catalog's plain words
- **AND** no property name follows them

### Requirement: A validation message, a warning and a badge are whole catalog sentences

A validation message, a warning and a badge are author-facing text. Each
SHALL be one whole catalog sentence, with any number or name filled into a
placeholder.

#### Scenario: A plugin config message is a catalog sentence

- **WHEN** a plugin config field declares a minimum length of 3
- **AND** an author enters two characters
- **THEN** the message under the field is the catalog sentence for a minimum
  length, with 3 filled in

### Requirement: Authored content and engine values stay outside the studio catalog

Two kinds of text SHALL stay outside the catalog rule. Authored content
belongs to the draft and follows `authored-content-localization`. That kind covers a
field label, a process name and a step name. The second kind is an engine
value the screen prints exactly as the engine states it. A `key` and a
`type` are such values, and neither carries a catalog key of its own.

#### Scenario: An authored value keeps its own path

- **WHEN** a studio screen renders a draft's own field label
- **THEN** that text comes from the draft, not from the studio catalog, and
  the override mechanism does not cover it
