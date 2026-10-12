# Design

## Context

A participant opens an `expense` case at the step "capture". The optional
`amount` field holds 120 from a catalog `default`. The participant erases the
digits and presses Submit. Today the number input reports `undefined`.
`filterToEditable` keeps the key, and `JSON.stringify` drops it. The engine
merges the patch over `data`, and `amount` stays 120.

The same participant clears an optional `format: "date"` field instead. The
input reports `""`, and the engine answers `type-mismatch` ("expected date").
The submit stays stuck until a reload.

Owner ruling 2026-10-10: a cleared field means removed. The form sends `null`.
The engine removes the key. A required check counts `""` and `null` as
missing. This change carries that ruling through `form-ui`, the engine's
submit path and the two consumers of `FieldForm`. The proposal lists the
findings.

Constraints that shape the approach:

- `form-ui` runs no client-side validation and uses no React hook or state
  (`form-ui` spec). Both stay.
- The engine merges a submit patch with a shallow `body || patch` and writes
  the whole `data` object (`applyStepEntry`). A key absent from the merged
  `data` therefore disappears, with no SQL change.
- The instance audit trigger already logs a removed key as a `set` entry with
  a JSON null (`instance_audit_diff`, `instance-audit-log` spec).
- A `HistoryEntry` stores no data, so it stays as it is. The entry for the
  submit's transition is the history of the removal.
- Nothing here touches `src/schema/definition.ts`.

## Goals / Non-Goals

**Goals:**

- One empty value on the wire: `null`. `form-ui` produces it and the engine
  accepts it.
- A required field is missing when its value is `undefined`, `null` or `""`.
- A form with nothing to submit is read-only, and says why.
- The three small findings close in the package that owns them: the zoned
  `datetime`, the `$` pattern and the React peer.

**Non-Goals:**

- Client-side validation in `form-ui`.
- Clearing the targets of a `columnMapping` when a participant empties its
  picker. `applyColumnMapping` writes nothing for an unmatched pick.
- An empty `list` (`[]`) as a missing value. A participant entered it.
- The 42 `.replace("{` string sites in `packages/web/src` that FIELDS-19
  counts. Coordinator ruling: this change fixes the `form-ui` site alone.
- Reading `""` as a clear in the engine. A raw API client that sends `""` for
  a date still gets `type-mismatch`. The form sends `null`.

## Decisions

**1. `null` is the wire value, and `FieldForm.onChange` produces it.**
Every number input, text-like input and single select maps `""` to `null`. A `boolean`, a `list` and a radio group keep their
values. Producing `null` in `onChange` means the form state, the saved form
draft and the submission share one shape. The `instance-form-drafts` rule
"stores the input exactly as entered" still holds: the draft stores `null`.

*Alternative:* map at submit time. Rejected: the draft would hold `""` and the
submit would hold `null`. Two shapes need two readers.

*Alternative:* send a separate `clear: [ids]` list. Rejected: it adds a second
field to the submit body for what one value expresses.

**2. The engine removes a key whose submitted value is `null`.**
`validateSubmissionData` gets an option `allowClear`. Only
`submitAndTransition` sets it. For a `null` key it keeps the field-set check
(`unknown-field`, `readonly-field`). It skips the type, option, constraint and
rule checks. Its merged data drops the key before the rule, the required check
and the guard context read it.

`commitManualTransition` merges the patch through a helper,
`applyDataPatch(data, patch)`. The helper spreads the patch and deletes each
key whose patch value is `null`. It lives in `src/engine/transition.ts`.
The engine must not import the runtime layer. `fields.ts` imports it for its
own merged data. One definition of "null removes" then serves both.

*Alternative:* store `null` in `data`. Rejected by the owner's ruling. A stored
`null` would also read as a value in CEL.
*Alternative:* make `allowClear` the default. Rejected: a `null` in a creation
seed meets the type check today, and a silent drop would hide a client bug.

**3. The required check counts blank values.**
`validateSubmissionData` tests `v === undefined || v === null || v === ""` on
the merged data. A stored `""` from an older submit counts too. `0`, `false`
and `[]` stay values.

**4. `readonly` is a `FieldForm` prop plus one exported predicate.**
`FieldForm` combines `readonly` with the view field's own flag at the one
place each control reads `field.readonly`. `formIsReadonly(view)` in
`submit.ts` answers `availablePaths.length === 0 || status !== "running"`. The
task screen and the Player both call it, so the rule has one home. The tab
strip stays operable, because tabs navigate and have no value.

**5. The read-only note (shape result for the task screen).**

A participant who opens a completed case reads disabled controls as broken.
The screen needs a statement beside the dimmed inputs. One muted line sits
above the form, under the form-draft notice. It takes the `taskDraftNotice`
style (0.85em, muted text role).

It is a plain paragraph with no role. It exists on load and announces
nothing. It takes no stamp, no icon and no box. The design language gives a stamp to
state, and the case stamp above already names the step. Two sentences cover
two causes. Each has its own catalog key, so a translator sees whole sentences.

| Key | EN | DE |
|---|---|---|
| `task.readonlyNotRunning` | This case is not running. The form is read-only. | Dieser Vorgang läuft nicht mehr. Das Formular ist schreibgeschützt. |
| `task.readonlyNoPath` | No action is available on this step yet. The form is read-only. | Auf diesem Schritt ist noch keine Aktion möglich. Das Formular ist schreibgeschützt. |

German runs about 15% longer. The line wraps in the reading column, and
nothing sets a fixed width. The Player omits the note, because an author drives
the instance to test it. Assumption for the browser check: no human confirmed
this brief, and the owner may ask for a stamp instead.

**6. A draft restore tests the key, not the value.**
`TaskScreen.applyView` seeds `next.draft?.data[id] ?? f.value`. A `null` in the
draft falls through `??` to the committed value, so a cleared field comes
back. The seed tests `id in draft.data` instead.

**7. A zoned `datetime` converts for display only.**
`FieldForm` formats a value that ends in `Z` or `±HH:MM` through
`new Date(value)` into local `YYYY-MM-DDTHH:mm`. It adds `:ss` when the seconds
are non-zero. A zoneless or unparsable value passes unchanged. The stored value
stays as it is until the participant types in the field. Typing yields a
zoneless local string, which the engine admits (`DATETIME_FORMAT`).

ponytail: typing drops the original zone. The upgrade entry point is to carry
the offset back out of the conversion if a process needs it.

**8. `tabSwitchAnnouncement` fills both placeholders in one pass.**
One `replace(/\{(tab|count)\}/g, fn)` call takes a replacer function. A `$&` in
a label stays plain text, and a label that holds `{count}` gets no second
search.

**9. React peer `^19`.**
Nothing consumes `form-ui` with React 18, and `@types/react` is already 19.
`bun install` then resolves React 19 for the form-ui tests. A task checks which
React the built bundle carries and runs the form-ui tests under 19.
`THIRDPARTY.md` regenerates if the lock drops React 18.

## Risks / Trade-offs

- [A client sent `null` for a `file` or plugin-typed field and got it stored]
  → That value now removes the key. No shipped client sends it.
- [A `""` stored by an earlier submit now blocks a required field] → The
  participant types a value. The rule matches the owner's ruling.
- [React 19 changes a form-ui test] → The task runs the suite under 19 and
  fixes the test. The product stays as it is.
- [The read-only note wording has no human sign-off] → The browser check and
  `/impeccable critique` cover the production build. A one-line catalog change
  follows if the owner asks.

## Migration Plan

No data migration. A deployed instance keeps its stored `data`. The first
submit after the change applies the new rules. Rollback is a revert of the
commit. A key that a submit removed stays removed, and the audit log records
it.

## Open Questions

None.
