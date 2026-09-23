## ADDED Requirements

### Requirement: The authoring-time check bounds an expression's structure

Every expression site that the authoring-time type check covers SHALL also
reject an expression that exceeds a fixed structural bound. Three limits apply.
An expression holds at most 2,000 AST nodes and a parse depth of at most 64. It
nests at most two comprehension macros (`all`, `exists`, `exists_one`, `map`,
`filter`) inside one another. The check SHALL report a violation as a CEL issue
located at its site, as it reports a type-check issue. Publish then rejects the
body, and the studio's live validation shows the issue.

The limits are constants. No setting changes them, and the engine applies no
runtime timer to evaluation.

#### Scenario: Publish rejects three nested comprehensions
- **WHEN** a guard reads `data.items.all(a, data.items.all(b, data.items.all(c, a == b && b == c)))`
- **THEN** publishing fails with a CEL issue at that guard naming the comprehension nesting limit

#### Scenario: The bound accepts two nested comprehensions
- **WHEN** a guard reads `data.items.all(a, data.items.exists(b, a == b))` and type-checks
- **THEN** the structural bound raises no issue for that guard

#### Scenario: Publish rejects an expression past the parse depth limit
- **WHEN** a guard nests 65 levels of parentheses around a comparison
- **THEN** publishing fails with a CEL issue at that guard naming the depth limit
