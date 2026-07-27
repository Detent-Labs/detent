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

### Requirement: First-available-locale-text lookup shares one implementation

Every Player-side component that renders the first available translation
of a `LocalizedText` value (currently `FieldInput` for field/option labels,
`PlayerView` for the current step's label) SHALL do so through one shared
function, not independently-maintained, structurally identical copies.

#### Scenario: A field label with only a non-base-locale entry still renders

- **WHEN** `FieldInput` renders a field or option whose `label` has only a
  non-English (or non-current-locale) entry
- **THEN** the shared lookup returns that entry's text rather than an
  empty string

#### Scenario: An empty or absent LocalizedText value falls back safely

- **WHEN** the shared lookup is called with `undefined` or an empty
  `LocalizedText` record
- **THEN** it returns `""`, matching pre-consolidation behavior for both
  call sites
