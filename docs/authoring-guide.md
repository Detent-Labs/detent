# Process authoring guide

This guide is for the person who builds a process. It explains the vocabulary
Detent uses, and the order in which to assemble a process from it.

Every example comes from `examples/expense-approval.json`, a process that
lives in this repository and that the test suite covers.

## Orientation

Detent runs business processes that involve forms and approvals. A process
is a finite state machine. Steps are the states, and Paths are the transitions
between them. This is not a BPMN token flow, and there is no token.

Exactly one Step is active per running process. That single rule explains most
of what follows.

The browser application has four areas. You build processes in one of them and
watch the result in the other three.

| Area | Role you need | Who works here | What happens here |
|---|---|---|---|
| Tasks | none, a login is enough | participant | complete tasks, start a process |
| Studio | `system:author`, `system:developer` or `system:templates` | **author** | build, test and publish processes |
| Operations | `system:admin` or `system:datalists` | operator | instances, outbox, timers, users, migrations, data lists |
| Reports | `system:reports` | process owner | cycle time, bottlenecks, SLA |

Entry to an area is the weaker gate. Any one role in the cell opens the door.
Each screen inside keeps its own check. The Templates screen wants
`system:templates`, and the data list screens want `system:datalists`.

After you log in, Detent sends you to the first role-gated area you may
enter. An actor with no reserved role lands in Tasks.

The three areas outside Studio matter to you, because your published process
shows up in all of them. A Step that needs a person becomes a task in Tasks. A
running process becomes a row in Operations. An operator reads its history
there, along with its pending timers and its queued actions. Its duration
becomes a number in Reports.

## Vocabulary

Thirteen terms, in an order that lets you read them top to bottom. No term needs
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

### Default value

A field can declare `default`, a literal value or a CEL expression. Creating
an instance seeds an open slot from it. `booking_status`'s own `"pending"`
default is one such literal. An explicitly submitted value always wins over
a default on the same field.

A literal writes directly. An expression evaluates over the seed already in
progress. A later field's default can therefore read an earlier field's
resolved value, through `data.<key>`. That only works when the catalog
lists the earlier field first. A default cannot read a field listed later
in the catalog. That read raises for the missing key, the same total-CEL
rule a guard follows everywhere else.

A raising default leaves its own field unset. It does not fail the
creation.

This seeding runs once, only inside instance creation. It runs only for a
top-level instance created directly. A subprocess spawn seeds its own new
instance from the parent's own mapping instead. A `process.start` chain
seeds its own new instance from the caller's own mapping instead. Neither
one reads the started process's own catalog defaults.
`submitAndTransition` never applies a default at a later transition. It
never re-checks one already seeded at creation.

A `group` field's own default is never read. A group carries no slot of
its own in the flat data payload. Only its children's defaults seed.

### Validation

A field can declare `min`, `max`, `minLength`, `maxLength`, `pattern` or
`rule`. The engine checks these when a participant submits a value, never in
the browser. A negative `amount` waits until the participant sends the form.

`rule` is a CEL expression. It sees the same data every guard sees, so it can
compare a field against another: `data.amount <= data.approved_amount`.

A step can override any of these per field. See View, below.

### Data source

Where a select field gets its options. A field carries its options inline, or
it names a data source, never both. The engine resolves a data source when a
participant opens the form.

The example uses no data source. Its `dataSources` array is empty, and
`booking_status` carries its options inline.

Two types ship. Pick the type from the picker, then between the two by who
owns the values.

`static` holds its options in the body:

```json
{ "id": "ds_status", "key": "status", "type": "static",
  "config": { "options": [{ "value": "open", "label": { "en": "Open" } }] } }
```

The body is immutable, so one changed value costs a new published version and a
migration for every running instance. Use `static` for a list the process
itself defines, such as a decision with three outcomes. Its options list stays
raw JSON in the studio. Nesting a label per option is beyond what a generated
form covers today.

`db.list` holds its options in the engine's own tables, keyed by a list key:

```json
{ "id": "ds_centres", "key": "centres", "type": "db.list",
  "config": { "listKey": "cost_centres" } }
```

Set the key from the studio's own list-key picker below the type, not a
generated form. It already offers the real, known keys, and it warns about
one that isn't. An operator maintains the values on the Data lists screen of
the admin area.
Changing one takes effect on the next form a participant opens. No publish, no
new version, no migration. Use `db.list` for a list that business staff own,
such as cost centres or departments.

Three rules follow from that split.

Publishing does not read the tables. A body naming a list that does not exist
publishes. The studio warns about the unknown key instead, and the field's
options stay empty until an operator creates the list.

A value an operator retires stays visible to the instances that already hold
it. Their forms keep rendering its label, and resubmitting the step keeps
working. The engine offers it to nobody else.

A list offers at most 500 values. Past that the engine raises rather than
resolving a short list. A truncated list would reject a value a participant
legitimately holds. A retired value a running instance holds sits on top of
that count. A full list therefore keeps working for its holders.

### Columns on a data list

A `db.list` row can carry more than a value and a label. An operator declares
columns on the Data lists screen. Each column has a key, a heading and a type:
text, number, or yes-or-no. Each value then fills one entry per column.

The picker shows those entries beside the option's label, in the order the
operator declared them. That part needs nothing from you.

The other part does. A field that binds the list maps a column onto another
field of your catalog:

```json
{ "id": "field_product", "key": "product", "type": "select",
  "dataSource": "ds_products",
  "columnMapping": { "unit_price": "field_price" } }
```

Picking a row writes the mapped fields before the transition commits. A guard
on the path out of that step therefore reads `data.price` as it reads any other
field. Nothing about CEL changes: the value is an ordinary field value by the
time a guard sees it.

Seven rules bound a mapping.

A column key matches `/^[a-z_][a-z0-9_]*$/`, the same grammar a field key
takes, and stays under the same length bound. Publishing rejects a key that
does not.

The field must name a `dataSource`, and its type must be `select`. A
`multiselect` picks several rows, and one target field takes one value.

A target must be another field of this process. It cannot be the mapping field
itself, and it cannot be a group.

Two columns cannot write one field. That would leave the write no order.

Publishing does not read the tables here either. A key naming a column the list
does not declare publishes, and writes nothing.

The mapped value wins. One submission may carry both the picker and a value for
a mapped target. The list's value is the one that lands.

The natural shape marks the target readonly in the view. A participant then
reads what the pick produced, rather than typing over it.

A catalog-level `technical` marker is the stronger form of the same intent.
`readonly` on one step leaves the target editable on another. A submission
there can still carry a value for the target. The engine writes the mapped
value and discards the submission's own value without complaint. The
`technical` key forbids the target on every step at once. The same
submission then fails as a `readonly-field` rejection before the mapping
runs. The "mapped value wins" rule never engages for it.

The engine drops an entry whose type does not match its target field, and the
submission still succeeds. The instance record names the drop. That mismatch
comes from operator data, and the participant can do nothing about it.

The Field catalog panel builds a mapping. Under the data source picker it
shows one row per mapped column. The first control picks a column key the
bound list declares. The second picks the catalog field it writes. The panel
marks a row whose key the list no longer declares.

The editor appears for a `select` field bound to a `db.list` source. For any
other source type, write the mapping as JSON in the studio's raw definition
view.

### Step

One state. Exactly one step is active per running process.

A step is terminal or it is not. A terminal step has no outgoing path, and it
ends the process. Every other step needs at least one exit.

The example has seven steps. `capture` is the initial step. `booked` and
`rejected` are terminal.

### View

What a step shows. The view names catalog fields. It overrides how this step
presents each one: visible, required, readonly, its span, its order, its group.

Requiredness lives in the view, never in the catalog. One step can demand a
field that the next step only displays.

A catalog field can carry one fact of its own: `technical`. It marks a field
the engine writes and a participant never edits, on every step at once. The
engine resolves such a field `required: false` and `readonly: true`
regardless of what any step's view says. A view entry naming it may not
declare `required` or `readonly` at all. That refines the rule above; it does
not break it. Ordinary requiredness still lives only in the view.

A view entry that declares `required: true` and `readonly: true` together
locks a field a participant can never fill. Publishing rejects that pair
unless some other source in the body writes the field first. That source
can be an action's output, a subprocess `outputMapping`, or a
`columnMapping` target. It can also be a `contract` input field, a literal
catalog `default`, or an editable entry on another step.

Publishing also lets the pair through on a step whose paths are all
automatic, or on a terminal step. The required check never runs there, so
the field can never strand anyone. A CEL `required` or `readonly` publishes
too. Only a literal `true` on both flags trips the rule. A hidden entry
(`visible: false`) publishes as well, since the engine never resolves
`required` or `readonly` for a field nobody sees.

A step can also override a field's validation, in one of two modes. The
default mode is `merge`. It keeps every catalog bound the step does not name,
and replaces only the ones it does. The `replace` mode drops the catalog's
bounds entirely, so only what the step names is in force.

A small-request step can narrow `amount`'s `max` under `merge`. A step whose
own `rule` should stand alone, without the catalog's, uses `replace` instead.

The view also sets `columns`, either 1 or 2. That is how many columns the
step's form lays its fields out in. A field's own `span`, also 1 or 2, is how
many of those columns it fills.

Both keys are optional and both mean 1 when absent. A view that names neither
shows one column with every field full width. That is what every view showed
before the two keys existed.

A field never draws wider than the form around it. A `span` of 2 on a
one-column form draws at width 1, and the stored value stays 2. Widen the form
again and the field widens with it. Below a narrow measure the form drops to
one column, whatever it declares. The stored values again stay as they are.

A group takes the form's own column count. It declares none of its own, and
it always fills the form's width. A `span` on a group is not read: two columns
inside the group need the room two columns take.

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

The studio writes a guard for you. Its condition builder offers the catalog
fields and emits the CEL. So this section tells you what the text means, not
what you must type. The text input is still there behind `Edit as CEL`, and a
guard you write by hand opens in the builder afterwards.

### Action

Something the engine does, written as a handler reference: a type and a
config. An action is never inline code.

The engine commits the state first and dispatches the action after, through an
outbox. Delivery happens at least once, so a handler must tolerate a repeat.
Actions run in a fixed order. First `onExit` of the step you leave, then
`onPath` of the path you take, then `onEntry` of the step you enter.

The example runs `http.request` on entry to `book`, posting the booking
outcome to an outside system. The devcontainer's own target echoes back
whatever it receives. The demo's booking always succeeds; a real accounting
system would decide instead. `review`'s reminder timer sends
`notification.email`. On entry to `escalated_review` the example runs both
`http.request` and `notification.email`.

An action can write its result back into the payload. The engine verifies the
value against the target field's declared type first. A value of the wrong
type never lands.

#### Who a notification reaches

`notification.email` names its recipients two ways, and you may use both at
once.

`to` holds literal addresses. It reaches a team or a manager mailbox, whoever
holds the step.

`toActors` holds roles rather than addresses. It takes three words:

- `candidate` names every actor the step's assignment resolved to.
- `claimant` names the actor holding the claim, if one holds it.
- `starter` names the actor that started the case.

The engine turns each into the address on that person's account. An account
that carries no such person, or one an operator disabled, receives nothing.
Every candidate receives the message: they are all eligible to do the work.

Name at least one recipient across the two lists. An action naming none is a
publish error.

An action that resolves to no address at all sends nothing and counts as done.
That happens when a step resolved to no candidate, which the case record
already reports as an unresolved assignment. Fix the assignment, not the
notification.

The engine reads the actors as they stood when it queued the action. It does
not read them as they stand when the message goes out. So a case that has moved
on since still notifies the people the step named.

The `http.request` type reaches only a host the deployment permits. That list
lives in the deployment's own environment, not in your process. A target
outside it never opens a connection, and the action dead-letters with the host
named in the message. Ask your operator to add the host, or pick one already
on the list. The devcontainer's own entry is `localhost:8080`, the
in-container webhook sink the example's `book` and `escalated_review` steps
both target. Try the example against it before asking for a new host
anywhere else.

Two more rules follow from the same place. The target uses `https`, unless the
deployment opted into plain HTTP. And the handler does not follow a redirect:
a target that answers `301` or `302` dead-letters with that status. Point the
action at the final address instead.

### Timer

A clock on a step. It carries a `duration` or a `deadline`, never both. The
engine computes the fire time when the process enters the step, and stores it.

A timer that names a target path forces that transition when it fires. It
ignores the guard on that path. A timer without a target path is a reminder.
It runs its actions and the process stays where it is.

The example puts one reminder on `review`, at `P7D`. Beside it at `P14D` sits
a forcing timer that takes the `escalate` path, and `book` carries one at `P1D`
that takes `booking-failed`.

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

A `process.start` action is the fire-and-forget alternative. It starts
another process from the current one's data. It does not wait for it: no
wait-state, no outcome, no contract. Use it when one process's terminal
step should start an unrelated process, not call one and park for its
result.

## Building a process

Ten steps, in the order the model forces. A path needs two steps before you
can draw it. A guard needs a field before it can read one. Follow the order
and you never have to go back.

Everything here happens in Studio, on a draft. A draft is private and
changeable. Nothing you do to a draft affects a running process.

### 1. Open a draft

Studio lists your processes. Open one, or start a new one.

**+ New process** asks what to start from. **Empty process** gives you a blank
draft. A template gives you a prepared body to change. A template is a
snapshot taken when somebody created it. Editing the template later changes
nothing you already started from it.

Your installation may list no template. Somebody holding `system:templates`
creates them on Studio's **Templates** screen, from a published version of a
process.

The draft toolbar along the top carries **Save**, **Discard draft** and
**Publish**. It also tells you whether you have unsaved changes.

The screen has two tabs, **Structure** and **JSON**. Structure is the panels
described below. JSON is the same draft as raw text, which helps when you want
to read the whole body at once.

### 2. Define the field catalog

Open the **Field catalog** panel and declare every field the process needs.
Do this first, because a view, a guard and an action output all reference a
field.

Give each field a key that matches `/^[a-z_][a-z0-9_]*$/`. A guard reads it as
`data.<key>`, and the key must survive that.

Does a select field take its options from somewhere else? Declare that source
in the **Data sources** panel. Then point the field at it.

### 3. Add the steps

Open the **Steps** panel. Add one step per state. Mark the initial step. Mark
the terminal steps.

Name states, not activities. `Review` is a state. `Send the email` is not, and
it belongs in an action.

### 4. Compose the view for each step

Select a step and choose **View** in its section index. That navigates to the
form editor, a full-screen page reached from the step's inspector.

The editor has three parts. On the left, a palette lists every catalog field
this step's view does not yet name. A second palette section mints a new
field by type: text, choice, date, file, or section. It places the new field
on the canvas in the same drag. In the middle, a canvas draws the form as a
participant will see it. Below the canvas, a strip edits whichever card you
select.

Drag a field from the palette onto the canvas to add it. Drag a card to
another position to reorder the view. Each card also carries move-up and
move-down buttons, which make the same change without a pointer. Take a card
off the canvas and its field returns to the palette.

A toggle above the canvas sets the form to one column or two. Select a card
and the strip sets that field's visible, required, readonly, span and group.
Each of the first three takes `true`, `false`, or a CEL expression. For a
field marked `technical` in the field catalog, the strip omits the required
and readonly controls. The definition contract forbids declaring either on
that field's view entry. The strip therefore offers no path to a rejected
publish.

The editor writes into the draft as you work. It has no Save button of its
own: the screen's Save, Discard and Publish still govern what persists.

A terminal step usually shows a readonly summary. A step early in the process
usually demands the fields it collects.

### 5. Draw the paths

Select a step and open its **Paths** section. Add one path per exit, and pick
its target step.

Decide manual or automatic for the whole step at once, because a step must not
mix them. Choose manual when a person decides. Choose automatic when the data
decides.

Write the guard of an automatic path as a CEL expression over `data`. Give
every automatic path on the step a distinct priority, and remember that the
lowest number goes first. If you want a default, leave its guard empty and
give it the highest number.

Do you want the process to wait for an answer from outside? Give the step one
automatic path per answer, and no default. Nothing matches until the answer
arrives, so the process waits.

### 6. Attach actions and timers

Add actions where the engine should do something. An action sits on entry to a
step, on exit from it, or on a path. Pick the type from the picker, which
lists the registered handlers. Fill in the form the studio generates for that
type. A type with no generated form still takes a raw JSON config, the same
as before. For a type that does have a form, switch to JSON instead with the
JSON button, if you prefer it.

Remember the order. `onExit` runs first, then `onPath`, then `onEntry`.

Add timers in the **Timers** section of a step. A timer with a target path
forces that transition. A timer without one is a reminder, and it only runs
its actions.

Never leave a wait-state without a timer. A step that waits for an answer that
never arrives waits forever.

### 7. Set assignment

For every step a person must act on, set the **assignment strategy** and list
the candidates. A step nobody acts on needs no assignment.

The strategy is a plugin, like an action or a data source. It carries a `type`
and a `config`. Pick the `type` from the picker, which lists the strategies
your deployment registers. A `type` nobody registered is a publish error, not
a surprise at run time.

Three strategies ship.

`static` is the one you get by default. The studio generates a form for it:
one candidates field, `finance-approver` for example. The engine uses that
list unchanged.

`org.manager-of-starter` resolves the manager of whoever started the
instance. It takes no config, so its form is empty. Use it for the approval
every process needs and no role name can express. One leave request routes to
Anna's manager, the next to Bernd's, from the same definition.

An operator records the manager on the admin Users screen. The strategy reads
one hop: the starter's manager, never their manager's manager, and never the
manager of whoever acted last.

The list the strategy produces is frozen when the instance enters the step. A
manager who changes afterwards does not change an instance already waiting.
Use delegation for the one-off case.

`org.group-members` resolves the current member list of one group, an
operator administers on the admin Groups screen. Its config carries one key,
`groupId`.

Unlike the two strategies above, this list is NOT frozen at step entry. A
membership change made after the instance enters the step still reaches it,
with no republish.

Declare the group's id in the process's own `allowedGroups` list too. A
`groupId` a step references that is missing from `allowedGroups` fails at
publish, naming the step and the group id.

Whoever holds the claim delegates it. The target need not be a candidate.
Delegation is the escape hatch from a frozen list. A rule tying it to that
same list would defeat it.

The target must name an account the deployment knows. On a deployment
running local accounts, the engine refuses a target its directory does not
hold. The claim stays where it is. A mistyped id no longer parks the task
on an identity that will never claim it. A deployment on an external identity
provider has no directory to read, so it accepts any target.

When a strategy finds nobody, the step commits with no candidates and the
instance waits where anyone can see it. The admin record carries an
`assignment.unresolved` entry naming the step and the reason. The engine
substitutes no stand-in approver: routing to the wrong person silently is
worse than a visible stall.

Assign by role, not by person, whenever a role fits. A person leaves the
company, and the process outlives them. `org.manager-of-starter` is not an
exception to that rule. It names a relationship, and the relationship
outlives whoever holds it.

### 8. Declare a contract, if another process will call this one

Open the **Contract** panel. Name the input fields, the output fields and the
outcomes. Then bind every terminal step to an outcome.

Skip this step when nothing calls your process.

### 9. Run it in the Player

The Player runs your draft. Fill in the forms as a participant would and walk
the process to a terminal step. Walk it again down a different path.

Find the mistakes here, where a fix costs one change. After you publish, a fix
costs a new version and a migration.

### 10. Publish

Press **Publish**. Studio verifies the whole body first. It refuses anything
that breaks a rule. Four examples:

- a guard that does not parse
- an unreachable outcome
- an unknown action type
- a step with no exit

A publication is immutable. Read the next chapter before you press it.

## After publish

Publishing freezes the body. The version, its hash and every rule inside it
stop changing. A running process rehydrates against exactly that body for the
rest of its life. Nobody can pull the ground out from under a process that is
already halfway through.

That is why a change produces a new version. Open a fresh draft, change it,
publish it. The old version stays, because processes still running on it still
need it. It survives as long as a single process points at it.

A new version moves nothing. Every running process stays pinned to the version
it started on. Moving them is a migration, and a migration is a deliberate
act. One rule applies to every process on one version. There is no per-process
editing, and there is no accidental upgrade.

Watch the result in Operations. It lists the running processes, and shows four
things for each one:

- the active step
- the history
- the timers waiting to fire
- the actions queued in the outbox

When something goes wrong, that is where you see it.

## What this guide is not

This guide teaches one thing: how to think about a process, and how to build
one. Three other documents cover the rest.

- `docs/current-state.md` describes each subsystem of the engine.
- `docs/openapi.yaml` documents the HTTP API.
- `src/schema/definition.ts` is the contract itself, as Zod schemas.
