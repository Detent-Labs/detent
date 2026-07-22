## Why

Authored process content (`label`/`description` on the process, its steps,
its fields, and field options) is currently a plain English string. The
team wants process participants to see this content in their own locale at
runtime, and wants authors to be able to enter it in more than one language
while building the process — building directly on the locale-state
infrastructure already shipped by `editor-i18n` (the editor's UI-chrome
locale), which was deliberately kept catalog-agnostic so this change could
reuse its shape.

## What Changes

- **BREAKING**: `ProcessBody.label`/`description`, `Step.label`/`description`,
  `FieldDef.label`/`description`, and `FieldOption.label` change from `string`
  to `LocalizedText` (`Record<LocaleCode, string>`). No compatibility union
  with plain `string` is kept — every existing definition body, example, and
  test fixture using these fields is migrated as part of this change.
- Add `LocaleCode` (an open, regex-validated locale-tag format — not a fixed
  enum) and `LocalizedText` to `src/schema/definition.ts`.
- Add `ProcessBody.baseLocale: LocaleCode`, a required field naming the
  process's fallback locale.
- Add a process-wide structural invariant: every `LocalizedText` value found
  anywhere in the body (process, steps, fields including nested `group`
  fields, field options) must contain a non-empty entry for `baseLocale`.
  Additional locales are optional per entry — a value missing a non-base
  locale is valid and resolves via fallback, not a parse error.
- Add `resolveLocalizedText(value, locale, baseLocale)`, a pure fallback-to-
  `baseLocale` lookup function, exported alongside the schema.
- `src/schema/compile.ts`'s synthesized cancel-sink step's `label` becomes
  `{ en: "Cancelled", [baseLocale]: "Cancelled" }` — a documented limitation,
  not a general translation table for this one synthesized string.
- Editor: a new, UI-chrome-independent "content locale" concept (which
  locale of the *authored process content* the author is currently viewing/
  editing), a matching switcher control, and a `LocalizedTextInput` component
  used everywhere a `label`/`description`/option-label is edited.
- Editor: `GraphView` node labels resolve through `resolveLocalizedText`
  instead of rendering a raw string.
- Explicitly unchanged: `Path.label`/`description`, `Timer.description`, and
  `Plugin.description` stay plain `string` (internal/authoring-facing, not
  participant-facing).
- Explicitly out of scope: the editor's own UI-chrome locale (`editor-i18n`)
  stays a separate, independent concept from content locale — no coupling
  between "what language is the editor's interface in" and "what languages
  is this process authored in".

## Capabilities

### New Capabilities
- `authored-content-localization`: the `LocaleCode`/`LocalizedText` contract
  types, the `baseLocale` field, the base-locale-required structural
  invariant, and the `resolveLocalizedText` fallback function.

### Modified Capabilities
- `editor-structural-panels`: panels editing `label`/`description`/field-
  option-label now edit a per-locale value via a content-locale-scoped
  input, not a single plain string.
- `editor-live-validation`: the new base-locale-required invariant surfaces
  as a normalized `EditorIssue` on its owning entity, like every other
  structural check.
- `editor-graph-view`: node label rendering resolves `LocalizedText` through
  `resolveLocalizedText` for the current content locale instead of
  displaying a raw string.

## Impact

- **Affected code**: `src/schema/definition.ts` (new types, field type
  changes, new invariant), `src/schema/compile.ts` (cancel-sink label),
  `examples/*.json` (migrated to `LocalizedText` + `baseLocale`),
  `test/*.ts` fixtures touching the four affected fields, and
  `packages/editor/src/**` (content-locale state, switcher,
  `LocalizedTextInput`, panel updates, graph view label resolution).
- **No CEL changes**: `label`/`description` are never CEL-readable; the CEL
  formal context (`data`/`instance`/`actor`/`child`) is untouched.
- **No runtime/engine-execution changes**: transitions, guards, actions, and
  history are display-text-agnostic; this is a schema and editor-display
  change only.
- **No new dependencies.**
