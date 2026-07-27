# player-store-consolidation

## Purpose

A structural (mechanism-level) constraint on `packages/editor/src/player/`:
two independent duplications collapsed behind one implementation each,
bundled under one capability the way [[registry-error-consolidation]]
bundled two related registry-validation mechanisms. External behavior
(loading/error state transitions, session-logout timing, rendered "first
value" text) is unaffected — both are pure, behavior-preserving
extractions. This capability exists purely to keep the "don't re-duplicate
this" constraint from silently regressing. Added for
`PONYTAIL-AUDIT.md`'s 2026-07-26 scan, findings 4 and 5.

## Requirements

### Requirement: Player store request lifecycle shares one implementation

The Player store SHALL drive every asynchronous call (`login`,
`createInstance`, `openInstance`, `refresh`, `submit`) through one shared
request-lifecycle wrapper (`run`) that sets loading state, clears prior
error state, awaits the call, and resolves loading/error state on
completion — not independently-maintained, structurally identical
try/catch/finally copies. Whether a `401` response triggers session logout
SHALL be a parameter to the shared wrapper, not a separate wrapper
implementation. External behavior (loading/error state transitions for
every call, session logout only on a non-login 401) SHALL be unchanged
from pre-consolidation behavior.

#### Scenario: A non-login call's 401 logs the session out

- **WHEN** any Player store call other than `login` (e.g. `submit`)
  receives a 401 response
- **THEN** the shared wrapper discards the session token and clears the
  current instance/view, without setting a visible error

#### Scenario: Login's own 401 is reported as a generic failure

- **WHEN** `login` itself receives a 401 (wrong credentials)
- **THEN** the shared wrapper sets the mapped `ClientError` as the visible
  error and does NOT treat it as a session-expiry logout

#### Scenario: Loading state brackets every call uniformly

- **WHEN** any Player store call is in flight
- **THEN** `loading` is `true` for its duration and `false` once it
  settles (success or error), and `error` is cleared at the start of every
  call, regardless of which call it is

### Requirement: Locale-text lookup is NOT consolidated — two divergent implementations exist

This requirement documents the current, unconsolidated state rather than an
achieved one; it is carried here as a known gap this capability's name
implies is closed but isn't. `PlayerView.tsx` SHALL resolve the current
step's label via `firstLocalizedText`
(`packages/editor/src/player/locale-text.ts`, `Object.values(value)[0]`) —
locale-blind, it returns whichever entry happens to be first regardless of
the active locale. Field/option labels are no longer Player-owned code at
all (they moved to the shared `form-ui` package, see `editor-player`'s
"Field rendering is delegated to the shared form-ui package"), and
`form-ui`'s `FieldInput` SHALL resolve them via
`resolveText`/`resolveLocalizedText` (`packages/form-ui/src/locale.ts`),
which IS locale-and-baseLocale-aware. Neither implementation SHALL call the
other today, and no shared function exists across the two. Fixing this —
either by having `PlayerView` call `form-ui`'s locale-aware resolver, or by
deliberately deciding the step-label case doesn't need locale-awareness — is
open follow-up work, not something this spec should claim is done until it
actually is.

#### Scenario: A field label with only a non-base-locale entry still renders

- **WHEN** `form-ui`'s `FieldInput` renders a field or option whose `label`
  has only a non-English (or non-current-locale) entry
- **THEN** `resolveText` returns that entry's text rather than an empty
  string

#### Scenario: PlayerView's step-label lookup is locale-blind

- **WHEN** `PlayerView` renders the current step's label via
  `firstLocalizedText`
- **THEN** it returns whichever locale entry is first in the object, not
  necessarily the entry for the active locale — unlike `form-ui`'s resolver
