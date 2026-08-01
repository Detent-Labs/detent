# Process authoring guide

This guide is for the person who builds a process. It explains the vocabulary
SummitBPS uses, and the order in which to assemble a process from it.

Every example comes from `examples/expense-approval.json`, a process that
lives in this repository and that the test suite covers.

## Orientation

SummitBPS runs business processes that involve forms and approvals. A process
is a finite state machine. Steps are the states, and Paths are the transitions
between them. This is not a BPMN token flow, and there is no token.

Exactly one Step is active per running process. That single rule explains most
of what follows.

The browser application has four areas. You build processes in one of them and
watch the result in the other three.

| Area | Role you need | Who works here | What happens here |
|---|---|---|---|
| Tasks | none, a login is enough | participant | complete tasks, start a process |
| Studio | `system:developer` | **author** | build, test and publish processes |
| Operations | `system:admin` | operator | instances, outbox, timers, users, migrations |
| Reports | `system:reports` | process owner | cycle time, bottlenecks, SLA |

After you log in, SummitBPS sends you to the first role-gated area you may
enter. An actor with no reserved role lands in Tasks.

The three areas outside Studio matter to you, because your published process
shows up in all of them. A Step that needs a person becomes a task in Tasks. A
running process becomes a row in Operations. An operator reads its history
there, along with its pending timers and its queued actions. Its duration
becomes a number in Reports.

## Vocabulary

Twelve terms, in an order that lets you read them top to bottom. No term needs
a term below it.

### Process

One process definition. It has a `key` for people, a `label` for screens, and
a `baseLocale` that every piece of display text must carry.

The example has key `expense_approval`, label `Expense Approval`, and
`baseLocale` `en`.

### Version

You publish a process, and that publication is a version. A published version
never changes again. Its hash covers the process body, so republishing an
identical body does nothing at all.

A running process pins the process id, the version and the hash it started on.
It reads that exact frozen body for its whole life.

### Field catalog

Every field of the process, declared once. A field has a key, a type and a
label. The stored payload is one flat object, and a field id is its key.

The example declares four fields. `amount` is a number, `reason` is a string,
`review_note` is a string, and `booking_status` is a select.

A field key must match `/^[a-z_][a-z0-9_]*$/`, because a guard reads it as
`data.<key>`.

### Data source

Where a select field gets its options. A field carries its options inline, or
it names a data source, never both. The engine resolves a data source when a
participant opens the form.

The example uses no data source. Its `dataSources` array is empty, and
`booking_status` carries its options inline.

### Step

One state. Exactly one step is active per running process.

A step is terminal or it is not. A terminal step has no outgoing path, and it
ends the process. Every other step needs at least one exit.

The example has seven steps. `capture` is the initial step. `booked` and
`rejected` are terminal.

### View

What a step shows. The view names catalog fields and overrides how this step
presents each one: visible, required, readonly, its order, its group.

Requiredness lives in the view, never in the catalog. One step can demand a
field that the next step only displays.

### Path

One transition from one step to another. A path is `manual` or `automatic`. A
single step must not mix the two.

A manual path waits for a person. The example gives `review` three of them:
`approve`, `reject` and `escalate`.

An automatic path fires by itself when its guard matches. A guard is a CEL
expression. Two or more automatic paths on one step need a `priority` each,
and the engine tries the lowest number first.

The example gives `book` two automatic paths. `booked` has priority 1 and the
guard `data.booking_status == 'booked'`. `booking-failed` has priority 2 and
the guard `data.booking_status == 'failed'`.

A guard never throws. A guard that fails, because a field holds no value yet,
is not a match. If no automatic path matches, the process waits on the step.
That is the wait-state idiom, and it is how you model a step that waits for an
answer from outside.

An automatic path without a guard is the default. It must carry the highest
priority number, so the engine tries it last.

### Action

Something the engine does, written as a handler reference: a type and a
config. An action is never inline code.

The engine commits the state first and dispatches the action after, through an
outbox. Delivery happens at least once, so a handler must tolerate a repeat.
Actions run in a fixed order. First `onExit` of the step you leave, then
`onPath` of the path you take, then `onEntry` of the step you enter.

The example posts to accounting with `accounting.postInvoice` on entry to
`book`. On entry to `escalated_review` it runs `http.request` and
`notification.email`.

An action can write its result back into the payload. The engine verifies the
value against the target field's declared type first. A value of the wrong
type never lands.

### Timer

A clock on a step. It carries a `duration` or a `deadline`, never both. The
engine computes the fire time when the process enters the step, and stores it.

A timer that names a target path forces that transition when it fires. It
ignores the guard on that path. A timer without a target path is a reminder.
It runs its actions and the process stays where it is.

The example puts two reminders on `review`, at `P7D` and `P14D`, and one on
`book` at `P1D`.

A duration uses weeks, days, hours, minutes and seconds. Months and years are
not allowed, because their length depends on the calendar.

### Assignment

Who may act on a step. A step that needs a person carries an assignment with a
list of candidates. One of them claims the step, and the claim is visible to
everybody else.

The example assigns `capture` to `employee`. It assigns `review` and
`booking_error` to `finance-approver`, and `escalated_review` to
`finance-manager`. The steps `book`, `booked` and `rejected` carry no
assignment, because no person acts on them.

### Instance

One run of one process. It holds the payload, the active step, the claim, the
pending timers and the full history.

The history is append-only. Every entry records the version that was active,
so a step id still resolves after a migration.

### Contract

What a process promises, when another process calls it. A contract names input
fields, output fields and a list of outcomes. Every terminal step of the
process binds to one of those outcomes.

The example declares the outcomes `booked` and `rejected`. Its two terminal
steps carry exactly those.

A caller uses a subprocess step, which is a wait-state. The caller guards on
`child.outcome`, never on a step id inside the child. That is the whole point
of the contract. The child can change its steps freely, and the caller does
not care.

For a worked pair, read `examples/subprocess-loan-parent.json` and
`examples/subprocess-credit-check-child.json`.

## Building a process

## After publish

## What this guide is not

This guide teaches one thing: how to think about a process, and how to build
one. Three other documents cover the rest.

- `docs/current-state.md` describes each subsystem of the engine.
- `docs/openapi.yaml` documents the HTTP API.
- `src/schema/definition.ts` is the contract itself, as Zod schemas.
