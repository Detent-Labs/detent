# Design

## Context

Two builders write a comparison. The `instance.query` form (`InstanceQueryForm.tsx`) and the report builder (`ReportBuilderScreen.tsx`) each bind the value input to a string. The engine compares `jsonb` by type, so `"5"` never equals `5`. See proposal.md.

Three facts shape the approach:

- The studio form already fetches every published version body of the target through `useTargetProcessCatalog`. Each field there carries its `type`. The form can use the routes it already calls.
- The report builder reads its fields from `POST /reporting/reports/columns`. `ColumnChoice` is `{ fieldId, versions }` and has no type.
- Publish checks every `instance.query` reference in `validateInstanceQueryReferences`. That function already rejects a non-scalar compared field. It already reads the bodies of the target versions that hold live instances.

`packages/web` forbids an import from one area into another (`boundaries.test.ts`). Code that two areas share lives in `shell/`.

## Goals / Non-Goals

**Goals:**

- An author picks a number, a Yes/No choice or text. No author types a quote mark or JSON.
- A hand-written body meets the same gate as the form.
- Typing never loses focus, text or a row.

**Non-Goals:**

- No coercion in `compileDataComparison`. No literal check on a report save or preview. The owner ruled both on 2026-10-11.
- No migration of saved reports. A report that holds a string literal on a number field keeps it until the owner retypes the value.
- No change to `src/schema/definition.ts`, the `instance.query` config schema or `definitionHash`.
- No format check on the column keys of attribute rows. Publish keeps reporting them through the registry check.
- The report builder's field select still shows raw field ids. The change `fix-reporting-builder-ui` owns that.

## Decisions

### 1. One pure parse module in `shell/`

`packages/web/src/shell/literalValue.ts` holds six functions. Both areas import it. It uses no DOM, so a plain `bun:test` file covers it.

- `literalType(fieldType)` returns `"number"`, `"boolean"` or `"string"`. Every other declared type, and an absent type, returns `"string"`. A plugin-typed field accepts any literal at publish, and a string is the only literal the old form wrote. Nothing regresses.
- `parseLiteral` returns the parsed value. A failed parse returns a reason. The reason is `empty`, `not-number` or `not-boolean`. A string parses unless it is empty. A string keeps its spaces.
- `parseLiteralList` splits on commas, trims each member and skips an empty one. It succeeds when at least one member remains and every member parses.
- `literalText(value)` returns the text for a stored value. A list joins with a comma and a space.
- `valueTypeOf(value)` returns the value type of a stored value. A row uses it when the field type is unknown.
- `sameLiteral(a, b)` compares two stored values. The reseed guard of decision 2 uses it.

The number grammar is `^-?\d+(\.\d+)?$` with a finite result. It rejects an exponent, a hex digit and a thousands separator. The same text then means the same number in both locales. A number past 2^53 loses precision. That ceiling carries a `ponytail:` comment.

Rejected: `<input type="number">`. A browser localizes its decimal separator and hides invalid text, so the row cannot show or explain `abc`. Rejected: `JSON.parse` of the text. It asks the author to type JSON, which the no-code goal removes.

### 2. A row keeps its text, and the parent keeps the parsed value

A row component holds `text` and the last `value` prop it saw in state. Each keystroke parses the text and calls `onChange` with the parsed value, or with `undefined` when the text is incomplete. While it draws, the row compares the `value` prop with the remembered one. If they differ, the row remembers the new prop. If the parsed text also differs from the prop, the row adopts `literalText(value)`.

That rule covers a raw JSON change, a removed sibling row and a cleared value after a field change. It cannot loop, because the memory updates before the next draw. Take a stored value of the wrong type, such as `"5"` on a number field. The row adopts its text once, then stays quiet. A guard that compared the parsed text with the prop on every draw would loop there.

Comparison rows in both areas carry stable row ids. The form mints an id on add and drops it on remove. Without it, removing row 0 hands its text to row 1.

Today's code binds the input to `JSON.stringify(value)`. That binding makes the next comma nest the list in F-5. Rejected: lift the text state into the screen. It adds a second structure keyed by row, and that structure needs row ids too.

### 3. The studio form reads the type from the catalog

`TargetRef` gains `type?: string`. `fieldsToRefs` copies `type` when it is a string. A plugin envelope is an object, so it yields no type. The hook sorts the versions in ascending order before it merges. The newest declaration then overwrites older ones.

The hook returns `{ catalog, error }`. When the fetch ends in an error, `catalog` stays `undefined` and `error` is true. The form then shows one error row. It shows a stale mark only when `catalog` exists. This also removes a false mark that the audit missed. While the catalog loads, `knownFieldIds` is empty, so every reference reads as stale.

Row rules:

- The literal control refuses input while `catalog` is `undefined` or the row has no field.
- The operator `in` shows the list input and hides the own-field option. Switching the operator drops `value` and `valueFromField`.
- A new compared field keeps the value when `literalType` is the same before and after. Otherwise it clears the value.
- The row looks up its field in `catalog.fields`. A missing field means an unknown type. A found field with no `type` is plugin-typed and takes text.
- The own-field right side stays as it is. The publish check `checkInstanceQueryValueFromField` already limits it to a scalar field.

### 4. Attribute rows carry a row id

`attributeRows.ts` is a pure module beside the form. A row is `{ rowId, key, fieldId }`, and `nextRowId` from `migrationPlanLogic.ts` mints the id. `recordFromRows` keeps rows with a non-empty key, and the first row wins a duplicate. `duplicateRowIds` names the later rows that share a key.

The form commits `recordFromRows(rows)` only when the record changes. Rows with an empty or duplicate key stay local, so they survive until the author fixes them. When `recordFromRows(rows)` differs from `config.attributes`, the form reseeds its rows. A raw JSON change then reaches the rows. So does a switch to another data source, because the editor reuses the form instance. The reseed drops local-only rows, and that is acceptable.

Rejected: key the rows by index. It stops the focus loss but cannot mark a duplicate. A JavaScript record cannot hold a duplicate key either, so the duplicate row has to stay local.

### 5. The report builder drops an incomplete row at the edge

`draftToInput` filters out a comparison whose `value` is `undefined`. Preview, save and the column request all call it, so one filter covers the three. `draftFromReport` loads saved comparisons as they are. A new row starts with `value: undefined`.

`ComparisonRow` reads `type` from its `ColumnChoice` and picks the control from `literalType`. The screen keeps state, `{ processId, types }`, with the last type any response named for each field. A comparison can empty the range and drop its own field from the next response. The state keeps the type, so the row stays editable. A loaded report seeds the state with the value types of its comparisons, and a response overwrites a seed. A field never seen follows the type of its current value.

The first request for a process fires at once. Later requests wait on a key made of `JSON.stringify` of the process id and the complete query. An incomplete row leaves the key unchanged, so it sends no request. A valid number changes the key on each keystroke, and the 300 ms wait collapses those requests.

The debounce is a pure `createDebouncer` function with an injected timer, plus a thin hook. A test drives it with a fake timer.

### 6. The column choice carries the type of its newest declaring version

`resolveVersionCoverage` returns, for each version, a `Map` from field id to declared base type. `executeReport` only calls `.has` on it, so it keeps working. `resolveReportColumnChoices` reads the type from the highest version that declares the field. A plugin envelope yields no `type` key.

Rejected: a `types` array over all versions. The builder has no use for it. The web `ColumnChoice` gains `type?: string`.

### 7. The publish check

In `validateInstanceQueryReferences`, the reference for a compared field gains its literals. The literals are the entry's `value`, or each member of an `in` list. A `null` and a `valueFromField` entry add none.

Placement follows the first criterion of `definition-contract`: a hand-written body must not bypass the check. The check sits on the publish path beside the seven database-resolving checks. It is not in `definition.ts` or `compile.ts`, because it reads the target's live versions from the database.

After the non-scalar rejection, the check tests each literal with `typeMatches` against the field in every carrying version. If no version admits a literal, the check throws `CrossProcessValidationError`. The message names the data source id, the location and the compared field. It also gives the literal as JSON and the declared types it found. A field that no live version carries still yields the reference finding alone.

`typeMatches` is the one definition of a value a field can hold. A participant's submission and the outbox writeback both use it. A literal that fails the field's format also fails, for example `"foo"` on an `email` field. Such a literal can never equal a stored value.

The check needs a database to read the live versions, so it cannot sit in `compile.ts`. The publish route is the only write path, so a hand-written body cannot bypass it.

### 8. Visible design: the impeccable shape result

Mode: Operate. The author scans rows, and the row is the unit. The design language already holds every part, so this change does not add a token, a component or motion.

- A string field shows the existing mono text input. A number field shows the same input with `inputMode="decimal"`. A boolean field shows a select with an empty choice, Yes and No. The studio reuses `condition.yes`, `condition.no` and `condition.selectValue`.
- The operator `in` shows the same text input. A hint line names the comma. The reporting hint key exists. The studio adds `instanceQuery.listHint`.
- An incomplete row takes a dashed bottom border. The design language reads a dashed border as "not there yet". An empty input shows only that border.
- Text that does not parse adds a warning callout beside the input: the 3px advisory rule and refusal ink. The input carries `aria-invalid` and `aria-describedby`.
- A duplicate attribute key uses the same callout. An unreadable catalog uses one callout under the process picker.
- Rows wrap at narrow widths. German strings run up to 40% longer, so no control derives its width from the English label.
- Implementers load the installed Vercel design skills, use semantic HTML and check the `impeccable` hook before the first UI code change.
- Anti-goals: no chips for the list, no number spinner, no toast.

## Risks / Trade-offs

- [A saved report holds a string literal on a number field] → The builder shows the text. The owner retypes it. No deployment exists, so the change owes no migration.
- [A field has different types across versions] → The builder follows the newest version. Publish accepts a literal that one live version admits.
- [The number grammar rejects `1e3`] → The author types `1000`. The raw JSON view of the studio form stays open for the rest.
- [The publish check reads live versions only] → A target with no live instance goes unchecked. The reference check above it has the same limit.
- [A render-time reseed can loop] → The guard compares parsed values, and React bails out of an equal state.
- [The published `type` key is new on `/reporting/reports/columns`] → The key is additive and optional. An older script ignores it.

## Migration Plan

No stored data changes. No deployment exists. Rollback is a revert of the merge commit.

The check runs after the hash-hit return in `publishBody`. An identical re-publish of an earlier body stays a no-op, even when that body holds a mistyped literal.

## Open Questions

None.
