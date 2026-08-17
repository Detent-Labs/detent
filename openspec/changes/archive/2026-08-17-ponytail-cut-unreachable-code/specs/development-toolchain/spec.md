## MODIFIED Requirements

### Requirement: Every action type the shipped examples name resolves in the default registry

Every action `type` that a file under `examples/` names SHALL resolve in
`createDefaultRegistry()`. A contributor SHALL reach a terminal step in the
running dev server without registering a handler by hand.

`scripts/seed.ts` SHALL register no placeholder handler. Its registry
publishes and drives the same examples the server runs. A placeholder
there hides a type the server cannot dispatch.

#### Scenario: The seed script needs no placeholder handler

- **WHEN** `scripts/seed.ts` publishes every file under `examples/` against
  `createDefaultRegistry()` alone
- **THEN** publish-time registry validation passes for all of them

#### Scenario: An example gains an unregistered action type

- **WHEN** a change points an example at an action type
  `createDefaultRegistry()` does not register
- **THEN** the change registers a real handler for it, or picks a type that
  already resolves
