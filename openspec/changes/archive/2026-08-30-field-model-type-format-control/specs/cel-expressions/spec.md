<!-- antislop: allow-file em-dash passive-voice sentence-length -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## ADDED Requirements

### Requirement: A catalog field's CEL type follows its type and its format

Every catalog field SHALL report one CEL type, derived from its declared `type`
and its declared `format`:

| declared `type` | CEL type |
|---|---|
| `string` | `string` |
| `number` | `double`, or `int` when `format` is `"integer"` |
| `boolean` | `bool` |
| `list` | `list<string>` |
| `file` | `dyn` |
| `group` | `dyn` |

A field whose `type` is a plugin envelope SHALL report `dyn`, unchanged. A
`group` field is a container. It contributes no entry to the `data` namespace,
and no caller reads its own CEL type as a leaf.

Only `format` moves a CEL type, and only its `integer` member does so. The
`date`, `datetime` and `email` members all sit over `string` and report
`string`.

An author marking a number field `format: "integer"` can then compare it to a
bare CEL integer and take its remainder. Both fail against `double` today. A
bare `3` is a CEL `int`, and the library holds no overload mixing the two. The
same rule makes an expression mixing an integer field with a decimal field a
publish error. No overload covers that pair either.

#### Scenario: An integer field compares against a bare integer literal

- **WHEN** a guard reads a `{type: "number", format: "integer"}` field and
  compares it to `3`
- **THEN** the expression type-checks, and publishing succeeds

#### Scenario: A plain number field still reports double

- **WHEN** a guard reads a `{type: "number"}` field declaring no `format` and
  compares it to `3`
- **THEN** the expression fails the type check, exactly as it does today

#### Scenario: An expression mixing an integer field with a decimal field fails

- **WHEN** an expression adds a `format: "integer"` field to a `number` field
  declaring no format
- **THEN** authoring-time validation rejects it, naming the type error

#### Scenario: A format over string leaves the CEL type alone

- **WHEN** a guard reads a `{type: "string", format: "date"}` field and
  compares it to a string literal
- **THEN** the expression type-checks as a `string` comparison

## MODIFIED Requirements

### Requirement: A timer deadline is validated against the context the engine builds

The engine evaluates a `deadline` over the guard context it builds at runtime, which
is `data`, `instance` and `actor` and nothing else. Authoring-time validation SHALL
therefore withhold from a `deadline` site every namespace that context does not
carry, so that an expression the engine cannot honour is a publish error rather than
a timer that never arms.

The `child` namespace SHALL be withheld: a deadline is evaluated at entry, before any
child instance exists. Data sources SHALL be withheld — but as everywhere, not as a
deadline-specific exception: no CEL site registers a data source, because none is
resolved at evaluation. A deadline referencing either raises at every arming, for
every instance of the definition, permanently, so each is a publish error instead.

A `deadline` SHALL additionally be required to infer to `string`. A deadline is
parsed into an instant, and a value that is not one is dropped at arming — at which
point it is indistinguishable from a timer that was never declared. An expression
inferring to `dyn` is accepted, because a plugin field type's real type is not
knowable at authoring time.

#### Scenario: data-source reference in a deadline is rejected

- **WHEN** a timer `deadline` expression references a declared data-source result
- **THEN** authoring-time validation rejects it as an unknown reference

#### Scenario: a data source is not visible to a guard either

- **WHEN** a path guard on that same step references that data-source result
- **THEN** authoring-time validation rejects it as an unknown reference — data sources are withheld from every site, not the deadline alone

#### Scenario: non-string deadline is rejected

- **WHEN** a timer `deadline` expression infers to a non-string type — a `number`
  field (`double`), a `format: "integer"` field (`int`), a `boolean` field
  (`bool`), or a `list` field (`list<string>`)
- **THEN** authoring-time validation rejects it, naming the expected and actual type

#### Scenario: string-typed and dyn-typed deadlines are accepted

- **WHEN** a `deadline` reads a `string` field, whatever `format` that field
  declares, yields a string from an expression, or reads a field whose CEL type
  is `dyn`
- **THEN** authoring-time validation accepts it

#### Scenario: the result-type expectation does not leak to other sites

- **WHEN** a path guard infers to `bool`, an `Action.output` expression to a number,
  or a view flag to `bool`
- **THEN** each still type-checks, because only the deadline site declares an
  expected result type
