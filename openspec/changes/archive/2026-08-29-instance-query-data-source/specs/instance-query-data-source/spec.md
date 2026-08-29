## Purpose

A data source type whose option list is the instances of another process. The
step they stand on and the values they hold select them. An author
offers real things a process tracks, without writing SQL and without copying
a list into the body.

## ADDED Requirements

### Requirement: A built-in "instance.query" data source handler reads another process's instances

The engine SHALL ship a built-in `"instance.query"` data source handler.
`createDefaultDataSourceRegistry` SHALL register it, beside `"static"` and
`"db.list"`.

`resolve` SHALL get its matches from the Runtime API Layer's instance data
read. It SHALL issue no statement of its own against the instance table. That
read already applies the filters below, bounds its result, and reports
truncation.

The handler SHALL be a leaf. It SHALL resolve no other data source.

#### Scenario: An instance on a selected step becomes an option
- **WHEN** a field binds an `"instance.query"` source whose target process
  holds an instance standing on a configured step
- **THEN** the resolved options carry that instance

#### Scenario: An instance on another step stays out
- **WHEN** the target process holds an instance standing on a step the
  source does not name
- **THEN** the resolved options omit that instance

<!-- Requirement headers stay byte-identical: the OpenSpec archive step matches them by exact text. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The configuration names a process, a step set, a status set and a comparison list

The handler's `configSchema` SHALL accept these keys and no others.

The config SHALL carry a `processId`. It names the target process.

`stepIds` SHALL be an optional list of step ids. The read filters on the
instance's current step. An absent or empty `stepIds` SHALL apply no step
filter. The handler SHALL realize "no step filter" by omitting the read's own
`currentStepId` filter entirely. It SHALL pass `undefined`, never an empty
array. The `instance-data-query` read never accepts an empty `currentStepId`
from any caller.

`statuses` SHALL be an optional list of lifecycle statuses. It SHALL default
to `["running"]` alone.

The step is the filter that carries this capability, not the status. Every
circulating device is `running` whichever step its instance stands on. A
status set alone therefore answers a different question.

The `where` key SHALL be an optional list of comparisons. The `labelFieldId`
key SHALL be a required field id of the target process. The `attributes` key
SHALL be an optional object. Its key is a column key, and its value is a field
id of the target process. A column key SHALL match `/^[a-z_][a-z0-9_]*$/` and
stay within `MAX_KEY_LENGTH`.

The author writes the column key here rather than taking it from the source
field's `key`. A `key` is a mutable slug, so a rename of the source field would
silently break a `columnMapping` that names it.

#### Scenario: A configuration with no statuses selects running instances
- **WHEN** an `"instance.query"` configuration omits `statuses`
- **THEN** resolution selects instances whose status is `running`, and omits a
  completed or cancelled one

#### Scenario: A configuration naming an unknown key fails the publish
- **WHEN** a data source declares `type: "instance.query"` and a `config`
  carrying a key the schema does not declare
- **THEN** validation produces a located issue for that data source's config

#### Scenario: A configuration with no processId fails the publish
- **WHEN** an `"instance.query"` configuration omits `processId`
- **THEN** validation produces a located issue for that data source's config

### Requirement: A comparison's right side is a literal or a field of the reading instance

Each entry of `where` SHALL name a field id of the target process and an
operator. The operators SHALL be the ones the instance data read accepts:
equality, inequality, and membership in a list.

An entry SHALL carry exactly one right side. `value` SHALL be a scalar
literal. `valueFromField` SHALL be a field id of the reading instance's own
process. An entry carrying both, or neither, SHALL fail the publish.

The handler SHALL substitute the reading instance's held value for a
`valueFromField` entry before it calls the read. The read itself accepts a
literal right side alone. This substitution is what widens what an author can
express.

A `valueFromField` entry whose field the reading instance has not written
SHALL resolve the whole source to an empty option list. It SHALL NOT raise.
An unwritten field is normal on a step the participant reaches before filling
it. This matches the totality a guard already has, where an unreadable value
means no match rather than a throw.

A `valueFromField` entry SHALL read the value its field held at step entry.
Resolution reads the instance's committed data. A field the participant fills
on the picker's own step therefore contributes its pre-submit value.

An author wanting the option list to react to a field SHALL put that field on
an earlier step. `docs/authoring-guide.md` SHALL state this constraint. No
publish check enforces it.

#### Scenario: A literal right side selects matching instances
- **WHEN** a comparison names field F, equality, and the literal `"shelf"`
- **THEN** resolution offers the target instances holding `"shelf"` under F

#### Scenario: A reading-instance field supplies the right side
- **WHEN** a comparison names `valueFromField` G, and the reading instance
  holds `"berlin"` under G
- **THEN** resolution offers the target instances holding `"berlin"` under the
  compared field

#### Scenario: An unwritten source field yields an empty list
- **WHEN** a comparison names `valueFromField` G, and the reading instance
  holds no value under G
- **THEN** resolution returns an empty option list, and raises nothing

<!-- Scenario bullets stay verbatim: the OpenSpec archive step matches this block by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A same-step field contributes its pre-submit value
- **WHEN** a comparison names `valueFromField` G, and the participant fills G
  on the same step that carries the bound picker
- **THEN** resolution reads the value G held when the step was entered

#### Scenario: An entry carrying both right sides fails the publish
- **WHEN** a comparison declares `value` and `valueFromField` together
- **THEN** validation produces a located issue for that data source's config

#### Scenario: An entry carrying neither right side fails the publish
- **WHEN** a comparison declares neither `value` nor `valueFromField`
- **THEN** validation produces a located issue for that data source's config

<!-- Requirement headers stay byte-identical: the OpenSpec archive step matches them by exact text. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: A valueFromField reference resolves to a scalar field of the reading process

`valueFromField` names a field of the publishing process, not the target's.
Publish validation SHALL reject a `valueFromField` that resolves to no field
of the reading process's own catalog. It SHALL also reject one that resolves
to a field whose declared type holds a non-scalar value.

<!-- "render" (the UI act of drawing options) and "display" (display text, process-contract.md's own term) are different concepts here, not synonyms; "render" is this file's own established word, used again below. -->
<!-- antislop: allow synonym-rotation -->
This is an in-process check, unlike the compared field's own type check
above. No target-process lookup happens, since the reference names the
publishing body's own catalog. Left unchecked, a `multiselect`- or
`group`-typed `valueFromField` substitutes an array or an object as the
read's comparison right side. The instance data read then rejects that
non-scalar value as invalid, at resolution time. This happens on every form
render and every submission that reaches the source, not once at publish.

#### Scenario: An unresolvable valueFromField fails the publish
- **WHEN** a `valueFromField` names a field id absent from the reading
  process's own catalog
- **THEN** validation produces a located issue for that data source's config

#### Scenario: A non-scalar valueFromField field fails the publish
- **WHEN** a `valueFromField` names a field of the reading process's own
  catalog whose declared type is `multiselect` or `group`
- **THEN** validation produces a located issue for that data source's config

#### Scenario: A scalar valueFromField field publishes
- **WHEN** every `valueFromField` in a source's `where` names a field of the
  reading process's own catalog whose declared type is scalar
- **THEN** publishing succeeds, subject to the other checks

### Requirement: A query over the reading instance's own process excludes that instance

When `processId` names the reading instance's own process, the handler SHALL
exclude the reading instance from the result. It SHALL pass its own instance
id to the read's exclusion filter.

This is a rule, not a configuration option. An instance's own contribution to
an option list it is itself reading is never what a picker wants.

The exclusion SHALL apply to the reading instance alone. Another instance of
the same process stays offered.

#### Scenario: A self-targeting query omits the reading instance
- **WHEN** an `"instance.query"` source names the reading instance's own
  process, and the reading instance itself matches every other filter
- **THEN** the resolved options omit the reading instance

#### Scenario: A sibling instance stays offered
- **WHEN** that same source's filters also match a second instance of that
  process
- **THEN** the resolved options carry the second instance

<!-- Scenario bullets stay verbatim: the OpenSpec archive step matches this block by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A query over another process excludes nothing
- **WHEN** an `"instance.query"` source names a process other than the reading
  instance's own
- **THEN** no instance is excluded on identity grounds

### Requirement: An option carries the source instance's id as its value

The `value` of a resolved option SHALL be the source instance's id. The
`label` SHALL carry the value the source instance holds under `labelFieldId`.

The id survives a rename of the source. An asset tag corrected from
`MBP-0041` to `LT-2024-0041` leaves the reference intact. The picker shows the
new tag for the same device.

`FieldOption.label` is a `LocalizedText`, not a plain string. The value a
source instance holds is a plain `Literal`. The handler SHALL wrap it as a
one-entry `LocalizedText`, keyed by the reading process's own base locale:
`{ [readingBaseLocale]: String(value) }`.

A viewer whose active locale differs from the reading process's base locale
sees the label field's own fallback-to-id behavior (below). It does not see
the resolved value. This is a known, accepted limitation. See `design.md`'s
"A resolved label is a single-locale `LocalizedText`".

`attributes` SHALL carry one entry per configured column key whose source
field the instance fills with a scalar value. The handler SHALL walk the
configured `attributes` declaration, and look each field id up in the
instance's `data`. It SHALL NOT walk the instance's `data`. A source
declaring no `attributes` SHALL produce an option with no `attributes` key at
all.

A source instance holding a non-scalar value under a configured `attributes`
field SHALL produce no entry for that column key. This is the same treatment
an unfilled field gets. The `attributes` values are plain
`string | number | boolean`. A `multiselect` or `group` field can hold an
array or an object instead. No publish check rules that out for an
`attributes` reference.

A source instance holding no value under `labelFieldId` SHALL resolve its
option's `label` to a one-entry `LocalizedText`. That value holds the
instance id, under the reading process's base locale. A picker then shows a
reference rather than an empty row.

A source instance holding a non-scalar value under `labelFieldId` SHALL
resolve its option's `label` to the instance id the same way. A `FieldOption`'s
label is display text, and no rendering of an array or an object belongs to
this handler.

#### Scenario: An option carries the id and the label field
- **WHEN** a matching source instance holds `"MBP-0041"` under `labelFieldId`
- **THEN** the resolved option's `value` is that instance's id, and its
  `label` is a `LocalizedText` holding `"MBP-0041"` under the reading
  process's base locale

#### Scenario: A configured attribute reaches the option
- **WHEN** the configuration maps the column key `serial` onto a source field
  the matched instance fills with a scalar value
- **THEN** the resolved option carries `attributes.serial` with that value

#### Scenario: An unfilled attribute field produces no entry
- **WHEN** the matched instance holds no value under a configured attribute's
  source field
- **THEN** the resolved option's `attributes` carries no entry for that column
  key

#### Scenario: A non-scalar attribute field produces no entry
- **WHEN** the matched instance holds an array or an object under a
  configured attribute's source field
- **THEN** the resolved option's `attributes` carries no entry for that column
  key, and resolution raises nothing

#### Scenario: An unset label field falls back to the id
- **WHEN** a matching source instance holds no value under `labelFieldId`
- **THEN** the resolved option's `label` is a `LocalizedText` holding the
  instance id under the reading process's base locale

### Requirement: A held reference resolves even when the filters exclude it

`resolve` SHALL return an option for every instance id named in
`ctx.heldValues`, whether or not the configured filters still select it.

It SHALL get them through a second call to the instance data read. That call
SHALL pass the configured `processId` and an `instanceIds` filter naming the
held ids. It SHALL pass no step filter, no status filter and no comparison.
Those are the filters the held reference has to survive, so applying them
would defeat the read.

The `instanceIds` filter is new. The `instance-data-query` capability carries
its own delta in this change. The read offered no way to select an explicit
set of ids before it.

A device issued to a participant leaves the shelf step, so the step filter
stops selecting it. The instance that already holds that reference must keep
resolving it. Otherwise submission validation rejects a value the participant
never changed.

This mirrors the treatment `db.list` gives a retired value. A filter excludes
the source instance where a deactivation retired the value. The effect on a
holder is the same.

A held id naming no instance of the target process SHALL resolve to no
option. Nothing invents a row for an id the target process does not hold.

A held id SHALL NOT count against the bound below.

#### Scenario: A held instance off the filtered step still resolves
- **WHEN** `heldValues` names a target instance that has moved to a step the
  configuration does not name
- **THEN** the resolved options carry that instance with its label

#### Scenario: A held instance that no longer exists resolves to nothing
- **WHEN** `heldValues` names an id no instance of the target process holds
- **THEN** the resolved options carry no entry for that id

#### Scenario: A held reference keeps its attributes
- **WHEN** `heldValues` names a filtered-out instance of a source configuring
  attributes
- **THEN** the resolved option carries that instance's label and attributes

### Requirement: A redacted source instance is not offered but stays resolvable

Redaction clears a source instance's field values. Its `labelFieldId` value is
therefore gone.

The handler SHALL omit a redacted instance from the filtered result. It SHALL
NOT offer a participant a reference whose data no longer exists.

The handler SHALL still resolve a redacted instance named in
`ctx.heldValues`. Its `label` SHALL fall back to the instance id, by the rule
above. A holder's submission then still validates, and the reference stays
visible as an id.

A redacted instance's option SHALL carry no `attributes`. Redaction emptied
the `data` those entries read, so every configured column key resolves to no
value. This is the general unfilled-attribute rule, not an exception to it.

The offered half of this rule is narrow on purpose. Redaction refuses a
running instance, so a redacted instance is never `running`. The default
`statuses` therefore already excludes it. The offered half applies only where
an author widens `statuses` to admit a completed or cancelled instance. The
held half needs no such widening, and it is the half that matters in practice.

#### Scenario: A redacted instance drops out of the offered list
- **WHEN** the filters select a target instance that redaction has cleared
- **THEN** the resolved options omit that instance

#### Scenario: A held redacted instance still resolves
- **WHEN** `heldValues` names a redacted target instance
- **THEN** the resolved options carry that id, with the id as its label

#### Scenario: A held redacted option carries no attributes
- **WHEN** `heldValues` names a redacted target instance, and the source
  configures attributes
- **THEN** the resolved option carries an `attributes` map with no entry

### Requirement: The handler bounds the offered instance count and raises rather than truncating

The engine SHALL define `MAX_INSTANCE_QUERY_OPTIONS`. The handler SHALL throw
a plain `Error` naming the `processId` in two cases. The first is a filtered
read reporting that its own bound truncated the result. The second is a match
count exceeding `MAX_INSTANCE_QUERY_OPTIONS`. It SHALL NOT return a truncated
list.

A truncated option list is worse than a throw. It renders as a complete
picker, and the missing rows look like instances that do not exist.

This matches the bound `db.list` already enforces on a data list.

#### Scenario: A result over the bound raises rather than truncating
- **WHEN** the configured filters select more than
  `MAX_INSTANCE_QUERY_OPTIONS` instances
- **THEN** resolution throws an `Error` naming the `processId`

#### Scenario: A truncated read raises
- **WHEN** the underlying instance data read reports that its own bound cut
  the result
- **THEN** resolution throws an `Error` naming the `processId`

#### Scenario: A result within the bound resolves
- **WHEN** the configured filters select fewer instances than the bound allows
- **THEN** resolution returns one option per selected instance

### Requirement: Options come back in a stable order

`resolve` SHALL return its options in the order the underlying read produces.
That order is creation time, newest first, with the instance id breaking a
tie. A
held option the filtered read did not select SHALL follow the filtered
options, ordered by instance id.

One configuration therefore offers one order, call after call. A picker whose
rows move between two renders of the same step would read as data changing.

#### Scenario: Two resolutions of one unchanged configuration agree
- **WHEN** a field resolves the same `"instance.query"` source twice, with no
  instance of the target process changing between the calls
- **THEN** both calls return the same options in the same order
