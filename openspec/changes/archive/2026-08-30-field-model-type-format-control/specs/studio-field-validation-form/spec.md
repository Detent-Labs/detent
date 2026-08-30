## MODIFIED Requirements

### Requirement: The offered key set follows the field's declared type

The editor SHALL offer only the keys the engine evaluates for that field's
declared type. The function `checkConstraints` in `src/runtime/api.ts` reads
the submitted value's JavaScript type. The offered set SHALL mirror it:

| Declared type | Keys offered |
|---|---|
| `number` | `min`, `max`, `rule` |
| `string` | `minLength`, `maxLength`, `pattern`, `rule` |
| `list` | `minLength`, `maxLength`, `rule` |
| `boolean`, `group` | `rule` |
| `file`, a plugin type | `min`, `max`, `minLength`, `maxLength`, `pattern`, `rule` |

The declared `format` SHALL NOT narrow the offered set. A format fixes the
value's semantics, and `checkConstraints` still reads the same JavaScript type
underneath it. A `format: "date"` field is a string field to every branch that
function runs.

`typeMatches` (`src/schema/definition.ts`) treats `file` and a plugin type as
opaque. Neither constrains the submitted value's JavaScript shape, so
`checkConstraints` may apply any of its branches depending on what arrives.
The offered set mirrors that by offering everything.

`boolean` and `group` never reach a `checkConstraints` branch, regardless of
value. `rule` is all either can ever use.

The editor SHALL offer `rule` for every type. A CEL rule reads the whole
instance context, not one value's JavaScript type.

#### Scenario: A number field

- **WHEN** an author opens the validation editor on a `number` field
- **THEN** the editor offers `min`, `max` and `rule` alone

<!-- Scenario title stays verbatim: the OpenSpec archive step matches this block by exact title. -->
#### Scenario: A multiselect field

- **WHEN** an author opens the validation editor on a `list` field
- **THEN** the editor offers `minLength`, `maxLength` and `rule` alone, since a
  list carries no pattern

#### Scenario: A format leaves the offered set alone

- **WHEN** an author opens the validation editor on a
  `{type: "string", format: "date"}` field
- **THEN** the editor offers the same keys it offers on a `string` field
  declaring no format

#### Scenario: A field whose type carries a plugin envelope

- **WHEN** an author opens the validation editor on a field with a custom
  (plugin) type
- **THEN** the editor offers every key, since the type constrains no
  particular JavaScript shape for the submitted value
