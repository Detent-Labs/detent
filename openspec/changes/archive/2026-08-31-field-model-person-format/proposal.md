## Why

Every process that routes a step to a specific person does it in one of two
ways today. An author maintains a `static` assignment list by hand, or points
`org.group-members` at a fixed group. Neither lets a step route to whoever the
process itself names. The requester's chosen approver and a case's assigned
handler both stay out of reach. No field type holds a person, and no
assignment strategy reads one.

Change 1 built the `format` axis this needs, and it sits archived at
`openspec/changes/archive/2026-08-30-field-model-type-format-control/`. That
axis is a validated semantic layered on a `type`, with its own publish-time
check and its own studio picker. D20 in `docs/field-model-redesign.md`
(`:155`) named `person` as the format that change deliberately deferred. It
waited on the strategy and the people list it needs. This change ships both.
Decisions D10 through D15, D20, D22 and D23 in that same record settle every
question this proposal implements.

The file `docs/decisions.md` carries no D-numbered entry. It is the repo's
open-question ledger, and this change rewrites one of its passages rather than
citing it.

## What Changes

- `FieldDef.format` gains a fifth member, `person` (D10, D20). It is legal on
  `{type: "string"}` for one person and on `{type: "list"}` for several. The
  allowed-pairs table `ALLOWED_BY_TYPE` (`src/schema/definition.ts:421-427`)
  gains `person` in the `string` row's `formats`. The `list` row gains a
  non-empty `formats` entry for the first time.
- `formatMatches` (`src/schema/definition.ts:454-470`) gains a `person`
  branch. The value, or every element of an array value, must be a string
  starting with `user_` or `group_` (D12). Those are the two prefixes
  `src/auth/users.ts:66` and `src/auth/groups.ts:51` already mint. This is the
  first format `list` can carry. So the branch also settles how
  `formatMatches` handles an array value, which no existing format needed.
- The stored value carries no name snapshot (D11). A person field holds the
  bare id, exactly as `assignment.claimed`'s `{actorId}` payload already does.
  This constrains what the change adds rather than adding code of its own.
  Nothing today writes a name into `data`, and this change keeps it that way.
- **New assignment strategy** `org.actor-from-field`, config `{ fieldId:
  string }` (D13). It resolves `ctx.instance.data[fieldId]`. A
  `user_`-prefixed value passes through as the sole candidate. A
  `group_`-prefixed value expands through `getGroupMembers`, the same
  resolution `org.group-members` uses. No `AssignmentContext` change follows:
  the interface already carries `instance.data` and `db`
  (`src/engine/registry.ts:158-163`).
- A publish-time check lands beside `checkGroupReference`
  (`src/schema/compile.ts:472-491`), as its sibling. A step declaring
  `assignment.strategy.type === "org.actor-from-field"` must name a field that
  declares `format: "person"`, through `config.fieldId` (D14). An author
  pointing the strategy at any other field draws a publish rejection. That
  beats an empty candidate list discovered at runtime.
- The people list a person-field picker reads has two layers (D23). A field
  declaring neither `options` nor `dataSource` reads the body's own
  `allowedGroups`. That yields one option per declared group, labelled with
  the group's name, beside one per member account. The branch fails closed: no
  declared group means an empty list, not every account in the system. A field
  declaring a `dataSource` reads that source instead, through the path it
  already has (`src/runtime/api.ts:579-612`, the `data-source-resolution`
  capability). The `/admin/users` route stays behind `ADMIN_ROLE`, and this
  change does not widen it (D15).
- Those resolved options bind the submission, as they already do for every
  other field carrying options. The `optionValuesValid` check
  (`src/runtime/api.ts:914`) reads whatever `resolveFields` produced, so a
  person id the body never offered draws `invalid-option`. This is the
  submit-side half of the trust boundary the picker draws. It is why the group
  entries exist: the body must offer a `group_` value to make it submittable.
  A value the instance already holds stays submittable after its account
  leaves the group. That is the same treatment `data-source-resolution`
  already gives a retired data-source value.
- No renderer change follows. The renderer in `packages/form-ui` already draws
  any field carrying resolved `options` as a picker, whatever its type. Its
  own Requirement: Field rendering covers every `BaseFieldType`. Once
  `resolveFields` supplies a person field's candidates as `FieldOption[]`, the
  existing `<select>` and `<select multiple>` path renders it with no
  widget-switch change. Four studio-authored places still learn the fifth
  format, and the generic renderer path reaches none of them. They are the
  field catalog panel in `packages/web`, its format labels, its field preview
  and its Default value zone.

The design record's own boundaries put six things out of scope. Three are
formats that each wait for their own change: `richtext`, `image` and
`signature` (D20). The other three are a per-step `control` override (D8, S5),
item lists (change 4) and display elements in the `view` (change 3). Catalog
scope (S3) and hierarchical option sets (S4) wait too.

## Capabilities

### New Capabilities

- `actor-from-field-assignment`: the `org.actor-from-field` strategy itself,
  meaning its config schema, its resolver, and the user/group-prefix branch.
  It mirrors the existing `group-based-assignment` and
  `manager-of-starter-assignment` capabilities, which each hold one org-aware
  strategy.

### Modified Capabilities

- `definition-contract`: `fieldFormat` gains `person`; `ALLOWED_BY_TYPE` gains
  it on `string` and `list`; `formatMatches` gains the id-prefix value check
  and its array/scalar fork. The `allowedGroups` key gains a second reader,
  stated on the requirement that owns it. It is now the participant-facing
  people directory as well as the assignment-reference allowlist. A new
  publish-time requirement rejects an `org.actor-from-field` step whose named
  field does not declare `format: "person"`. That requirement is the sibling
  of the existing `org.group-members`/`allowedGroups` one.
- `data-source-resolution`: `resolveFields` gains the `allowedGroups`-sourced
  options branch for a person field declaring neither `options` nor
  `dataSource`. It sits alongside the existing `dataSource`-bound branch. The
  existing "neither options nor dataSource has no resolved options"
  requirement narrows to name this one exception. The existing
  submission-membership requirement names the person case it now also governs.
  No `form-ui` delta follows: form-ui already renders whatever `options` this
  capability resolves, for any type.
- `runtime-api`: two of its requirements spell out, in their own words, the
  set that fills `ResolvedViewField.options`. They name a static
  `FieldDef.options`, or a `dataSource`-bound field. Each cross-references
  `data-source-resolution` and enumerates beside the reference, so a third
  source leaves it incomplete. Both gain the person source: the
  `getInstanceView` `fields` paragraph, and step 2 of the submission
  validation order. The creation requirement's off-view seed rule needs no
  change and gets a scenario saying why. That rule reads the catalog entry's
  own static `options`, which a bare person field does not declare.
- `studio-app`: the format picker offers `person` where the allowed-pairs
  table admits it. The field catalog panel's labels and preview gain a fifth
  format. The Default value zone disables literal entry for a person field and
  states why. That is the same treatment it already gives a `file` or `group`
  field.
- `database-seed-script`: the script gains one demo group under a fixed id.
  The worked example names that id. The script gains that example in its
  publish list too. Nothing else creates a group under a chosen id, so the
  committed example body cannot otherwise publish.

## Impact

Engine and schema, one file at a time:

- `src/schema/definition.ts`: `fieldFormat`, `ALLOWED_BY_TYPE` and
  `formatMatches`.
- `src/schema/compile.ts`: `checkFieldTree`, plus a new
  `checkActorFromFieldReference` beside `checkGroupReference`.
- `src/engine/assignment-strategies.ts`: the new `org.actor-from-field` entry
  and `createDefaultAssignmentRegistry`.
- `src/runtime/api.ts`: `resolveFields`.
- `src/auth/users.ts`: a new `displayNamesForUserIds`.
- `src/auth/groups.ts`: a new `groupNamesForIds`.

Web, in `packages/web`:

- the field catalog panel (`areas/studio/panels/FieldCatalogPanel.tsx`).
- `field-type-labels.ts` and `field-preview.ts`.
- `panels/shared/defaultValueLogic.ts` and
  `panels/shared/DefaultValueEditor.tsx`.
- the area's i18n catalog (`src/i18n/catalogs/studio.ts`), which gains two new
  strings. Both existing carve-out notes name a data source by hand.

Two of those files change for the enum
rather than for the studio's own work. Both `FIELD_FORMAT_LABELS`
(`field-type-labels.ts:30`) and `FORMAT_SAMPLE` (`field-preview.ts:20-24`)
carry the type `Record<FieldFormat, …>`, so a fifth member is a compile error
until both list it. Both land in task group 1 beside the enum, not in group 6,
so no group leaves `bun run typecheck` red. No `packages/form-ui` change and
no `fieldValidationLogic.ts` change follow, per the two "no code needed"
findings above and in design.md.

The file `.claude/rules/authoring-invariants.md` gains one bullet for the new
publish-time check, beside the `checkGroupReference` bullet it mirrors. That
file is what an agent touching `src/schema` reads before proposing a change.

Definitions and docs: `docs/authoring-guide.md` gains the `person` format and
the `org.actor-from-field` strategy. Then `docs/current-state.md`,
`docs/decisions.md` and `docs/browser-checks.md` follow. One
`docs/decisions.md` passage goes stale: the "An assignment strategy whose
resolution leaves the database" entry. It names the three strategies that
ship, and this change makes four.

Tests land in the existing suite for each subsystem, one file per subsystem.
The enum, the allowed pair, the widened `formatMatches` and the
literal-default check go to `test/field-format-control.test.ts`. That file
already holds 16 positional `formatMatches` assertions at `:92-155` that the
widened signature rewrites. The strategy gets a new
`test/assignment-actor-from-field-strategy.test.ts`, beside its
`assignment-group-strategy.test.ts` and `assignment-manager-strategy.test.ts`
siblings.

The publish-time reference check goes to `test/compile-validation.test.ts`,
whose `EXAMPLE_FILES` list also gains the new example body. The
`displayNamesForUserIds` helper goes to `test/auth-users.test.ts`, and
`groupNamesForIds` to the new strategy's own file. No `auth-groups.test.ts`
exists, and the suite exercises the groups store today in
`assignment-group-strategy.test.ts` and `group-scope-validation.test.ts`.

Three more existing test files change, because this change widens two tables
they pin as literals. The two `allowedForType` assertions in
`packages/web/test/studio-fieldCatalogLogic.test.ts:58-64` gain `person` on
the `string` and `list` rows. The registry key list in
`test/assignment-manager-strategy.test.ts:129-132` and in
`test/http-studio.test.ts:691` gains the fourth entry. Each lands in the task
group that makes the widening, so no group leaves `bun test` red. The
`resolveFields` branch and the membership bound go to
`test/data-source-resolution.test.ts`. The two studio carve-outs go to
`packages/web/test/studio-defaultValueLogic.test.ts` and
`packages/web/test/studio-fieldPreview.test.ts`.

The `examples/` directory gains one body declaring `allowedGroups`, a person
field and an `org.actor-from-field` step. No existing example declares
`person` today, so no existing definition needs rewriting. This change is
additive to the enum, not a migration. The new body exists so the authoring
guide teaches against something real and the browser check has something to
open.

No hash movement reaches an existing body. A `format` member and an
assignment strategy an author has not yet used move nothing. No deployment
runs this engine, and no stored instance pins a body this change could strand.
