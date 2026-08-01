<!-- antislop: allow-file passive-voice synonym-rotation -->
<!-- "surface" here names an authoring surface. "render" names what React
     does. The linter reads the two as one concept. -->


## Context

See proposal.md, section Why.

Two facts shape the approach. `ProcessBody.baseLocale` is a required field
with no default (`src/schema/definition.ts`, `localeCode`). And every studio
reader of a draft's base locale already applies the same fallback when the
draft declares none. The draft store's content-locale seed, the canvas's step
labels, and `resolveDraftLocalizedText` all read `draft.baseLocale ?? "en"`.

So the studio already behaves as though an undeclared base locale is `en`. It
just never writes that down. Publish is the one place that refuses to guess.

## Goals / Non-Goals

**Goals:**

- A process authored only through the structural surface publishes.
- The declared base locale sits beside the other process-level values, visible
  and editable.

**Non-Goals:**

- No schema change. `baseLocale` stays a required field with no default.
- No data migration for stored drafts that carry no `baseLocale`.
- No change to the content-locale switcher itself. Declaring a base locale
  moves which locale the author edits, and that is the only new link between
  the two.
- No re-keying of existing `LocalizedText` entries when the base locale
  changes. Live validation reports the resulting gaps. The author fills them.
- No change to `load-guard.ts`, which type-checks every top-level string key
  except `baseLocale`. That gap predates this change, affects imported files
  only, and crashes nothing.

## Decisions

**Seed the client's new-draft body, not a schema default.** The alternative is
`baseLocale: localeCode.default("en")` in `definition.ts`, which repairs every
caller at once. Rejected, because `definition.ts` is the contract and also the
deserializer for stored immutable bodies. A default there silently writes a
value into any body that omits one, including on read. The gap is in one
authoring surface, not in the contract. The contract does not change as a
side effect of another task (CLAUDE.md).

The seed also keeps the error honest. A hand-authored body that omits
`baseLocale` still fails to publish, which is what the spec says it does.

Seeding on the server is not an option either. The `process-drafts` capability
requires `saveDraft` to store the body exactly as supplied, and forbids any
engine path outside `drafts.ts` from reading `drafts.body`. The client is the
only place the seed can live.

**Declaring a base locale moves the edited content locale.**

The two values are separate today. The store seeds `contentLocale` once at
mount from `initial?.baseLocale ?? "en"`. Only the switcher moves it after
that. Leaving them separate turns the new control into a trap.

Two writers explain why. `LocalizedTextInput` writes `value[contentLocale]` on
every keystroke. `seedLocalizedText` gives every newly created step and field
its label under `contentLocale`. So an author who declares `de` and keeps
working would write `en` entries, and watch each new entity report a missing
`de` entry.

The move is gated on `resolveAddLocaleAttempt`, the check the switcher's Add
button already runs. A part-typed `d` therefore moves nothing. Without the
gate, one character typed into any text field would write a `label.d` entry.
The switcher would then offer `d` for good, via `collectUsedLocales`.

**The whole decision lives in `processHeaderLogic.ts`, not in the component.**

`resolveBaseLocaleChange(typed, currentContentLocale)` returns both values.
`ProcessHeader` applies two unconditional writes and owns no branch.

This follows `draftToolbarState.ts`, which exists for one reason. The bug it
guards was in the wiring, and a test of the underlying function alone could
not see it. The same risk applies here. A header that writes `baseLocale` and
forgets to move the content locale passes every test of the gate.

That matters because `packages/web` has no interactive DOM test environment.
No test covered `resolveAddLocaleAttempt` before this change, despite its doc
comment. This change adds one for the gate. It adds a second that drives the
resolver through the sequence the header produces. Each case ends at the entry
a later keystroke writes.

**A plain text input, mirroring `key`.** The alternative is a select over the
draft's used locales, like the content-locale switcher. Rejected, because the
base locale is a declaration, not a choice among what the body happens to
contain. The first thing an author does on a German process is type a locale
no entry uses yet. A free-text input also needs no validation of its own.
`localeCode`'s regex already reports a malformed value through live
validation, on the same path every other malformed authored value takes.

**Drafts seeded from a published version stay as they are.** A published body
carries its own `baseLocale` by definition. It could not have reached publish
otherwise. `stripCompiledContent` does not remove the field. Only the no-seed
branch changes.

## Risks / Trade-offs

- **A draft stored before this change still carries no `baseLocale`. It
  still fails to publish.** The new control is the repair. It is one
  keystroke away, on the screen where the author already works. A data
  migration over drafts would guess a base locale for content that may not
  be English. The author is the one who knows.
- **Changing the base locale turns some entries into errors.** Every older
  entry without a value for the new locale reports. That report is correct,
  not a regression. Those entries are genuinely missing.
  The existing `IssueList` locates each one per entity, so the author sees
  where. Everything written afterwards lands under the new locale, because
  the content locale moved with it.
- **The scenarios on the new control cannot be driven through a rendered
  component.** `packages/web` tests render through `renderToStaticMarkup`,
  which fires no event. Extracting the decision moves every branch into a
  module a test can drive. What stays untested is two unconditional
  statements. Every other panel input carries the same exposure. It is the
  floor this repo's own precedent settles for.
- **The seeded value is a guess.** Every studio reader already guesses the
  same for a draft that declares nothing. The change makes the studio
  consistent rather than opinionated. The control sits right beside the
  value.
