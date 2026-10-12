# Proposal

## Why

The step-form renderer and the engine disagree on what an emptied field
means. A participant clears an optional `amount` that holds 120, and the
engine keeps 120, because `JSON.stringify` drops the `undefined` the form
sent. A participant empties an optional `format: "date"` field, and the
engine refuses the `""` the form sent as `type-mismatch`. A required text
field typed and then erased passes the required check as `""`.

Two smaller defects sit in the same package. A completed case shows editable
inputs. A tab named `Kosten $&` breaks the announcement.
The 2026-10-10 audit recorded these as F-3, F-8, F-14 and F-16 (change #22).

## What Changes

- A cleared field means removed. `form-ui` sends `null` for a cleared
  number, text, date, email, multiline or select field. The engine removes
  the key from `data` on a submit, so the field behaves as never written.
  The instance audit log already records a removed key as a `set` entry
  whose value is a JSON null. Owner ruling 2026-10-10.
- A required field counts `""` and `null` as missing, besides `undefined`.
- `FieldForm` gains a `readonly` prop. `form-ui` exports `formIsReadonly`,
  which answers true when the view has no available path or its instance is
  not running. The task screen and the Player pass it. Save disappears with
  the path buttons, and a short note says why the form is read-only.
- A saved form draft that holds a cleared field restores it as cleared. The
  task screen falls back to the committed value today, because the seed uses
  `??`.
- A `datetime` value carrying a zone (`…Z`, `+02:00`) displays in the
  `datetime-local` input's own format, in the browser's zone.
- F-14: `tabSwitchAnnouncement` inserts the tab label as plain text. Only the
  `packages/form-ui` site of FIELDS-19 changes. The 42 string sites in
  `packages/web/src` stay with FIELDS-19 in `docs/decisions.md`
  (coordinator ruling for this change).
- F-16: `form-ui` declares `react` and `react-dom` as `^19` peers, matching
  `packages/web`. The form-ui tests then render with React 19.

No **BREAKING** change to the definition contract. The submit semantics
change for clients: a `null` value that the engine refused as
`type-mismatch` now removes the field.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-api`: a `null` value in a submission clears the field, and the
  required check counts blank values as missing.
- `form-ui`: cleared controls send `null`, a `readonly` prop and the
  `formIsReadonly` helper, a zoned `datetime` display, a literal tab-label
  announcement, and the React 19 peer range.
- `end-user-app`: the task screen is read-only when it offers no submit,
  and a saved draft keeps a cleared field cleared.
- `studio-player`: the Player's step form is read-only when it offers no
  submit.

## Impact

- `src/engine/transition.ts` (patch merge), `src/runtime/fields.ts` and
  `src/runtime/instances.ts` (submit validation and required check).
- `packages/form-ui/src/FieldForm.tsx`, `submit.ts`, `tabs.ts`,
  `package.json`, and their tests.
- `packages/web/src/areas/app/screens/TaskScreen.tsx`,
  `packages/web/src/areas/studio/screens/PlayerScreen.tsx`, and the app
  catalog (`packages/web/src/i18n/catalogs/app.ts`).
- `bun.lock` and `THIRDPARTY.md` follow the peer change.
- `docs/openapi.yaml` (submit route), `docs/browser-checks.md` (two new
  checks), `docs/decisions.md` (audit index entry struck, FIELDS-19 entry
  corrected).
