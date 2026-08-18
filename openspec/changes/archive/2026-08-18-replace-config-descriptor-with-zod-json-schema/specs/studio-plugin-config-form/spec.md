## MODIFIED Requirements

### Requirement: A type with no declared config schema keeps the raw JSON path

A type with no declared config schema keeps its raw JSON path. The editor
SHALL fall back to the raw JSON textarea for that type's config. This
matches today's behavior exactly.

A type WITH a declared config schema still falls back to the raw JSON
textarea in one case. The schema, or a property inside it, then uses a
construct the generated form cannot render. Eight such constructs exist:

- a record-valued property (an open-ended set of keys, each sharing one
  value type)
- a nested object property
- a property with no declared type (accepts any value)
- a string property with a declared format other than `email`
- a string property constrained by a pattern (a regular expression, or a
  required prefix or suffix)
- a numeric property whose bound is exclusive rather than inclusive
- a numeric property constrained to a multiple of a given number
- an array-valued property whose elements are not strings and not a fixed
  string enum (numbers, booleans, or nested objects)

Any one of these, anywhere in the schema, drops the descriptor for the
WHOLE type. Every other property of that type falls back to the raw JSON
textarea alongside it. The fallback is not limited to the one property
carrying the unsupported construct.

#### Scenario: A schema-less type still accepts arbitrary JSON

- **WHEN** a developer selects a registered type that declares no config
  schema
- **THEN** the editor shows the raw JSON textarea for that type's config

#### Scenario: A record-valued property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a record-valued property
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A nested object property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a property that is itself a nested object
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: An untyped property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a property with no declared type
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A non-email string format sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a string property with a format other than email
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A pattern-constrained string property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a pattern-constrained string property
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: An exclusive numeric bound sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a numeric property with an exclusive minimum or maximum
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A multiple-of-constrained numeric property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a `multipleOf`-constrained numeric property
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A non-string array property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares an array property with non-string, non-enum elements
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type
