# Design

## Context

Today `FieldCatalogPanel.tsx::FieldEditor::updateLabel` calls
`fieldCatalogLogic.ts::nextFieldKey`. That function calls
`deriveKey.ts::shouldAutoDeriveKey`. The answer is true while the key equals
the prior label's derivation. The key input of a non-group field writes
`onChange({ key })` on every keystroke. A group field's input already holds
typed text and commits on blur or Enter (`FieldKeyInput`).

`draft/field-removal.ts::fieldRemovalReach` already counts the CEL expressions
that read a removed field's key. It uses a private `keyReader`. The editor
has no source for "this field exists in a published version". The Changes tab
fetches the base version body itself (`ChangesView.tsx`). No other component
does.

The owner ruled on 2026-10-10: lock auto-derivation once a field has a CEL
reader or exists in a published version. A deliberate key change stays
possible, shows how many expressions read the key, and commits on blur. No
reader is rewritten.

The owner ruled on 2026-10-12: a published field's key can change in the next
version, with no extra confirm step. The change builds no option-value
warning. FIELDS-17 and FIELDS-18 stay open.

## Goals / Non-Goals

**Goals:**

- A label change never renames a key that a CEL expression reads or that a
  published version holds.
- A key change is one deliberate write that tells the author what reads the
  key.

**Non-Goals:**

- Rewriting readers on a rename.
- A group field's key. It has no `data` entry and already rewrites its view
  entries.
- Option values that a CEL comparison names.
- Plugin config mapping values (FIELDS-17) and a reused key (FIELDS-18).
- Any change under `src/` or to the definition contract.

## Decisions

**Shape.** The `impeccable shape` pass settled these points.

- The key input keeps its place, its mono face and its label in the field
  editor's definition zone.
- A notice sits directly below it as a paragraph in muted ink with the
  advisory rule. A reader count advises and refuses nothing, so it skips the
  refusal red of the label's translation gap. The notice has no new color,
  icon, control or motion.
- A count above zero reads "Read by 3 expressions. The label no longer sets
  this key, and changing the key does not touch them."
- A published field without readers reads "This field is in a published
  version. The label no longer sets its key."
- A field with neither shows nothing, so a new field's editor looks as it
  does today.
- The key input stays a real `<input>` inside its `<label>`. The notice joins
  it through `aria-describedby`, so a screen reader reads the count with the
  field.
- The studio catalog ships English only. Each sentence is one catalog key.
  The count has a singular key, since the catalog has no plural helper.

**D1. One reader walk in `draft/key-readers.ts`.** `keyReader`, its helpers
and a new `countKeyReaders(draft, key)` move into one module.
`field-removal.ts` imports `keyReader` from it. `countKeyReaders` visits every
object with `lang: "cel"` and a string `src`. It skips none. It tests the
source with the parse-then-regex rule that removal uses. A `src.includes(key)`
test runs first, so the parser only sees expressions that name the key text.

Alternative: call `fieldRemovalReach` from the editor. It skips the field's
own expressions and counts a removal. A rename needs every reader. Rejected.

**D2. `nextFieldKey` decides the lock.** It gains a `locked` input. It
returns `undefined` when the key is non-empty and `locked` is true. The input
is optional and defaults to false, so the group label write in
`view-group-sync.ts` keeps its behavior. An empty key still derives, since an
empty key has neither reader nor publication.
`FieldEditor::updateLabel` supplies `locked`. Alternative: block the write at
the input. Rejected, since the label change is where the rename happens.

**D3. Published ids come from a small context.** A provider in
`draft/publishedFields.tsx` takes `processId`, `token` and `baseVersion`. It
fetches `getVersionBody` once per base version. It exposes the set of field
ids at every depth. The value is `undefined` while the fetch runs or after it
fails, and the lock reads `undefined` as locked. Without a provider, the
context holds an empty set. A test that mounts `FieldCatalogPanel` alone then
sees nothing published. `EditScreen` mounts the provider inside
`DraftProvider`, with the `changesBaseVersion` that the Changes tab uses. A
publish moves that number, and the provider fetches again.

Alternative: put
the ids in `DraftContextValue`. Its provider knows neither the process id nor
the base version. Rejected.

**D4. Every non-group key input commits on blur.** `FieldKeyInput` already
holds typed text for a group. The non-group branch takes the same `typed`
state. It calls `onChange({ key: typed })` on blur or Enter. Text equal to the
current key writes nothing. The commit writes the key alone and leaves every
reader.

Clicking Save blurs the input first, so the commit lands before the save.

**D5. The notice counts readers in a memo.** `FieldEditor` mounts for the
selected field only. It runs `useMemo(() => countKeyReaders(draft, key), [draft, key])`. The
`includes` test keeps a large draft to a string scan plus a few parses.
The helper carries a `ponytail:` comment. It walks the whole draft per draft
change, and `cut-studio-render-cost` is the upgrade entry point.

## Risks / Trade-offs

- The walk misses an index read such as `data["amount"]`. That leaves the
  field unlocked. → A published field stays locked. The removal dialog has the
  same limit.
- The lock hides the effect of a label change. The author types a label, and
  the key stays. → The notice says so. The key input stays open to a
  deliberate change.
- A failed base fetch leaves every key locked. → That is the safe side. The
  Changes tab shows the same fetch error. A reload tries again.
- Each draft makes a second `getVersionBody` request. → It runs once per base
  version. A later cache can serve both fetches. `cut-studio-render-cost` owns
  that.

## Migration Plan

None. The change touches the browser package and stores nothing. It ships
with the next web build. A revert of the commit rolls it back.

## Open Questions

None. The owner answered both questions on 2026-10-12.
