<!-- antislop: allow-file negation-habit -->
<!-- A MODIFIED block copies its live requirement whole, as OpenSpec requires,
     so the live spec text carries these findings. Passive WHEN/THEN phrasing
     matches the convention of every existing spec.md in openspec/specs/. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: A process.start action starts an independent instance on delivery

When the outbox delivers a `process.start` action, the engine SHALL create
one instance of the target process. The action's `processId` names that
process, and its `inputMapping` seeds the new instance's data. The started
instance MUST NOT record a `parent` link to the acting instance. It runs
independently. The acting instance never parks to wait for it. Nothing
drives it through the subprocess return path.

`process.start` is an ordinary, author-visible action type. It MUST NOT
carry the `core.` prefix reserved for the engine-internal subprocess
spawn, return and child-cancel handlers. An author MAY place it at any action position an
authored body allows. That includes `onEntry`, `onExit`, `onCancel`, a
path's `onPath`, and a timer's `onFire`. The publish-time action registry
check covers it like any other action.

#### Scenario: A terminal step's onEntry action starts another process
- **WHEN** an instance reaches a terminal step whose `onEntry` carries a `process.start` action, and the outbox delivers that action
- **THEN** the engine creates one instance of the named process, and the acting instance carries no `parent` link to it

#### Scenario: The started instance has no return path
- **WHEN** a chained instance reaches its own terminal step
- **THEN** the engine enqueues no return action, and the instance that started the chain keeps running unchanged
