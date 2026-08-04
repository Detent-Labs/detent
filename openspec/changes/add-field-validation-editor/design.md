## Context

See proposal.md for motivation.

The constraints that shape the approach:

`FieldCatalogPanel.tsx` is 205 lines. Its `FieldRow` component already renders
`key`, `label`, `description`, `type`, a plugin-type envelope, `dataSource`,
`options` and nested `fields`. It recurses into a group field through itself.

The panel mutates through `onChange(patch)`, a shallow patch merged into the
draft field. The draft store carries revision-based optimistic concurrency and
saves through `PUT /drafts/:processId`. Nothing about that path changes here.

`packages/web/test/` holds three logic tests over extracted `…Logic.ts`
modules. That split exists because a panel component needs a DOM and a pure
module does not.

## Goals / Non-Goals

**Goals:**

- Put the whole `FieldValidation` object under an editor, with one place
  deciding which keys a given field type offers.
- Keep the type-to-key decision and the `pattern` checks testable without a
  DOM.
- Leave the field row readable. It already renders eight controls.

**Non-Goals:**

- Any change to `FieldValidation` itself, or to when the engine evaluates it.
- Replacing the CEL text input for `rule`. Stage 27b owns that.
- Checking `min` against `max`, or `minLength` against `maxLength`. The engine
  accepts an empty range. An author who writes one sees no submission pass. A
  browser rule the server does not share would make the two disagree.

## Decisions

### The editor is a collapsed section inside the field row

The row grows by one `<details>` element. Its label counts the keys the field
carries. It opens closed when the field has no validation and open when it has
one.

Alternatives. A separate panel beside the catalog loses on two counts. It needs
its own selection state. It also separates a field's constraints from its type,
and the type is what the key mapping reads. Always-expanded rows lose too, since
a catalog of twenty fields turns unreadable.

### One `…Logic.ts` module owns the mapping and the pattern checks

`fieldValidationLogic.ts` exports `offeredKeys(type)` and
`checkPattern(src, bound)`. Both are pure. `packages/web/test/` tests them
without a DOM, following `studio-migrationPlanLogic` and its two siblings.

I rejected inlining the mapping in the component. The mapping mirrors
`checkConstraints` in `src/runtime/api.ts`. A table that must track engine
behaviour deserves a test that fails when it drifts.

### The mapping is a table in the browser, not a read of the engine

`offeredKeys` is a literal table over `BaseFieldType`. It imports nothing from
`src/runtime/api.ts`.

The alternative exports the mapping from the engine, so one definition serves
both sides. I rejected it. `checkConstraints` branches on the submitted value's
JavaScript type at runtime, not on the declared type. The engine holds no
declared-type-to-constraint mapping to export. Inventing one in `src/` to serve
a browser panel would put a UI concern into the engine, which `CLAUDE.md`
forbids. The spec's table is the contract, and the test holds it to the
engine's behaviour.

### A key that does not suit the type renders in the same list, marked

`offeredKeys(type)` decides what the editor shows empty. Any key the field
already carries renders too, whatever the type. Some keys fall in the second
group but not the first. Each of those carries an inline note: the engine does
not evaluate it here.

I rejected hiding such a key, for the reason stage 27c recorded about a mapping
row no catalog declares. An author who cannot see a value cannot remove it. A
silent drop on the next save loses hand-authored content.

### Clearing a key removes it, and clearing the last key removes `validation`

An empty input maps to `undefined` rather than to `0` or `""`. When the patch
would leave `validation` with no key, the row patches `validation: undefined`.

This matters beyond tidiness. `definitionHash` is the JCS hash of the body, so
`validation: {}` and an absent `validation` hash differently. Two drafts an
author reads as identical would publish as two versions.

### The `pattern` reports are advisory, not a save block

The draft saves whatever the author typed. The report renders beside the input.
Publish keeps `compile.ts::checkPatterns` unchanged.

I rejected refusing the save. A draft is work in progress, and every other
panel in the studio area saves an incomplete body. Live validation already
reports issues without blocking.

## Risks / Trade-offs

The browser table drifts from `checkConstraints` when someone changes the
engine's constraint evaluation. Mitigation: the test over `offeredKeys` names
the engine function in its description, so the next reader knows where to look.
The mapping is four rows.

An author reads the inline note as an error and deletes a key a hand-authored
body meant to keep. Mitigation: the note states that the engine skips the key
for this field type. It does not call the key invalid.

The field row grows and the inspector column turns denser. Mitigation: the
section stays collapsed for a field with no validation. That is the common case
in every example process.

## Migration Plan

None. No schema key, no route, no stored data. An existing draft opens in the
new editor with whatever `validation` it already carries.

## Open Questions

Whether the same collapsed section should later host `FieldDef.default`. That
is the second key `FieldCatalogPanel` does not render. It needs the same row
and the same type-driven treatment. But it accepts a `Literal` or an
`Expression`, which is a different editor. Deferring it changes nothing in this
change's specs or tasks.
