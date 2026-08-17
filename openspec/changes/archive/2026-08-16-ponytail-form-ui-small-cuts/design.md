## Context

See proposal.md for motivation. Two sites land. This change declines the
third. All three sit in `packages/form-ui/src`:

- `issue-messages.ts` holds two catalogs, `en` and `de`, typed
  `Record<string, (issue: SubmissionIssue) => string>`. Ten of the fourteen
  entries ignore their argument. `issueMessage` resolves a kind through
  `catalogs[locale]`, then `catalogs[baseLocale]`, then `catalogs.en`, then
  the raw `issue.kind`.
- `optionText` (`FieldForm.tsx:44`) guards twice before it joins.
- `FieldForm.tsx:108` declares `isGroup(field)` and `submit.ts:3` declares
  `isGroupField(field)`. Both bodies read `field.field.type === "group"`.

`packages/form-ui` has no build step. It ships source, and `packages/web`
compiles it. So a type-only change here reaches both consumers through one
`bun run typecheck`.

## Goals / Non-Goals

**Goals:**

- Keep every message byte-identical, in both locales, for every kind.
- Keep `issueMessage`'s locale fallback order observable at the same inputs.
  `packages/form-ui/test/issue-messages.test.ts:57-66` pins it with two cases:
  `("fr", "de")` reads German, `("fr", "it")` reads English.
- Keep the package's exported surface as it is.

**Non-Goals:**

- No change to `SubmissionIssue`, to the set of kinds, or to which consumer
  owns the catalog. The `form-ui` spec assigns the catalog to this package and
  that stays.
- No new locale. `constraintMessage` and `typeMismatchMessage` keep their
  `"en" | "de"` parameter.
- No visual change: no new component, no changed markup, no touched class or
  token. Every input gives `optionText` the same string it gives today. The
  message catalog returns the same sentence. So the design skills CLAUDE.md
  requires for `packages/form-ui` work have no surface to act on here.
- No touch to what `ponytail-cut-unreachable-code` holds in this package:
  `form-ui.css`, `types.ts`'s `WireField.description`, and `index.ts`'s seven
  barrel exports.

## Decisions

### The catalog becomes strings, and the two interpolating kinds move into `issueMessage`

`MESSAGES: Record<string, Record<string, string>>` holds the five kinds whose
message is a constant: `unknown-field`, `readonly-field`, `invalid-option`,
`rule-failed`, `required-missing`. `constraint` and `type-mismatch` leave the
catalogs. `issueMessage` branches on them before the lookup:

```ts
const loc = (locale in MESSAGES ? locale : baseLocale in MESSAGES ? baseLocale : "en") as "en" | "de";
if (issue.kind === "constraint") return constraintMessage(issue, loc);
if (issue.kind === "type-mismatch") return typeMismatchMessage(issue, loc);
return MESSAGES[loc][issue.kind] ?? MESSAGES.en[issue.kind] ?? issue.kind;
```

The `loc` line is the per-locale half of today's chain, resolved once instead
of once per catalog probe. Both catalogs list the same five kinds, so the
per-kind half and the per-locale half select the same entry. The
`?? MESSAGES.en[issue.kind]` term keeps the per-kind fallback anyway, for a
locale added later that lists fewer kinds.

No tsconfig in this repo sets `noUncheckedIndexedAccess`, so `MESSAGES[loc]`
types as `Record<string, string>` and the second index compiles.

Alternative rejected: keep `Catalog` as a function type and drop only the
thunk bodies. That leaves the type declarations the finding names, and the
call `fn(issue)` on a function that reads nothing.

Alternative rejected: give `MESSAGES` a `Record<Locale, Record<Kind, string>>`
type with both key sets closed. A closed kind union turns a kind the engine
adds later into a compile error here. The documented raw-kind fallback is what
should catch it. The file's own header states that fallback as intended.

### `optionText` keeps its first guard

The audit calls both guards dead. Measured, the first one is load-bearing:

```ts
if (!attributes) return label;                  // attributes is `| undefined`;
                                                // Object.values(undefined) throws
const parts = Object.values(attributes).map(...);
return parts.length === 0 ? label : [label, ...parts].join(OPTION_ATTRIBUTE_SEPARATOR);
```

`Array.prototype.join` on a one-element array returns that element with no
separator, so `[label].join(sep) === label`. The second guard is the dead one
and it goes. The change corrects the audit rather than deleting on its word.

`field-form.test.tsx:411` and `:418` already pin both inputs, `undefined` and
`{}`. The cut ships with its check in place; neither assertion changes.

### The `isGroup`/`isGroupField` merge does not land

The duplication is real. Both bodies read `field.field.type === "group"`.
The merge is not worth its price, and the price is structural rather than
textual:

- `submit.ts` and `FieldForm.tsx` both read `./types.js` through
  `import type`. `types.ts` declares four interfaces and imports four types.
  It emits no JavaScript today.
- Hosting the predicate there turns a type-only module into a runtime one, and
  turns two type imports into value imports.
- The other candidate is `submit.ts`, which pulls in no React and imports no
  runtime module. Hosting it there makes `FieldForm`'s layout read a predicate
  out of the submission filter. That inverts the direction the two modules
  have.

Three duplicated lines against a new runtime edge in a package of seven files.
The audit counted the saving and not the cost. So the finding moves to the
audit's "Checked, not flagged (deliberate)" section, with this measurement
attached. The `waitingLabel` and `Intl.RelativeTimeFormat` item sits there for
the same reason.

## Risks / Trade-offs

- A locale added to `MESSAGES` with a missing kind now resolves through
  `MESSAGES.en`, not through a per-locale catalog probe. The explicit
  `?? MESSAGES.en[issue.kind]` term keeps that path → `issue-messages.test.ts`
  covers it at `("fr", "it")`.
- `index.ts` exports both `optionText` (line 1) and `issueMessage` (line 5)
  today, and `ponytail-cut-unreachable-code` drops both lines → land the two
  changes in either order. This one edits function bodies alone and leaves
  `index.ts` as it finds it.
- An empty-string catalog entry would read as absent under `??`. No entry is
  empty, and this file holds every catalog as a literal → accepted, no guard.
- The merge this change declines leaves a duplicate behind. A later scan
  re-files it → the audit correction is a task here, not a note in this file.

## Migration Plan

None. No stored data, no wire format, no published definition, and no
exported signature changes. Roll back by reverting the commit.

## Open Questions

None. Tests that already exist measure both cuts, and the third finding
carries its measurement above.
