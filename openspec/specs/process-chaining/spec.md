# process-chaining

## Purpose

Defines how the engine executes a `process.start` action. The action starts
an independent instance of another process from the acting instance's
data. The start stays idempotent under at-least-once dispatch. The started
instance records a reporting-only link back to the instance that started
it.

Unlike a `subprocess` step, a chain is fire-and-forget. The acting
instance does not wait. The started instance carries no return path back
to it.

## Requirements

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

### Requirement: The started instance's id is deterministic under at-least-once dispatch

Because outbox dispatch is at-least-once, re-dispatching the same
`process.start` delivery MUST NOT create a second instance. The engine
MUST derive the started instance's id from the delivery's own idempotency
key. That is the same key the outbox already attaches to the row. A
redelivered start SHALL resolve to the already-created instance and
create nothing new.

#### Scenario: A redelivered start does not create a second instance
- **WHEN** the outbox dispatches the same `process.start` delivery more than once
- **THEN** exactly one started instance exists, identified by the deterministic id the delivery's idempotency key derives

### Requirement: inputMapping seeds the started instance, total per entry

At delivery time the engine SHALL evaluate the action's `inputMapping`
(CEL expressions over the acting instance's frozen context). The engine
SHALL write each result into the started instance's initial `data`,
keyed by the target's field ids. Evaluation SHALL be total per entry,
matching the subprocess `inputMapping` rule. When an entry's expression
raises, or its value cannot become JSON-safe, the engine SHALL omit that
entry. The engine SHALL still write every other entry.

The engine SHALL record the omission as a `mapping.entry-dropped` event,
direction `"input"`, on the ACTING instance. That instance's own context
is what the mapping evaluated.

`inputMapping` targets resolve against the target process's full field
catalog, not a declared `ProcessContract` input surface. A `process.start`
target declares no contract.

#### Scenario: Input mapping seeds the started instance's data
- **WHEN** a `process.start` action declares `inputMapping` from the acting instance's fields to the target process's fields
- **THEN** the started instance begins with each mapped field set to its evaluated CEL value over the acting instance's data

#### Scenario: One raising entry does not fail the start
- **WHEN** one `inputMapping` entry raises because it reads a field the acting instance never wrote, and the others evaluate cleanly
- **THEN** the instance starts with the raising entry's target unset and the other entries applied. The engine records a `mapping.entry-dropped` event on the acting instance.

### Requirement: The started instance records a reporting-only backlink

The engine SHALL record `chainedFrom` on the started instance, holding the
acting instance's id, distinct from `parent`. Nothing that treats
`parent` as a call-and-return link may read `chainedFrom`: not cancel
cascade, not the subprocess return path, nothing else. Its only purpose
is letting a reader trace a chain back to the instance that started it.

#### Scenario: A chained instance carries its starter's id
- **WHEN** a `process.start` action starts an instance
- **THEN** the started instance's `chainedFrom` equals the acting instance's id

#### Scenario: Cancelling the acting instance does not cascade
- **WHEN** an operator cancels the instance that started a chain
- **THEN** the chained instance keeps running unchanged, unlike a subprocess child under its cancelled parent

### Requirement: The target resolves to the newest published version at start time

The engine SHALL resolve the `process.start` action's `processId` to the
newest published version of that process at delivery time. This
capability defines no pinned-version option and no contract-signature
binding. Unlike a subprocess reference, a chain target need not declare a
`ProcessContract`.

#### Scenario: The started instance runs the newest published version
- **WHEN** a `process.start` action names a `processId` with more than one published version
- **THEN** the started instance runs the newest one

### Requirement: The engine drives the started instance to rest after creation

After creating the started instance, the engine SHALL drive it along its
all-automatic paths. This matches how the engine already drives instance
creation and subprocess spawn. The target process's initial step, or a
step it reaches automatically, may lead straight to a terminal step. When
that happens, the started instance SHALL complete without waiting for an
external trigger.

A redelivered start MUST NOT skip this step. The engine SHALL try it on
every delivery, not only the one that created the instance. This way a
crash between creation and drive-to-rest does not strand the started
instance.

#### Scenario: A started instance completes immediately when its path is all-automatic
- **WHEN** every step from the target process's initial step, along automatic paths, leads straight to a terminal step
- **THEN** the started instance reaches that terminal step with no external trigger

#### Scenario: A redelivery completes a drive-to-rest a crash interrupted
- **WHEN** the first delivery creates the instance, crashes before drive-to-rest, and the outbox redelivers the row
- **THEN** the redelivery loads the already-created instance and drives it to rest

### Requirement: A failed start dead-letters through the ordinary outbox path

<!-- antislop: allow synonym-rotation - the two words name different subjects -->

When a `process.start` delivery fails, the outbox SHALL follow its
existing transient-retry-then-dead-letter path. This capability adds no
new failure surface. The acting instance is already `completed` by the
time this action runs. This is because `planStepEntry` enqueues a
terminal step's `onEntry` actions in the same commit that sets its
status. So a failed start has no acting-instance state to report into.

#### Scenario: A start that keeps failing dead-letters
- **WHEN** a `process.start` delivery raises on every try up to the outbox's retry budget
- **THEN** the row dead-letters and the acting instance's own state stays unchanged

### Requirement: A process.start mapping value is a checked CEL site

Publish SHALL parse and type-check every CEL value of a `process.start`
action's `config.inputMapping` against the acting process's field catalog. The
scope is `data`, `instance` and `actor`, with neither `result` nor `child`. The
time-function ban, the structure bounds and the length bound apply as at any
other site. The CEL checks run on the publish path. The length bound runs in the
compile pass.

#### Scenario: Publish rejects an unknown field reference in a mapping value

- **WHEN** a `process.start` mapping value reads `data.missing`, and the acting process declares no field with that key
- **THEN** publish fails with a CEL issue located at that mapping entry, naming the unknown reference

#### Scenario: Publish rejects a time function in a mapping value

- **WHEN** a `process.start` mapping value calls `timestamp()`
- **THEN** publish fails with a CEL issue located at that mapping entry, naming the time function

#### Scenario: Publish rejects three nested comprehensions in a mapping value

- **WHEN** a `process.start` mapping value reads `data.items.all(a, data.items.all(b, data.items.all(c, a == b && b == c)))`
- **THEN** publish fails with a CEL issue located at that mapping entry, naming the comprehension nesting limit

#### Scenario: Publish rejects a namespace the delivery does not supply

- **WHEN** a `process.start` mapping value reads `result` or `child.outcome`
- **THEN** publish fails with a CEL issue located at that mapping entry, naming the unknown reference

#### Scenario: Publish rejects an over-long mapping value

- **WHEN** a `process.start` mapping value has a source longer than the expression length bound
- **THEN** publish fails with a located issue naming the bound

#### Scenario: A well-typed mapping value passes

- **WHEN** a `process.start` mapping value reads `data.amount * 2.0`, and `amount` is a `number` field
- **THEN** authoring-time validation accepts it, whatever type the value infers to

#### Scenario: Publish reads no other plugin config for CEL

- **WHEN** an action of another type holds a CEL-shaped object in its `config`
- **THEN** publish reports no CEL issue for it

#### Scenario: The studio shows the issue before publish

- **WHEN** the studio validates a draft whose `process.start` mapping value reads `timestamp()`
- **THEN** the checks rail lists a CEL issue for that mapping entry

### Requirement: The started instance resolves assignment with the engine's strategies

Every step entry of the started instance SHALL resolve its assignment with the
strategies the engine runs with. That holds while the engine creates the
instance and while it drives the instance to rest. The set has `static` and each
org-aware strategy. A strategy that publish accepted MUST NOT resolve to an
empty list for want of a registration.

#### Scenario: A group-members start step resolves its members

- **WHEN** a `process.start` action starts a process whose start step declares
  `org.group-members` for a group with two members
- **THEN** the started instance's candidates are those two members, and no
  `assignment.unresolved` event is recorded

#### Scenario: An actor-from-field start step reads the mapped value

- **WHEN** a `process.start` action maps a person into the field that the
  target's start step names in `org.actor-from-field`
- **THEN** the started instance's candidates hold that person
