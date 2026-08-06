<!-- antislop: allow-file all -->
<!-- This delta copies runtime-api's existing normative SHALL/WHEN/THEN
     text nearly verbatim (see the same precedent and rationale in
     openspec/specs/studio-player/spec.md's own header) and only adds the
     columns/span sentences. Rewriting the copied technical clauses into
     strict active voice risks drifting their precise, already-reviewed
     meaning; the requirement title also must match the existing spec's
     title exactly for archive merge, so it stays as-is. -->

## MODIFIED Requirements
### Requirement: Resolve a display-ready view of an instance

`getInstanceView(instanceId, actor, registry, db?)` SHALL return an
`InstanceView` describing the instance's current step, its resolved
fields, and its currently available manual paths, for an instance in
any status. This read uses the ordinary (unlocked) rehydrate path. A
view is read-only, so there is no concurrent writeback for it to race.
`getInstanceView` SHALL take a required `registry: DataSourceRegistry`
parameter, threaded into the `resolveFields` call that resolves the
current step's view.

`getInstanceView` SHALL authorize `actor` against the loaded instance
before returning anything, per the `authorization` capability's
relationship rule (`ADMIN_ROLE`, or `startedBy`, or current claimant,
or eligible candidate on the current step), throwing
`AuthorizationError` otherwise. `actor` is therefore load-bearing
twice: as the authorization subject, and as the CEL guard context
`resolveFields`/`resolveAvailablePaths` evaluate against. For a caller
without `ADMIN_ROLE`, a failure to load the instance SHALL surface as
that same `AuthorizationError`, so an unrelated caller cannot
distinguish a nonexistent instance from one they may not read. A
caller holding `ADMIN_ROLE` SHALL see the ordinary not-found failure.

`fields` SHALL contain exactly the current step's `ViewField`s whose
resolved `visible` (literal `boolean`, used as-is, or CEL, evaluated
with total semantics, default `true`) is `true` against
`buildGuardContext(body, instance, actor)`. Each entry carries its
resolved `required`, `readonly`, `span`, and `options` (per the
`data-source-resolution` capability: populated from static
`FieldDef.options` unchanged, or resolved at runtime for a
`dataSource`-bound field). A field resolving invisible SHALL be
omitted entirely, not included with a flag. `span` SHALL be the
matching `ViewField.span`, or `1` when the view declares none.

`InstanceView` SHALL also carry `columns`: the current step's
`view.columns`, or `1` when the view declares none. `columns` reports
regardless of `status`, the same way `step` itself does, since it
describes the step's declared layout rather than instance state.

A `ViewField` whose `ref` resolves to a `FieldDef` of `type: "group"`
(a container, never a leaf value in `instance.data`) SHALL still
appear in `fields` when visible, so a caller can render its
label/grouping, but its `value` SHALL always be `undefined` and its
resolved `required` and `readonly` SHALL always be reported as `false`
regardless of the view's own declaration. It is never part of the
visible-and-required set the required check enforces, nor of the
visible-and-editable set `submitAndTransition` accepts.

`availablePaths` SHALL contain exactly the manual paths on the current
step whose guard currently holds against `buildGuardContext(body,
instance, actor)`. Paths that don't match are omitted, not flagged. A
guardless manual path is always included (`evalGuard` treats no guard
as satisfied). `availablePaths` SHALL be empty when the instance is
not `running`, when the current step has no manual paths, or when
every manual path's guard is false. `status` is always present, so a
caller can distinguish these cases.

#### Scenario: An unrelated actor is refused before any field resolves

- **WHEN** an authenticated actor with no relationship to the instance
  and no `ADMIN_ROLE` calls `getInstanceView`
- **THEN** it throws `AuthorizationError`, and no data source is
  resolved and no field value is read out

#### Scenario: A related actor reads the view unchanged

- **WHEN** the caller is the instance's starter, its current claimant,
  an eligible candidate on the current step, or holds `ADMIN_ROLE`
- **THEN** the view resolves exactly as it did before this requirement
  changed: same `fields`, same `availablePaths`

#### Scenario: An invisible field is omitted

- **WHEN** a step's view marks a field's `visible` expression false
  against the instance's current data
- **THEN** that field is absent from `fields`

#### Scenario: A group-container field never reports as required

- **WHEN** a step's view references a `FieldDef` of `type: "group"`
  and marks it `required: true`
- **THEN** the resolved field's `required` is `false` and its `value`
  is `undefined`, regardless of the view's declaration

#### Scenario: A guarded manual path that fails its guard is omitted

- **WHEN** a manual path's guard evaluates false against the instance's
  current data
- **THEN** that path is absent from `availablePaths`

#### Scenario: A guardless manual path is always available

- **WHEN** a manual path on the current step carries no guard
- **THEN** it is present in `availablePaths` regardless of instance data

#### Scenario: View on a non-running instance still resolves

- **WHEN** `getInstanceView` is called for a `completed` or `cancelled`
  instance by an actor with a relationship to it
- **THEN** it returns the instance's `status` and its terminal step's
  resolved `fields`, with `availablePaths` empty

#### Scenario: View on a subprocess wait-state has no available paths

- **WHEN** `getInstanceView` is called for a `running` instance parked on
  a `subprocess` step
- **THEN** `status` is `"running"` and `availablePaths` is empty, since a
  subprocess step's paths are schema-enforced to be automatic, never
  manual

#### Scenario: A dataSource-bound field's view carries its resolved options

- **WHEN** `getInstanceView` is called for an instance parked on a step
  whose visible fields include one bound to a `dataSource`
- **THEN** that field's resolved `options` reflects the data source's
  resolved result, not an empty or undefined list

#### Scenario: A field's span defaults to 1

- **WHEN** a step's view references a field whose `ViewField` declares
  no `span`
- **THEN** the resolved field's `span` is `1`

#### Scenario: A view's columns default to 1

- **WHEN** a step's view declares no `columns`
- **THEN** `InstanceView.columns` is `1`

#### Scenario: A declared span and column count both resolve

- **WHEN** a step's view declares `columns: 2` and a field's
  `ViewField` declares `span: 2`
- **THEN** `InstanceView.columns` is `2` and that field's resolved
  `span` is `2`
