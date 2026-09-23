## ADDED Requirements

### Requirement: Spawn refuses a child past the maximum nesting depth

Before it creates a child, the spawn SHALL count the parent's nesting depth. It
follows `parent` links upward from the parent instance. A top-level instance
has depth 0. When the parent's depth is 16 or more, the spawn SHALL fail in a
controlled way. Its diagnostic SHALL name the subprocess step and the depth
limit, and the spawn SHALL create no child instance.

The failure is a runtime backstop for a subprocess cycle that the publish-time
check did not prevent. A redelivery that finds the child already created SHALL
NOT apply this check.

#### Scenario: Spawn refuses a child at the depth limit
- **WHEN** a parent instance at nesting depth 16 enters a subprocess step
- **THEN** the spawn fails with a diagnostic naming the step and the depth limit, and creates no child instance

#### Scenario: A spawn below the depth limit proceeds
- **WHEN** a parent instance at nesting depth 15 enters a subprocess step whose child resolves
- **THEN** the spawn creates the child at depth 16, linked to the parent as usual
