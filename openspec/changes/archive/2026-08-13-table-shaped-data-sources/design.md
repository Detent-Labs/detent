## Context

See `proposal.md` for motivation. What follows is the state the code is in, and
the constraints that pick the approach.

The `"db.list"` handler reads two tables in one `LEFT JOIN`
(`src/engine/host.ts`). The join separates "no such list" from "a list with
nothing to offer". A retired value that `heldValues` names comes back, so its
label still renders. The bound counts active rows. The query leaves room for
the held ones on top.

`FieldOption` is `{ value, label }`, in `src/schema/definition.ts`. It serves
three positions at once. An inline `FieldDef.options` array uses it. A
`"static"` data source config uses it. A handler's `resolve` returns it.
`ResolvedViewField.options` carries the same type through to `InstanceView`.

`validateSubmissionData` in `src/runtime/api.ts` already resolves the step's
fields, options included. It already merges `instance.data` with the submission
to build a guard context. Both `submitAndTransition` and
`createProcessInstance` call it. The write-back needs the option list that call
already produced.

`compileProcessBody` in `src/schema/compile.ts` runs the write-path checks.
`checkIdResolution`, `checkFieldKeyFormat`, `checkUnknownKeys` and
`checkLengthBounds` all live there. `packages/web`'s `draft/validation.ts`
imports the same function. A check added there therefore reaches the studio's
checks rail with no browser-side code.

The `system:datalists` routes in `src/http/admin-routes.ts` own the operator
payloads. `PUT /admin/data-lists/:listKey/values` replaces the whole value set.
It retires an omitted value rather than deleting it.

## Goals / Non-Goals

**Goals:**

- One data model for an extra column. It serves the picker and the write-back
  alike.
- No publish to make a list table-shaped. The property belongs to the operator.
- No hash change, and no read-path tightening. Every stored body keeps
  deserializing and keeps its `definitionHash`.
- The write-back lands before the guard runs. A mapped field is therefore
  guardable on the same hop.
- One deterministic outcome per submission, whatever the request carries.

**Non-Goals:**

- No CEL namespace for a data source. That deferral stands. A mapped attribute
  becomes readable only after it lands in an ordinary field.
- No custom combobox. The picker stays a native `<select>`.
- No `columnMapping` builder in the field catalog. Item 10's hold covers that
  panel.
- No read of a data list at publish. Publishing stays independent of the state
  of the data.
- No attribute type beyond a JSON scalar. A nested object there would reopen
  every question this design closes.

## Decisions

### The column declaration lives on the list, not in the process body

A `data_lists` row carries `columns`, an array of `{ key, label, type }`. The
`"db.list"` `configSchema` stays `{ listKey }` alone.

The alternative puts the columns in the data source's `config`. That reads
tempting, since an author would see the shape they bind to.

It fails on the property that makes `"db.list"` worth having. An operator
changes the values with no publish. A column is the same kind of fact as a
value. Splitting them puts half the shape behind a publish and half in front of
it.

It also breaks the delete guard's premise. `data-list-administration` blocks a
list delete while a published body names its key. Nothing equivalent could
block a column rename, because the body would carry its own copy.

The cost is real, and this design states it. An author who writes a
`columnMapping` names a column key with no publish-time check behind it. A key
naming no declared column writes nothing, quietly. The studio's `listKey`
picker already reads `GET /admin/data-lists`. A later no-code editor therefore
offers the declared keys from that same request. Until item 10 lifts, the JSON
surface carries the mapping.

### A column declares a scalar type, and the engine checks rather than coerces

`type` is `string`, `number` or `boolean`. The admin route parses the operator's
input once, at the write. It stores a real JSON scalar.

The alternative stores every attribute as text. It then coerces at write-back
against the target field's declared type. That needs no `type` on the column,
which is genuinely less to configure.

It fails on the silent case. A `price` stored as `"12.50"` lands in a string
field. `data.price > 10` then compares a string against a number. CEL raises. A
raise means "no match". The instance parks with nothing in the record saying
why.

Checking rather than coercing also matches what `Action.output` already does.
The outbox checks a handler's returned value against the target field's type.
It drops a mismatch and names it in `droppedTargets`. One rule, two write
paths.

### `attributes` goes on `FieldOption`, not on a parallel runtime type

`FieldOption` gains `attributes?: Record<string, string | number | boolean>`.

A parallel `ResolvedOption` type would leave the authored contract untouched.
It would also fork the type at every site that reads an option. The renderer,
the membership check and the view each read one. `"static"` would then carry no
attributes. That loses the cheapest way to test the write-back, and the
cheapest way for an author to prototype one.

The key is optional, and no existing body declares it. `definitionHash`
therefore does not move. The read path already strips an unknown key. A stored
body parses exactly as before.

`checkUnknownKeys` needs no work of its own. `FIELD_OPTION_KEYS` and
`FIELD_DEF_KEYS` come from `shapeKeys()` over the two schemas. A key added to
the schema is a legal key at once.

### The invariants sit in the compile pass, never in a Zod refinement

`.claude/rules/authoring-invariants.md` states the rule. `definition.ts` is
also the deserializer for stored immutable bodies. A refinement there would
make an already-published body throw on read. Its pinned instances would stop
rehydrating.

`columnMapping` also needs the recursive field set to resolve its targets.
`checkIdResolution` already walks that set for `SubprocessSpec.outputMapping`
and for `ProcessContract`. The new check joins that function rather than
duplicating the walk.

`structuralIssues` runs ahead of the `publishedProcessBody` early return, so it
runs on an already-published body at re-publish. That placement differs from
the registry and CEL checks, which run after the hash-hit no-op in
`publishBody`. A new structural check therefore has to be safe against every
stored body. This one is: no existing body carries `columnMapping`, so no
identical re-publish can newly fail.

The `select`-only rule earns its own line. A `multiselect` picks several rows.
Each row carries its own `price`, and one target field takes one value. Every
rule that would rescue it picks a behavior nobody asked for. First row wins,
last row wins, an array: each is a guess. Rejecting at publish is the honest
answer.

### The write-back runs after `validateSubmissionData`, inside its transaction

Order in `submitAndTransition`:

1. Claimant enforcement, unchanged.
2. `validateSubmissionData`, unchanged. It resolves the fields and their
   options. It raises on a participant's bad input.
3. The write-back reads the options that step produced. It applies each
   `columnMapping`. It returns an augmented `data` and the list of drops.
4. `commitManualTransition` takes the augmented `data`. It builds the guard
   context from it, so a guard on the outgoing path reads a mapped value.
5. The drops become `datasource.attribute-dropped` events in the same
   transaction.

Step 3 has to sit after step 2, not inside it. `validateSubmissionData` raises a
`SubmissionValidationError`. That error blames a field on the participant's
form. A mapped attribute comes from operator data, and a participant can do
nothing about it. Folding the drop into that error would report an operator's
mistake as the participant's.

`createProcessInstance` takes the same two steps in the same order. A start
form carrying a picker therefore behaves like any other step. There the
write-back runs before `resolveStepAssignment`, which reads the seed data. An
assignment strategy on the initial step therefore reads the mapped values.

`commitManualTransition` accepts no events today. It gains one more optional
argument, after `assignmentRegistry`, so every existing caller compiles
unchanged. That is the seam the drops need to land in the commit's own
transaction. `executeManualTransition` passes it through. At creation the drops
join the `InstanceEvent[]` that `createInstance` already takes.

`validateSubmissionData` returns `void` today. It will return the
`ResolvedViewField[]` it already built. That saves a second resolution.

That list also fixes the order. `resolveFields` walks `step.view.fields`, so
the write-back walks the order the participant saw. Walking the request's own
keys instead would hand the order to whoever posted it.

### A mapped target takes the mapped value, whatever else the request says

Three rules could apply when one request carries both a picker and a value for
one of its targets. The submission wins, the mapping wins, or the publish
rejects the overlap.

Rejecting at publish is wrong. An author legitimately marks a mapped field
readonly, so a participant sees what the pick produced. The view is per-step,
and the mapping is process-wide. A publish check would have to reason across
every view.

The submission winning is worse than it looks. A form posts every editable
field it renders. That includes one the participant never touched. The "the
person edited it" reading is therefore not available from the request.

The mapping winning is the one rule with no hidden case. The list owns a mapped
field. The same reasoning makes a readonly or invisible target take the value
too. An author writes the mapping. The view bounds what a participant may
change, not what the engine may write.

### The renderer folds attributes into the option's text

A native `<option>` carries text alone. Composing `label · sku · price` into
that text gets four things from the platform. Keyboard behavior, type-ahead,
the accessible name and the popup all come free. The cost is one `map`.

A custom listbox would draw real columns. It would also own focus management
and the roving tabindex. Type-ahead, the popup's position and every `aria-*`
attribute come with it. `spa-accessibility` would carry all of that. Nothing in
stage 29 asks for aligned columns. The honest cost of that alignment is a
component nobody has budgeted.

Order comes from the `attributes` map. The handler builds the map in the list's
declared column order. A JavaScript object preserves string-key insertion order
through `JSON.stringify` and `JSON.parse`. The `db-data-source-type` delta
states that as a requirement. A test therefore pins it, rather than a comment
hoping for it.

### A new event kind, not a new outcome field

A drop records `datasource.attribute-dropped`. `mapping.entry-dropped` already
exists for the subprocess case. Reusing it by adding a third `direction` was
the tempting move. `direction` means `"input"` or `"output"` across a
subprocess boundary. No third direction exists here. Stretching the word would
make the existing two harder to read.

An `ActionOutcome`-style `droppedTargets` field does not fit either. That
attaches to the record that enqueued an action. This drop enqueues nothing.

## Risks / Trade-offs

- **An unknown mapping key writes nothing, quietly.** → Publishing reads no
  data list, so nothing catches the typo. The admin detail route already
  reports which processes reference a list, and a later item can report the
  reverse. Until then, the JSON surface is the authoring path. An author reads
  the columns on the admin screen.
- **A column rename orphans every mapping on the old key.** → The operator
  sees no warning, because the body lives elsewhere. The admin screen warns on
  a column removal, and a rename is a removal plus an addition in one request.
  The warning names the values it drops. It cannot name the processes, and this
  change does not pretend otherwise.
- **The mapping beats a participant's own value, which can surprise.** → The
  rule is one sentence in `docs/authoring-guide.md`. The natural shape marks a
  mapped target readonly, and a browser check walks that case.
- **A `type` can change under a published mapping.** → A `number` column
  turned `string` starts dropping every write. The drop reaches the record as
  an event, and the admin record screen shows it. The alternative blocks that
  change against published bodies, which reintroduces the publish coupling the
  first decision removed.
- **The bound covers the payload, not the option text.** → Ten columns of long
  values make an unreadable `<option>`. `MAX_DATA_LIST_COLUMNS` is 10. The
  browser check reads a list at the bound. A shorter bound is a one-constant
  change if that check says so.
- **Two more jsonb projections per resolution.** → The handler's query gains no
  join and no row. The bound on active values does not move.

## Migration Plan

Two statements carry this. `CREATE TABLE IF NOT EXISTS` covers a fresh
database, and `ADD COLUMN IF NOT EXISTS` covers an existing one. `store.ts`
runs both at boot. Every other column here arrived that way. Both new columns
are `NOT NULL` with a default, so an existing row takes the empty case with no
backfill.

Rollback is a code revert. The two columns stay behind and read as empty. That
is what a deployment before this change already sees. A published body carrying
`columnMapping` still parses under the reverted code, because the read path
strips an unknown key. Its mapping then does nothing. That is a degraded
process, not a broken one.

Under multi-tenancy, both columns land in each tenant's own database. They
arrive through the same `store.ts` path that creates the tables. The control
plane keeps its own state unchanged.

## Open Questions

- Should the admin detail route report which processes map a given column? It
  already reports which processes reference the list. The reverse needs a scan
  of every published body's `columnMapping` keys. The answer changes no spec
  and no task here. It is worth deciding after an operator has used the screen
  once.
- Does `MAX_DATA_LIST_COLUMNS` want a value other than 10? The browser check at
  the bound answers it. Moving the constant afterwards touches one line and one
  test.
