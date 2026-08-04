<!-- antislop: allow-file passive-voice -->

## ADDED Requirements

### Requirement: An authoring surface reaches the AST through the engine's CEL module

An authoring surface may need the parsed shape of an expression, not only a pass
or fail verdict. It SHALL get that shape from the engine package's own CEL
module, over the exports map. No workspace package SHALL declare its own
dependency on the CEL library. Exactly one version pin then exists, and an
upgrade stays the deliberate, reviewed commit the parse-and-evaluate rule
requires.

The module SHALL expose a parse entry point returning the abstract syntax tree.
It SHALL return nothing when the source does not parse. Each node SHALL carry
the source range it covers, so a caller can recover the exact text of any
fragment.

#### Scenario: The studio parses through the engine module

- **WHEN** a studio authoring surface needs the syntax tree of a CEL expression
- **THEN** it gets that tree from the engine package's CEL module, and
  `packages/web` declares no dependency on the CEL library

#### Scenario: Unparseable source yields nothing, not a throw

- **WHEN** an authoring surface parses a source that is not valid CEL
- **THEN** the parse entry point reports the absence of a tree
- **AND** the caller falls back to the plain text surface

#### Scenario: A fragment recovers its own source text

- **WHEN** an authoring surface holds a node of the parsed tree
- **THEN** the node's range identifies the exact substring of the original
  source that produced it
