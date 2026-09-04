## ADDED Requirements

### Requirement: Every author-facing string on a studio screen comes from the studio catalog

A studio screen SHALL render no author-facing string from a literal in its
own component. Every such string SHALL carry a key in the studio catalog. It
SHALL reach the screen through the studio area's catalog lookup.

The reason is the override rule above. An override row names an area, a
locale and a key. A string with no key has no row to name it, so no operator
can override it. A literal in a component therefore removes that string from
the override mechanism without saying so.

This holds for a rebuilt screen exactly as it holds for a new one. A string
carried over from a screen's earlier version SHALL keep its key or take a new
one. It SHALL NOT become a literal on the way.

Two kinds of text are outside this rule. Authored content belongs to the
draft and follows `authored-content-localization`. That kind covers a field
label, a process name and a step name. The second kind is an engine value
the screen prints exactly as the engine states it. A `key` and a `type` are
such values, and neither carries a catalog key of its own.

#### Scenario: A new studio string is overridable

- **WHEN** an operator sets an override for area `studio`, a locale, and the
  key a newly added studio string declares
- **THEN** the studio screen showing that string renders the override's value

#### Scenario: A rebuilt screen renders no bare literal

- **WHEN** a developer reads a rebuilt studio screen's component
- **THEN** every author-facing string it renders reads through the studio
  catalog lookup, and none is a literal in the component

#### Scenario: An authored value keeps its own path

- **WHEN** a studio screen renders a draft's own field label
- **THEN** that text comes from the draft, not from the studio catalog, and
  the override mechanism does not cover it
