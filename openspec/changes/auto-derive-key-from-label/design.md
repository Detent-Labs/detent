## Context

See `proposal.md` - Why. Three studio sites already pair a `label` input
with a plain `key` text input, each wired directly to `mutate()`:
`ProcessHeaderBar.tsx` (process key), `StepsPanel.tsx` (step key, in the
inspector's identity zone), and `FieldCatalogPanel.tsx` (field key, both
top-level and nested inside a `group`'s own child editor). A fourth site
writes `step.label` too: the canvas node's own inline rename
(`CanvasView.tsx::commitRename`, via `canvas/inlineRename.ts`), which
`inlineRename.ts`'s own doc comment already requires to stay in agreement
with the identity zone's `LocalizedTextInput` ("the two routes to
`step.label` cannot drift"); this change's step-key derivation must wire
into both. All three keys are ordinary `z.string()` in
`src/schema/definition.ts` with one exception: `FieldDef.key` alone is
constrained at publish time to `/^[a-z_][a-z0-9_]*$/`
(`compile.ts::checkFieldKeyFormat`), since it is read as a CEL identifier
(`data.<key>`). `Path.key`/`Path.label` derive automatically only at
creation, from the path's two endpoint steps
(`draft/createPath.ts::derivePathDefaults`, using its own local `slugify`);
`PathsPanel.tsx` then exposes both as independent, un-re-derived text
inputs post-creation, the same gap this change closes elsewhere, but
deferred here — see Open Questions.

Every `label` in scope (`ProcessBody.label`, `Step.label`, `FieldDef.label`)
is `LocalizedText`, not a plain string, and every editing site is
`<LocalizedTextInput>`, which on each keystroke merges only the *current
content locale's* entry (`mergeLocalizedTextEntry`). See Decisions below for
which locale derivation reads.

## Goals / Non-Goals

**Goals:**
- One shared, pure derivation function reused at all three sites, so a
  label always produces the same shape of key regardless of which entity
  it's attached to.
- Auto-fill that gets out of the way permanently the moment an author
  types into the key field by hand — no author-visible "smart" behavior
  that fights a typed value.
- Dedup that prevents the common case (two entities sharing a label) from
  ever producing a duplicate key, without adding new publish-time
  validation.

No design-skill pass: this change only alters the auto-fill behavior of
existing key text inputs at three sites; it adds no new visual element and
reshapes no screen.

**Non-Goals:**
- Inferring or re-syncing `key` for an entity loaded from an existing
  saved/published draft. Only entities whose key is still "live" (empty, or
  unchanged from what derivation would have produced) are touched; see
  Decisions below for how that's detected without a new state field.
- Any change to `Path.key`/`Path.label` derivation, or to
  `src/schema/definition.ts` / `compile.ts`.
- General duplicate-key detection or reporting beyond what dedup already
  prevents at entry time.

## Decisions

**Derivation reads only the base-locale entry of `label`, never the content
locale being typed.** `label` is `LocalizedText`; `LocalizedTextInput`
fires `onChange` on every keystroke into whichever content locale the
author currently has selected, merging only that entry
(`mergeLocalizedTextEntry`). If derivation read the content locale, typing
a translation into a secondary locale would re-derive (and silently
overwrite) an already-meaningful, English-derived key purely because the
same `onChange` fired for a different locale's text — contradicting the
base-locale-is-canonical assumption `authored-content-localization` already
establishes. Every call site instead resolves the entity's `label` against
`draft.baseLocale` before calling `deriveKey`
(`resolveDraftLocalizedText(label, draft.baseLocale ?? "en", draft.baseLocale ?? "en")`
or equivalent). The `draft.baseLocale ?? "en"` half of this is the same
raw-string coercion `EditScreen.tsx:83` and `EditorDock.tsx:185` already
apply when a call site needs a plain `string` rather than `Draft`'s
deep-partial `string | undefined`. Passing that value for BOTH
`resolveDraftLocalizedText` parameters is this change's own construction,
not reused from an existing call site — `EditorDock.tsx`'s own
`resolveDraftLocalizedText` call (`stepCell`, line 222-223) passes the real
`contentLocale` as the first argument, exactly the base-locale-only
constraint this design deliberately does NOT want reused here. Passing
`baseLocale` for both parameters makes `resolveDraftLocalizedText`'s own
`value?.[locale] ?? value?.[baseLocale]` fallback a no-op, so this reads
exactly one entry, the base-locale one — that is the property being relied
on, verify against the function body, not against a call site that doesn't
do this.

`seedLocalizedText(contentLocale)` (`draft/localized-text.ts`) seeds a
freshly created step/field's label under whichever content locale the
author currently has selected, not necessarily `draft.baseLocale` — an
author can switch content locale independently of base locale
(`draft/store.tsx`) and then create a new entity. If that entity's label is
typed while content locale differs from base locale, every keystroke lands
in the non-base entry only, and base-locale-only derivation reads an empty
base-locale string: the key never auto-fills, silently, until the author
switches back to (or separately fills) the base locale. See Risks below —
accepted, not fixed, since fixing it would mean deriving from a locale this
design's Decision above deliberately excludes. An edit to a non-base
content locale's entry never triggers key re-derivation, lock-check
included: the "previous label" the lock check diffs against is always the
prior base-locale text, not the prior content-locale text.

**One shared `deriveKey`/`dedupeKey` pair, not three site-local copies.**
`createPath.ts` already has its own local `slugify` producing hyphenated
slugs (`expense-approval`), which fits a path key (format-free, only ever
read by a human). Process, step, and field keys instead reuse the field
identifier grammar (`[a-z_][a-z0-9_]*`) everywhere, even though only
`FieldDef.key` is actually constrained to it. Rationale: a studio-wide
"this is what a derived key looks like" convention is worth more than
letting process/step keys drift into a hyphenated shape that would need
translating if either ever gained the identifier constraint later (e.g. if
a future guard ever reads `instance.key` or similar). The new function
lives in `packages/web/src/areas/studio/draft/deriveKey.ts`, a plain module
with no draft-shape dependency, so all three call sites import the same
two functions:

```
deriveKey(label: string): string
dedupeKey(base: string, taken: ReadonlySet<string>): string
```

**Lock detection compares against the *previous* derivation, not a stored
flag.** The alternative — a boolean `keyLocked` field threaded through
`DraftField`/`DraftStep`/the process draft — would need its own schema
extension (even if view-only, never serialized) and its own reset-on-new-
entity logic. Instead, each label `onChange` handler computes, before
applying the new label, what the entity's key would currently be if still
auto-derived from the *old* label (`dedupeKey(deriveKey(oldLabel),
takenExcludingSelf)`). If the entity's actual current key equals that
value — or is empty — auto-fill is still live, so the handler overwrites
the key with the fresh derivation from the new label. Otherwise the
handler leaves the key untouched. This reads directly off existing draft
state on every keystroke; it needs no new field, and it can never disagree
with what's actually in the key input, since it's derived from that input
each time. The one accepted gap: an entity loaded from a saved draft whose
key coincidentally still equals its own label's derivation looks "live"
and would resume auto-filling on the next label edit. This is judged
acceptable — the roadmap's "new entities only" framing is about not
surprising an author who already set a real key, and a coincidental match
means the key already reads as label-derived to a human anyway.

The lock check is exposed as one named, shared helper —
`shouldAutoDeriveKey(currentKey: string, previousLabelDerivedKey: string):
boolean` — in `deriveKey.ts` beside `deriveKey`/`dedupeKey`, used at all
four call sites (process, step identity zone, step canvas rename, field).
Inlining it three or four times separately would let the sites drift on
exactly the check this design's single-source-of-truth goal exists to
avoid.

**Dedup scope matches each site's existing key-uniqueness expectations,
not the whole process.** Steps dedupe against sibling steps
(`draft.workflow.steps[].key`); fields dedupe against the flattened field
catalog (`fields` plus every `group`'s nested `fields`), since
`FieldDef.key` is a flat CEL namespace regardless of nesting depth; the
process key is singular per draft and needs no dedup. This mirrors where a
collision would actually matter (CEL identifier collisions for fields;
authoring confusion for steps), rather than inventing a single
process-wide namespace across unrelated entity kinds.

## Risks / Trade-offs

- [Coincidental "still looks live" match on a loaded draft resumes
  auto-fill unexpectedly] → Accepted; see Decisions above. The failure mode
  is narrow (key already reads as exactly label-derived) and the fix if it
  ever proves surprising is additive (a real `keyLocked` field), not a
  breaking change to this design.
- [The opposite direction of the same race: dedup scope is dynamic, so
  `dedupeKey(deriveKey(oldLabel), takenExcludingSelf)` recomputed now can
  differ from what was actually assigned at the time purely because a
  sibling's key changed since, causing the lock check to conclude — wrongly
  — that the entity was hand-edited, silently and permanently disabling
  auto-fill for an entity the author never touched] → Accepted, same
  disposition as above; a real author can hit this by renaming two similarly
  labeled steps in sequence, and the failure mode is silent-safe (auto-fill
  turns off, it never overwrites a hand-set key), not incorrect data.
- [Reusing the field identifier grammar for process/step keys narrows what
  a derived key can look like, even though those two fields accept any
  string] → Accepted; a hand-edit still accepts anything, including
  punctuation or spaces, since the key field stays an ordinary text input.
  Only the *auto-fill's own output* is constrained.
- [Dedup only guards the moment of typing; a later batch edit — e.g. a
  paste, or a JSON-view edit — can still produce a duplicate key] → Left to
  whatever duplicate-key handling already exists in the checks rail today;
  no new detection added, per proposal.md's stated scope.
- [A new entity created while the studio's content locale differs from the
  draft's base locale never auto-fills its key, since `seedLocalizedText`
  seeds under the current content locale and derivation reads only the base
  locale] → Accepted. Narrow (requires the author to have already switched
  content locale away from base before creating the entity) and silent-safe
  (the key field just stays empty, exactly as it would with auto-fill
  disabled entirely — never wrong, never overwritten). The scenarios in
  both delta specs for "a new entity's key follows its label" implicitly
  assume the author is viewing the base locale; each names that
  precondition explicitly.

## Migration Plan

Purely additive UI behavior; no data migration, no API change, no schema
change. Ships and rolls back as an ordinary code change.

## Open Questions

- Should `Path.label`/`Path.key` get the same auto-derive-and-lock
  treatment `PathsPanel.tsx` currently lacks, in a follow-up change?
  Deferred here because `Path.key` is format-free and never read as a CEL
  identifier (`.claude/rules/authoring-invariants.md`), so the
  collision/format risk this change targets for fields is absent for
  paths — the gap is real (see proposal.md's Out-of-scope bullet) but lower
  stakes. `ROADMAP.md` stage 45 names path as one of four target sites; this
  question is what keeps that stage from closing with path silently
  unaddressed.
