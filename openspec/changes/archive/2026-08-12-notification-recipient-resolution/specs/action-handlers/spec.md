<!-- antislop: allow-file passive-voice -->
<!-- passive-voice: SHALL-form normative spec prose, the convention the base
     spec at openspec/specs/action-handlers/spec.md already follows. -->

## MODIFIED Requirements

### Requirement: A handler is resolved by action type and invoked off the lock

A delivery SHALL resolve a handler from the registry by the outbox row's
`action.type`. It SHALL invoke that handler with the action's `config` and get
a structured `result`. An action whose `type` is not registered SHALL be
treated as a permanent failure (dead-letter), never a transient retry.
Delivery is at-least-once. A handler MAY therefore run more than once for the
same row. It MUST dedupe on the row's idempotency key.

The invocation SHALL also carry the actor ids the enqueuing commit froze onto
the row, when the row carries any. A handler MAY read them and MAY ignore
them. They are engine-supplied state, not authored config. A handler that
reads them still performs no instance lookup of its own.

The field SHALL be optional. A row enqueued before the engine recorded actor
ids carries none. A handler SHALL treat that case like a row whose recorded
lists are all empty.

#### Scenario: A registered handler is invoked with the action config
- **WHEN** a delivered row's `action.type` is registered
- **THEN** the handler is invoked with the action's `config` and returns a structured `result`

#### Scenario: An unregistered type is a permanent failure
- **WHEN** a delivered row's `action.type` is not in the registry
- **THEN** the delivery fails permanently and the row dead-letters without consuming transient retries

#### Scenario: A handler reads the frozen actor ids
- **WHEN** a delivered row carries frozen actor ids
- **THEN** the handler is invoked with those ids alongside the action's `config`

#### Scenario: A handler ignoring the actor ids is unaffected
- **WHEN** a delivered row carries frozen actor ids and its handler reads none of them
- **THEN** the delivery behaves exactly as it did before the ids existed
