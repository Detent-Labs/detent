Groups run in order, and each one leaves `bun run typecheck` and `bun test`
green before the next starts. The `typecheck` run spans `packages/*`. So a
group that widens `fieldFormat` also repairs every table the widened enum
breaks. That is why task 1.2 sits where it does rather than in group 6.

Tasks 1.2, 6.2 and 6.3 touch `packages/web`. CLAUDE.md's Conventions need the
design skills before anyone reshapes a screen. Run
`/frontend-design:frontend-design` for visual direction, before the first of
those tasks starts. Add the installed Vercel skills: `web-design-guidelines`,
`vercel-react-best-practices` and `vercel-composition-patterns`. Here the work
is copy and a disabled state, so the pass is cheap. This preamble names it
anyway, because the convention holds whatever the size.
## 1. The schema: person joins format, and formatMatches learns to fork on type

- [x] 1.1 Add `person` to `fieldFormat` in `src/schema/definition.ts`, and to
      `ALLOWED_BY_TYPE`'s `string` and `list` rows (design.md Decision 1);
      verify a `{type: "list", format: "person"}` field parses and a
      `{type: "boolean", format: "person"}` field is rejected by
      `checkFieldFormatControl`.
- [x] 1.2 Add the `person` entry to the two exhaustive `Record<FieldFormat,
      …>` tables in `packages/web` that task 1.1 turns into TS2741 compile
      errors: `FIELD_FORMAT_LABELS`
      (`areas/studio/draft/field-type-labels.ts:30`), with its own name and
      note, and `FORMAT_SAMPLE` (`areas/studio/draft/field-preview.ts:20-24`),
      with a `user_`-prefixed sample id. Update the two `allowedForType`
      assertions in `packages/web/test/studio-fieldCatalogLogic.test.ts:58-64`
      that pin the table's literal contents: `string` gains `person` in
      `formats`, and `list` becomes `{ formats: ["person"], controls:
      ["checkboxes"] }`. The `droppedByTypeChange` block below them needs no
      change. No other exhaustive `Record<FieldFormat, …>` TYPE exists in the
      repository: `NATIVE_INPUT_TYPE` (`form-ui`) is `Record<string, …>`,
      `LiteralControlKind` is a string-literal union, `celType` switches on
      `type`, and `offeredKeys` is keyed by `BaseFieldType`. Those two table
      entries, the two assertions above, and task 1.3's `switch` arm are the
      whole set the enum widening breaks; verify by running `bun run
      typecheck` at the end of this group and reporting it clean. The
      behavioral half of both files stays in group 6.
- [x] 1.3 Widen `formatMatches` to take the field rather than the format
      alone, typed `Pick<FieldDef, "type"> & { format: FieldFormat }` so the
      `switch` stays exhaustive under `strict`, and add its `person` branch
      checking a `user_`/`group_` prefix on a scalar value for
      `type: "string"` and on every array element for `type: "list"`
      (Decision 2); update both call sites, `typeMatches`
      (`definition.ts:487`) and `checkFieldFormatControl`'s literal-`default`
      arm (`compile.ts:601`); rewrite the 16 `formatMatches(<format>, …)`
      assertions in `test/field-format-control.test.ts:92-155` onto the
      field-taking signature. Do NOT reuse that file's `fld` helper (`:32`):
      it returns `FieldDef`, whose `format` is optional, so passing one draws
      TS2345 against the required-format parameter. Add the one-line `ff`
      helper Decision 2 spells out beside it, and extend the file's import
      from `../src/schema/definition.js` with `type BaseFieldType` and
      `type FieldFormat` (it imports the Zod schemas today, not the types).
      Update `formatMatches`'s own doc comment (`definition.ts:446-452`),
      which describes the two-argument contract. Verify one test per branch:
      valid single id, valid list of ids, wrong prefix, one bad element in a
      list.
- [x] 1.4 Confirm, by reading `checkFieldFormatControl` (`compile.ts:591-607`)
      after task 1.3's call-site edit, that a `person`-formatted literal
      `default` is already rejected for both `string` and `list` fields with
      no further code: `isLiteralDefault` (`compile.ts:926`) returns `true`
      for an array, so the `list` arm reaches the same widened
      `formatMatches` call the `string` arm does. Record that confirmation
      here rather than adding a redundant branch, the same form as 4.2, 6.4
      and 6.5. Land the two rejecting tests the delta spec names: a `{type:
      "string", format: "person"}` field with `default: "role_finance"`, and a
      `{type: "list", format: "person"}` field with `default: ["user_a",
      "not-a-principal-id"]`.

## 2. The org.actor-from-field assignment strategy

- [x] 2.1 Add `ACTOR_FROM_FIELD_STRATEGY_TYPE`, `actorFromFieldConfigSchema`
      and `actorFromFieldStrategyDef` to `src/engine/assignment-strategies.ts`,
      registered in `createDefaultAssignmentRegistry` (Decision 3); update
      that function's own doc comment (`assignment-strategies.ts:84-86`),
      which enumerates the shipped set as "the built-in `static` entry plus
      `org.manager-of-starter` and `org.group-members`"; update the two tests
      that pin the shipped registry's exact key list,
      `test/assignment-manager-strategy.test.ts:129-132` and
      `test/http-studio.test.ts:691`, to the four-entry array `["static",
      "org.manager-of-starter", "org.group-members", "org.actor-from-field"]`,
      matching the order `createDefaultAssignmentRegistry` sets them in, and
      carry the same count into the first test's name (`:130`) and the
      second's "All three entries" comment (`:688-690`). The config-schema
      test at `:694-710` asserts per key, not on the whole object, so it needs
      no edit. Verify a config carrying an extra key or missing `fieldId`
      fails the registry's config-validation check.
- [x] 2.2 Implement `resolve`: read `ctx.instance.data[fieldId]`, resolve a
      `group_`-prefixed value through `getGroupMembers` and a `user_`-prefixed
      value as its own one-entry list, and resolve to `[]` for anything else
      (unset, non-string, or an unrecognized prefix); verify one test per
      case, including a disabled group member being excluded and a missing
      field resolving to no candidates with nothing thrown. Tests land in a
      new `test/assignment-actor-from-field-strategy.test.ts`, beside its
      `assignment-group-strategy.test.ts` sibling.

## 3. The publish-time reference check

- [x] 3.1 Add `checkActorFromFieldReference` to `src/schema/compile.ts`,
      modeled on `checkGroupReference` (Decision 4), resolving
      `config.fieldId` against `collectFieldsDeep` and rejecting a step whose
      named field is missing or does not declare `format: "person"`; call it
      from `structuralIssues` beside `checkGroupReference` (`:1104`); give the
      new function a numbered header comment in the same series as its
      neighbours (`:237-887` run "2." through "8.", with two entries already
      numbered "6."), and fix the "nine structural checks" count in both
      comments that carry it (`:22` and `:1114`) — `structuralIssues` already
      returns ten, so this change makes it eleven, not ten; verify a
      rejecting test for a missing field and one for a field
      with no person format, plus a passing test for a correctly-formatted
      reference, in `test/compile-validation.test.ts`. Add the matching bullet
      to `.claude/rules/authoring-invariants.md`, beside the
      `checkGroupReference` one it mirrors, so the rules file lists the check
      an agent touching `src/schema` must not bypass.

## 4. The people list's first layer

- [x] 4.0 Add `displayNamesForUserIds(userIds, db)` to `src/auth/users.ts`,
      one batched query applying the module's existing private
      `resolveDisplayName`, not filtering `disabled`, mirroring
      `emailsForUserIds`'s shape (`:394-399`, which does filter it); and
      `groupNamesForIds(groupIds, db)` to `src/auth/groups.ts`, mirroring
      `getGroupScopes`'s shape (`:141-145`) (Decision 5);
      verify a test each: a `NULL` `display_name` falling back to the email,
      a disabled account still returning its name, and an unknown id absent
      from the returned map. The user helper's tests land in
      `test/auth-users.test.ts`; the group helper has no `auth-groups`
      suite, so its tests land in task 2.2's new strategy file, which already
      seeds groups.
- [x] 4.1 Add the `allowedGroups`-sourced options branch to `resolveFields`
      in `src/runtime/api.ts`, gated on `field.format === "person"` and
      neither `options` nor `dataSource` declared (Decision 5); resolve one
      `FieldOption` per `allowedGroups` entry labelled with the group's own
      `name`, plus one per member account from `getGroupMembers`
      deduplicated across groups, plus one per held value
      (`heldValuesOf(value)`) the first two layers did not already produce;
      emit those three layers in that order — groups in `allowedGroups`'s
      declared order, then members in each group's order with first
      occurrence winning the dedup, then held values — since `FieldOption[]`
      is what the renderer draws in array order; key every `label` by
      `body.baseLocale`, falling back to the id itself where no name
      resolves; verify a test asserting the resolved options for a declared
      group (both the group entry and the member entries, and the group entry
      first), a test asserting an empty array when the body declares no
      `allowedGroups`, and a test asserting a held value survives its
      account leaving the group. Tests land in
      `test/data-source-resolution.test.ts`. The helper `resolveFields` is not
      exported, so each test drives it through `getInstanceView`. That is how
      the file's existing `dataSource` cases reach it. The same route covers
      the `runtime-api` delta's own bare-person view scenario.
- [x] 4.2 Verify, by reading `resolveFields`, that a `person`-formatted field
      declaring `dataSource` still resolves through the existing `dataSource`
      branch unchanged, and that this needs no code change; record the
      confirmation here rather than adding a redundant branch.
- [x] 4.3 Verify D11's no-name-snapshot rule with a submission test: submit a
      resolved person option through `submitAndTransition` and assert
      `instance.data[fieldId]` is exactly the bare id string, never an object
      carrying a name beside it.
- [x] 4.4 Verify the membership bound the resolved options now place on a
      bare person field: a test asserting a `group_` value from
      `allowedGroups` submits, and a test asserting a `user_` id outside the
      expansion draws `invalid-option`. Add the creation-side pair the
      `runtime-api` delta states: a literal person `default` outside the
      expansion, on a field the initial step's view SHOWS, fails
      `createProcessInstance` with an `invalid-option` issue; the same
      default on a field that view does NOT show creates successfully,
      because the off-view arm (`api.ts:885`) reads the catalog entry's own
      absent `options` (design.md Decision 8).
- [x] 4.5 Verify the other half of that bound, the case where no bound
      applies: a test on a body declaring no `allowedGroups`, submitting
      `"user_a"` for a bare person field whose resolved `options` is empty,
      asserting the submission passes with no `invalid-option` issue and the
      `format` shape check as the only rule the value faces
      (`data-source-resolution` delta, "An empty resolved list places no
      membership bound"). D15's fail-closed rule governs the picker, which
      offers nothing; step 2 of the validation order runs only on a non-empty
      resolved list, so it places no bound here. The test lands in
      `test/data-source-resolution.test.ts`, the file task 4.1 names.

## 5. The worked example, then the docs

- [x] 5.0 Add one `examples/` body declaring `allowedGroups`, a `{type:
      "string", format: "person"}` field, a `{type: "list", format:
      "person"}` field, and a step assigning through `{ "type":
      "org.actor-from-field", "config": { "fieldId": … } }`; verify it
      compiles by adding it to `test/compile-validation.test.ts`'s
      `EXAMPLE_FILES` list (`:974-980`), which the "publishes each example
      definition unchanged" case walks. That case compiles the body; it never
      publishes one, so task 5.3 below covers the publish half.
      This body is what task 5.1's guide teaches against and what task 7.5
      opens: no existing example declares `allowedGroups`, so without it the
      browser check has nothing to open. Give the body a second step assigning through `{ "type":
      "org.group-members", "config": { "groupId": … } }`, naming the same
      `allowedGroups` entry the person field's picker draws on. That is the
      `definition-contract` delta's "One list serves the picker and the
      assignment allowlist" scenario, made concrete in the body task 5.1
      teaches against.
- [x] 5.1 Add the `person` format and the `org.actor-from-field` strategy to
      `docs/authoring-guide.md`, including D11's no-name-snapshot rule and
      D23's two-layer people list, pointing at task 5.0's body; verify the
      guide names no format the contract does not carry.
- [x] 5.2 Update `docs/current-state.md` and `docs/decisions.md` for the new
      format, the new strategy and the new publish-time check. In
      `decisions.md` the passage that goes stale is the "An assignment
      strategy whose resolution leaves the database" entry (`:809-813`),
      which reads "Three strategies now ship" and names them; this makes
      four, and the entry's own point — that none leaves the engine's
      Postgres — still holds for the fourth. Verify each passage naming a
      field-model or assignment-strategy symbol still matches the code.
- [x] 5.3 Make task 5.0's body publishable. `validateGroupScope`
      (`src/engine/definitions.ts:187`) resolves every `allowedGroups` entry
      against the `groups` store, and `createGroup` mints a
      `group_<uuid>`, so no supported path creates the literal id the body
      names. Seed that id in `scripts/seed.ts`, the script `dev-up.sh`
      already runs: insert the row directly, idempotently, with a global
      scope and the demo accounts as members, and comment the bypass, since
      `createGroup`'s minted id stays a guarantee rather than a default.
      Widen neither `createGroup` nor the admin route. Add the example to
      the script's `EXAMPLES` list, after the group, and add the publish
      case task 5.0 could not: `test/group-scope-validation.test.ts` already
      has the DB harness.

## 6. The studio

- [x] 6.1 Confirm, by reading `allowedForType`
      (`fieldCatalogLogic.ts:39-42`) and its render site
      (`FieldCatalogPanel.tsx:88-105`), that the format picker's option list
      comes from `ALLOWED_BY_TYPE` directly and its labels from task 1.2's
      `FIELD_FORMAT_LABELS` entry, so those two tasks ARE the picker change
      and no code is needed here; confirm the same for `FIELD_TYPE_LABELS`,
      which is keyed by `BaseFieldType` and untouched by a new format. Note
      that `allowed.formats.length > 0` gates the picker, so a `list` field
      renders a format picker here for the first time. Record both
      confirmations here, the same form as 6.4 and 6.5; verify a `list`
      field's format picker offers `person` alone.
- [x] 6.2 Add the Default value zone's carve-out for a bare person field (no
      option list, CEL toggle still works) in `literalControlKind`
      (`panels/shared/defaultValueLogic.ts:43`) (Decision 8), returning
      `"none"` for both arms — the `list` arm is the one that changes
      behavior, since it returns `"options-multi"` for any `dataSource`-less
      `list` today, and the `string` arm falls through to a plain text input;
      add `defaultValue.personNoOptions` to
      `packages/web/src/i18n/catalogs/studio.ts` beside
      `defaultValue.dataSourceNoOptions`, and render it IN PLACE OF that
      string at `panels/shared/DefaultValueEditor.tsx:131` for a bare person
      field, never both notes at once, per the `studio-app` delta's "not a
      data source" rule; the component already holds the whole `field` prop
      (`DefaultValueEditor.tsx:19`), so `field.format === "person" &&
      field.dataSource === undefined` is the discriminator; verify a logic
      test in `packages/web/test/studio-defaultValueLogic.test.ts` covering
      the carve-out for both `{type: "string", format: "person"}` and
      `{type: "list", format: "person"}`.
- [x] 6.3 Add the preview's behavioral half in `field-preview.ts`
      (Decision 8): a fork in `sampleValue` (`:35`) on the field's own type —
      task 1.2's `FORMAT_SAMPLE` sample wrapped in an array for
      `type: "list"`, the scalar otherwise, since `sampleValue` returns
      `FORMAT_SAMPLE[format]` before its type switch. Widen the note row's
      gate at `panels/FieldCatalogPanel.tsx:675` from
      `field.dataSource !== undefined` to cover a bare person field, and add
      `fieldCatalog.previewPersonResolvesAtRuntime` to
      `packages/web/src/i18n/catalogs/studio.ts` beside
      `fieldCatalog.previewResolvesAtRuntime`, which names a data source the
      field does not declare. The widened gate SHOWS ONE of the two strings,
      picked on `field.dataSource !== undefined`, never both; verify, in
      `packages/web/test/studio-fieldPreview.test.ts`, a preview test for
      `{type: "list", format: "person"}` asserting an array sample, and one
      for the `{type: "string"}` twin asserting a scalar.
- [x] 6.4 Confirm, by reading `fieldValidationLogic.ts`'s `offeredKeys`, that
      `person` needs no new offered key and no code change (Decision 7);
      record the confirmation here.
- [x] 6.5 Confirm, by reading `packages/form-ui`'s `FieldForm.tsx` widget
      switch, that a person field with resolved options already renders
      through the existing options-based picker with no code change
      (Decision 6); record the confirmation here.
- [x] 6.6 Confirm, by reading `PALETTE_FIELD_KINDS` and
      `baseTypeForPaletteKind` (`draft/mintField.ts:9-30`), that the form
      editor's palette gains no `person` entry in this change, even though
      `date` there is the standing precedent for a palette kind that mints a
      `format` (Decision 8); record the confirmation and its reason here, so
      a later reader does not read the omission as an oversight.

## 7. Verification

- [x] 7.1 Run `bun run typecheck` and report what it printed.
- [x] 7.2 Run `bun run build` and report what it printed.
- [x] 7.3 Run the FULL `bun test` with `DATABASE_URL` set, never a
      single-file rerun, and pipe it through `scripts/gates/silent-green.sh`;
      report the pass count and the skip count.
- [x] 7.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh`
      and `sh scripts/gates/whitespace.sh < /dev/null`; report both verdicts.
- [x] 7.5 Check a single-person field, a multi-person field, a bare
      `allowedGroups`-sourced picker and a `dataSource`-bound person field in
      a real browser, since a green suite sees no rendered widget. Set up:
      run `bun run seed`, which writes task 5.3's group and publishes task
      5.0's example, then open that example in the studio. The field
      catalog's preview and the Default value zone show the two carve-outs;
      the Player is where the live picker renders, since a test instance is
      a real instance of the current draft body (`draft-test-instances`), so
      it resolves the same options a participant gets. Record what stays
      manual in `docs/browser-checks.md`.
