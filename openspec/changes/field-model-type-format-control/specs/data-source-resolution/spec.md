<!-- antislop: allow-file passive-voice sentence-length -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: A data-source-bound view field's options are resolved at runtime

<!-- antislop: allow sentence-length passive-voice -->
<!-- Paragraph carried from the main spec, including the dedup note in parentheses. -->
`resolveFields` (`src/runtime/api.ts`) SHALL accept a `registry:
DataSourceRegistry` parameter and, for each view field whose `FieldDef`
declares `dataSource`, resolve the referenced `DataSourceDef` from
`body.dataSources`, look up its handler in `registry` by `type`, call
`resolve({ config: def.config, heldValues, instance })`, and attach the
result. `heldValues` SHALL carry the values the instance holds for that field:
none when the field is unset, one for a `string` field, and the whole array
for a `list` field. `instance` SHALL carry the instance whose view or
submission is resolving, with its `id`, its `processId`, its current `data`,
and its process's `baseLocale`. Each view
field resolves through its own `resolve` call. Two
fields on the same step bound to the same data source and holding the same
values each trigger their own call; neither call's result is shared with the
other (`dedup-runtime-pagination-webhook-sink`: the per-call memoization this
requirement once described added 18 lines to dedupe a case `resolveFields`
does not hit in a hot loop, and was removed).

`instance.data` SHALL be the instance's committed data. A submission SHALL
resolve against the same data the view read resolved against. It SHALL NOT
resolve against the submitted payload merged over that data.

The renderer draws its option list before the participant submits anything, so
it resolves against committed data. Membership validation must check the list
the participant chose from. Resolving a submission against a merged payload
would check a different list.

A handler comparing against a reading-instance field therefore reads the value
that field held at step entry.

`ResolvedViewField` SHALL gain an `options?: FieldOption[]` property,
populated from `field.options` when the field declares static options
unchanged, or from the resolved data-source result when the field declares
`dataSource`. This is the single field downstream code (view rendering,
submission validation) SHALL read options from, rather than reading
`FieldDef.options` directly.

#### Scenario: A static-options field's resolved options are unchanged
- **WHEN** a view field's `FieldDef` declares `options` (not `dataSource`)
- **THEN** the resolved field's `options` equals that static `options` array

#### Scenario: A dataSource-bound field's resolved options come from its handler
- **WHEN** a view field's `FieldDef` declares `dataSource` referencing a
  `"static"` data source with configured options
- **THEN** the resolved field's `options` equals the result of that data
  source's `resolve` call

#### Scenario: A list field hands its whole array as heldValues
- **WHEN** a `list` field bound to a data source holds three values
- **THEN** the handler's `heldValues` carries all three, while a `string`
  field holding one value carries that one alone

#### Scenario: Two fields sharing one data source each resolve it independently
- **WHEN** two view fields on the same step both declare the same
  `dataSource`, whether or not they hold the same values
- **THEN** the handler's `resolve` is invoked once per field, and each
  field's resolved `options` reflects its own call's result

#### Scenario: A field with neither options nor dataSource has no resolved options
- **WHEN** a view field's `FieldDef` declares neither `options` nor
  `dataSource`
- **THEN** the resolved field's `options` is `undefined`

#### Scenario: A retired value the instance holds stays submittable
- **WHEN** an instance holds a value that its data source no longer offers,
  and the participant submits the step without changing that field
- **THEN** the resolved options carry that value, and submission validation
  accepts it

<!-- Scenario bullets stay verbatim: the OpenSpec archive step matches this block by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A submission resolves against the committed data
- **WHEN** a participant submits a step filling field G, and a data source
  compares against G
- **THEN** the resolution reads the value G held when the step was entered,
  not the submitted value

<!-- Scenario bullets stay verbatim: shortening the WHEN would drop its second precondition. -->
<!-- antislop: allow sentence-length -->
#### Scenario: The rendered list and the validated list agree
- **WHEN** a participant submits a value picked from the list the step's view
  read offered, and no other instance changed in between
- **THEN** submission validation resolves the same list, and accepts that
  value
