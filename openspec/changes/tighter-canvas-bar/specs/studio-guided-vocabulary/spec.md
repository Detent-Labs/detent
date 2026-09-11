## MODIFIED Requirements

### Requirement: A step's kind reads as a plain phrase

A step SHALL name its kind in plain words. A task step reads as a step someone
works. A subprocess step reads as a call to another process. A terminal step
reads as an end.

The word `terminal` SHALL NOT reach an authoring surface. The performed-by
control SHALL take the same three phrases.

#### Scenario: A terminal step reads as an end

- **WHEN** a step declares `terminal: true`
- **THEN** every surface naming its kind prints "End"
- **AND** no surface prints "terminal"

#### Scenario: The add control names what it adds

- **WHEN** an author opens the canvas bar's menu
- **THEN** its two entries name a call to another process, and an end
- **AND** the bar's own button, beside it, adds a step someone works
