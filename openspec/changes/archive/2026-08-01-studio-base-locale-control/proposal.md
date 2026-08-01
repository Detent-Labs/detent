<!-- antislop: allow-file passive-voice -->

## Why

A process authored only through the studio's structural surface cannot be
published. `ProcessBody.baseLocale` is a required field. No editing path in
the studio ever writes it. A new draft starts as `{}`. The process header
edits only `key` and `label`. The content-locale switcher moves the displayed
locale in React state alone.

Publish therefore fails with `baseLocale: Required`. The only way out today
is the JSON surface, which the structural surface exists to make unnecessary.

## What Changes

- Creating a new process seeds the draft body with `baseLocale: "en"` in place
  of an empty object. The ordinary path then reaches a publishable body
  without the author knowing the field exists.
- Seeding from a published version stays as it is. That body already carries
  its own `baseLocale`.
- The process header gains a `baseLocale` control beside `key`. An author can
  declare a non-English base locale without the JSON surface.
- Declaring a well-formed base locale also moves the locale the author edits.
  Without that move, every value typed afterwards lands under the previous
  locale. Each one then reports as a missing base-locale entry.
- No schema change. `baseLocale` stays a required field, and the base-locale
  entry rule on every `LocalizedText` stays as it is.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `studio-app`: the new-process draft body is no longer empty. It carries
  `baseLocale`. The process header's editable set gains `baseLocale`.

## Impact

- `packages/web/src/areas/studio/screens/processListLogic.ts`, the no-seed
  branch of `seededDraftInput`.
- `packages/web/src/areas/studio/screens/EditScreen.tsx`, the `ProcessHeader`
  component.
- `packages/web/test/studio-processListLogic.test.ts`, whose seed assertion
  names the old empty body and must change.
- `packages/web/test/studio-localizedText.test.ts`, new, covering the gate on
  the content-locale move.
- No engine, HTTP, or schema code. This change touches no published
  definition and no stored draft. A stored draft without `baseLocale` still
  loads, and the author repairs it by typing into the new control.
