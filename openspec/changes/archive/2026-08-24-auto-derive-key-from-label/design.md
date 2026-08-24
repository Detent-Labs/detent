## Context

See `proposal.md` - Why. Three studio sites already pair a `label` input
with a plain `key` text input. Each one wires directly to `mutate()`.

The three sites are `ProcessHeaderBar.tsx` for the process key, and
`StepsPanel.tsx` for the step key in the inspector's identity zone. The
third is `FieldCatalogPanel.tsx` for the field key. The field key
applies to both a top-level field and a field nested inside a `group`'s
own child editor.

A fourth site writes `step.label` too: the canvas node's own inline
rename (`CanvasView.tsx::commitRename`, via `canvas/inlineRename.ts`).
`inlineRename.ts`'s own doc comment already requires this site to stay
in agreement with the identity zone's `LocalizedTextInput`. It states
that the two routes to `step.label` cannot drift. This change's
step-key derivation must wire into both.

All three keys are ordinary `z.string()` in `src/schema/definition.ts`,
with one exception. The function `compile.ts::checkFieldKeyFormat`
constrains `FieldDef.key` alone, at publish time, to
`/^[a-z_][a-z0-9_]*$/`. The CEL grammar reads that key as an identifier
(`data.<key>`).

`Path.key`/`Path.label` derive automatically, but only at creation,
from the path's two endpoint steps. The mechanism is
`draft/createPath.ts::derivePathDefaults`, using its own local
`slugify`. The `PathsPanel.tsx` component then exposes both as
independent, un-re-derived text inputs after creation. That is the
same gap this change closes elsewhere, deferred here. See Open
Questions.

Every `label` in scope (`ProcessBody.label`, `Step.label`,
`FieldDef.label`) is `LocalizedText`, not a plain string. Every editing
site is `<LocalizedTextInput>`. On each keystroke it merges only the
*current content locale's* entry (`mergeLocalizedTextEntry`). See
Decisions below for which locale derivation reads.

## Goals / Non-Goals

**Goals:**
- One shared, pure derivation function, reused at all three sites. A
  label always produces the same shape of key, regardless of which
  entity carries it.
- Auto-fill that gets out of the way permanently, the moment an author
  types into the key field by hand. No author-visible "smart" behavior
  fights a typed value.
- Dedup that prevents the common case, two entities sharing a label,
  from ever producing a duplicate key. It adds no new publish-time
  validation.

No design-skill pass applies. This change only alters the auto-fill
behavior of existing key text inputs at three sites. It adds no new
visual element and reshapes no screen.

**Non-Goals:**
- Inferring or re-syncing `key` for an entity loaded from an existing
  saved or published draft. This change touches only an entity whose
  key is still "live": empty, or matching what derivation would have
  produced. See Decisions below for how the auto-fill detects that,
  with no new state field.
- Any change to `Path.key`/`Path.label` derivation, or to
  `src/schema/definition.ts` / `compile.ts`.
- General duplicate-key detection or reporting beyond what dedup
  already prevents at entry time.

## Decisions

**Derivation reads only the base-locale entry of `label`.** It never
reads the content locale the author is currently typing into. The
`label` field is `LocalizedText`. The `LocalizedTextInput` component
fires `onChange` on every keystroke, into whichever content locale
the author currently has selected. It merges only that entry
(`mergeLocalizedTextEntry`).

If derivation read the content locale, typing a translation into a
secondary locale would re-derive the key. It would silently overwrite
an already-meaningful, English-derived key. The cause: the same
`onChange` fires for a different locale's text. That would contradict
the base-locale-is-canonical assumption `authored-content-localization`
already establishes.

Every call site instead resolves the entity's `label` against
`draft.baseLocale` before calling `deriveKey`
(`resolveDraftLocalizedText(label, draft.baseLocale ?? "en",
draft.baseLocale ?? "en")` or equivalent). The `draft.baseLocale ??
"en"` half of this is the same raw-string coercion `EditScreen.tsx:83`
and `EditorDock.tsx:185` already apply. Both call sites need a plain
`string` rather than `Draft`'s deep-partial `string | undefined`.

Passing that value for BOTH `resolveDraftLocalizedText` parameters is
this change's own construction. No existing call site does this.
`EditorDock.tsx`'s own `resolveDraftLocalizedText` call (`stepCell`,
line 222-223) passes the real `contentLocale` as the first argument.
That is exactly the base-locale-only constraint this design
deliberately does NOT want reused here.

Passing `baseLocale` for both parameters makes
`resolveDraftLocalizedText`'s own `value?.[locale] ??
value?.[baseLocale]` fallback a no-op. So this reads exactly one
entry, the base-locale one. This design relies on that property.
Verify it against the function body, not against a call site that
does something different.

`seedLocalizedText(contentLocale)` (`draft/localized-text.ts`) seeds a
freshly created step's or field's label under whichever content locale
the author currently has selected. That locale is not necessarily
`draft.baseLocale`. An author can switch content locale independently
of base locale (`draft/store.tsx`), then create a new entity.

Suppose the author types that entity's label while content locale
differs from base locale. Then every keystroke lands in the non-base
entry only. Base-locale-only derivation then reads an empty
base-locale string. The key never auto-fills, silently, until the
author switches back to (or separately fills) the base locale.

See Risks below. This gap stays accepted, not fixed. Fixing it would
mean deriving from a locale this design's Decision above deliberately
excludes. A change to a non-base content locale's entry never triggers
key re-derivation, lock-check included. The "previous label" the lock
check diffs against is always the prior base-locale text, never the
prior content-locale text.

**One shared `deriveKey`/`dedupeKey` pair, not three site-local
copies.** `createPath.ts` already has its own local `slugify` that
produces hyphenated slugs (`expense-approval`). That fits a path key,
which is format-free and read only by a human.

Process, step, and field keys instead reuse the field identifier
grammar (`[a-z_][a-z0-9_]*`) everywhere, even though only
`FieldDef.key` carries that constraint. The rationale: a studio-wide
"this is what a derived key looks like" convention is worth more.
That convention beats letting process or step keys drift into a
hyphenated shape. A future
guard that reads `instance.key` or similar could gain the identifier
constraint later, and that shape would then need translating.

The new function lives in
`packages/web/src/areas/studio/draft/deriveKey.ts`, a plain module
with no draft-shape dependency. All three call sites import the same
two functions:

```
deriveKey(label: string): string
dedupeKey(base: string, taken: ReadonlySet<string>): string
```

**Lock detection compares against the previous derivation, not a
stored flag.**

An alternative design could thread a boolean `keyLocked` field
through `DraftField`, `DraftStep`, or the process draft. That
alternative would need its own schema extension, even if view-only
and never serialized. It would also need its own reset-on-new-entity
logic.

Instead, each label `onChange` handler computes, before applying the
new label, what the entity's key would currently be. It computes this
as if the key were still auto-derived from the *old* label
(`dedupeKey(deriveKey(oldLabel), takenExcludingSelf)`). If the
entity's actual current key equals that value, or is empty, auto-fill
is still live. The handler then overwrites the key with the fresh
derivation from the new label. Otherwise the handler leaves the key
untouched.

This check reads directly off existing draft state on every keystroke.
It needs no new field. It can never disagree with the key input. It
always derives from that input, every time. One gap stays accepted.
An entity loaded from a saved draft can have a key that
coincidentally still equals its own label's derivation. That entity
looks "live", and it would resume auto-filling on the next label
change.

This design judges that acceptable. The roadmap's "new entities only"
framing guards against surprising an author who already set a real
key. A coincidental match means the key already reads as
label-derived to a human anyway.

One named, shared helper carries the lock check:
`shouldAutoDeriveKey(currentKey: string, previousLabelDerivedKey:
string): boolean`, in `deriveKey.ts` beside `deriveKey`/`dedupeKey`.
All four call sites use it: process, step identity zone, step canvas
rename, and field. Inlining it three or four times separately would
let the sites drift. They would drift on exactly the check this
design's single-source-of-truth goal exists to avoid.

**Dedup scope matches each site's existing key-uniqueness
expectations, not the whole process.** Steps dedupe against sibling
steps (`draft.workflow.steps[].key`). Fields dedupe against the
flattened field catalog: `fields` plus every `group`'s nested
`fields`. The `FieldDef.key` field is a flat CEL namespace regardless
of nesting depth. The process key is singular per draft and needs no
dedup.

This mirrors where a collision would matter in practice: CEL
identifier collisions for fields, authoring confusion for steps.
Nothing here invents a single process-wide namespace across unrelated
entity kinds.

## Risks / Trade-offs

- Coincidental "still looks live" match on a loaded draft resumes
  auto-fill unexpectedly. Accepted; see Decisions above. The failure
  mode is narrow: the key already reads as exactly label-derived. The
  fix, if this ever proves surprising, is additive. It would add a
  real `keyLocked` field, not a breaking change to this design.
- The opposite direction of the same race: dedup scope is dynamic. The
  call `dedupeKey(deriveKey(oldLabel), takenExcludingSelf)`,
  recomputed now, can differ from what the draft assigned at the
  time. That happens
  purely because a sibling's key changed since; the lock check can
  then wrongly conclude the entity was hand-changed. That silently
  and permanently disables auto-fill for an entity the author never
  touched; accepted, same disposition as above. A real author can hit
  this by renaming two similarly labeled steps in sequence. The
  failure mode is silent-safe: auto-fill turns off, never overwriting
  a hand-set key or producing incorrect data.
- Reusing the field identifier grammar for process and step keys
  narrows what a derived key can look like. Accepted. Those two
  fields still accept any string when hand-changed. A hand-change
  still accepts anything, including punctuation or spaces, since the
  key field stays an ordinary text input. Only the *auto-fill's own
  output* stays constrained.
- Dedup only guards the moment of typing. A later batch change, such
  as a paste or a JSON-view change, can still create a duplicate key.
  Accepted: left to whatever duplicate-key handling already exists in
  the checks rail today. This design adds no new detection, per
  proposal.md's stated scope.
- A new entity created while the studio's content locale differs from
  the draft's base locale never auto-fills its key. This happens
  since `seedLocalizedText` seeds under the current content locale,
  and derivation reads only the base locale; accepted. This gap needs
  the author to have already switched content locale away from base
  before creating the entity. It stays silent-safe: the key field
  just stays empty, as if auto-fill were off, never wrong, never
  overwriting anything. Both delta specs' scenarios for "a new
  entity's key follows its label" assume the author is viewing the
  base locale. Each names that precondition explicitly.

## Migration Plan

Purely additive UI behavior. No data migration, no API change, no
schema change. This ships and rolls back as an ordinary code change.

## Open Questions

- Should `Path.label`/`Path.key` get the same auto-derive-and-lock
  treatment `PathsPanel.tsx` currently lacks, in a follow-up change?
  This design defers that question, because `Path.key` is format-free
  and never read as a CEL identifier
  (`.claude/rules/authoring-invariants.md`). The collision and format
  risk this change targets for fields is absent for paths. The gap is
  real, see proposal.md's Out-of-scope bullet, though it carries
  lower stakes. The `ROADMAP.md` file's stage 45 names path as one of
  four
  target sites. This question is what keeps that stage from closing
  with path silently unaddressed.
