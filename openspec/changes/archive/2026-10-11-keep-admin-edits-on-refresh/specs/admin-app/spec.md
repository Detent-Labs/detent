# Spec Delta

## MODIFIED Requirements

<!-- antislop: allow passive-voice trailing-negation - a MODIFIED heading repeats the live name -->
### Requirement: Data is refreshed on demand, not pushed

Every screen SHALL offer an explicit refresh control and SHALL refetch when the
window regains focus. The admin area SHALL NOT poll on a timer, open a
websocket, or use server-sent events.

The Users screen and the Groups screen load the whole account directory. Each
SHALL refetch on focus only when at least 30 seconds have passed since it last
requested its data. Their refresh control SHALL always refetch.

#### Scenario: Refocusing refetches

- **WHEN** the operator switches away from and back to the admin window on a
  screen other than Users or Groups
- **THEN** the current screen refetches its data

#### Scenario: No background polling

<!-- antislop: allow passive-voice - the delta copies this scenario from the live spec verbatim -->
- **WHEN** the admin area is left open and untouched
- **THEN** no further requests are issued

#### Scenario: A quick refocus does not reload the directory

- **WHEN** the operator opens the Users screen, switches away, and returns 10
  seconds after the screen's last request
- **THEN** the screen sends no request

#### Scenario: A late refocus reloads the directory

- **WHEN** the operator switches away from the Groups screen and returns 45
  seconds after the screen's last request
- **THEN** the screen refetches its groups, accounts and processes

#### Scenario: The refresh control is never throttled

- **WHEN** the operator presses Refresh on the Users screen 5 seconds after
  its last request
- **THEN** the screen refetches the directory

#### Scenario: The Migrations screen refreshes like the others

- **WHEN** the operator opens the Migrations screen
- **THEN** the screen offers a refresh control
- **AND** pressing it, or returning to the window, refetches the process list
  and the version list of the picked process

#### Scenario: A refetch keeps the Migrations picks

- **WHEN** the operator has picked a process, a `fromVersion` and a
  `toVersion`, and the screen refetches
- **THEN** the three picks stay selected

## ADDED Requirements

### Requirement: A refetch keeps unsaved input in the data-list and UI-strings editors

The data list detail screen and the UI-strings screen SHALL keep the
operator's unsaved input through a refetch. A refetch comes from focus or from
the refresh control. It SHALL change only the screen's copy of the server
data. The screen SHALL fill its inputs from the server on the first load,
after its own save, and on discard. The data list detail screen SHALL also
refill its inputs when the operator switches the interface language. Each
value's label reads in that language.

#### Scenario: Refocusing keeps typed value rows and a column rename

- **WHEN** the operator adds value rows and renames a column on the data list
  detail screen
- **AND** the window regains focus
- **THEN** the added rows and the renamed column stay in the inputs

#### Scenario: Refocusing keeps typed overrides

- **WHEN** the operator types overrides into two inputs on the UI-strings
  screen
- **AND** the window regains focus
- **THEN** both inputs keep the typed text

#### Scenario: An explicit refresh keeps typed input

- **WHEN** the operator holds unsaved input and presses the refresh control
- **THEN** the inputs keep the typed text

#### Scenario: Without unsaved input a refetch shows the server copy

- **WHEN** the operator has typed nothing and a colleague changes the list
- **AND** the window regains focus
- **THEN** the screen shows the changed server copy
- **AND** the screen shows no callout

#### Scenario: A failed refetch keeps unsaved input

- **WHEN** the operator holds unsaved input and a refetch fails
- **THEN** the screen shows the error where the data would sit
- **AND** the inputs keep the typed text

#### Scenario: Switching language refills the data list inputs

- **WHEN** the operator holds unsaved rows on the data list detail screen
- **AND** the operator switches the interface language
- **THEN** the inputs show the server copy in the chosen language

#### Scenario: Saving fills the inputs from the server again

- **WHEN** the operator saves with success
- **THEN** the inputs show the saved server copy
- **AND** the screen flags no unsaved input

### Requirement: The editors name a changed server copy beside unsaved input

The data list detail screen and the UI-strings screen SHALL show a warning
callout above the editable content. The callout appears in one case only. The
operator holds unsaved input, and the server copy differs from the copy that
input started from. The callout SHALL offer a button that drops the input and
loads the server copy. The callout SHALL stay absent while the two copies
match.

#### Scenario: A changed server copy raises the callout

<!-- antislop: allow passive-voice - the owner ruling of 2026-10-11 fixes this wording -->
- **WHEN** the operator holds unsaved input on the data list detail screen
- **AND** a colleague adds a value to the list
- **AND** the window regains focus
- **THEN** the screen shows "The server copy changed while you were editing.
  Your edits are kept. Saving replaces the server values with yours."
- **AND** the screen offers the button "Discard my edits and load the server
  copy"
- **AND** the inputs keep the typed text

#### Scenario: The UI-strings callout names its own save rule

<!-- antislop: allow passive-voice - the owner ruling of 2026-10-11 fixes this wording -->
- **WHEN** the operator holds unsaved overrides
- **AND** a colleague changes a stored override
- **AND** the window regains focus
- **THEN** the screen shows "The server copy changed while you were editing.
  Your edits are kept. Saving overwrites the stored wording of the keys you
  edited."

#### Scenario: An unchanged server copy raises no callout

- **WHEN** the operator holds unsaved input
- **AND** the window regains focus while the server copy equals the starting
  copy
- **THEN** the screen shows no callout

#### Scenario: Discarding loads the server copy

- **WHEN** the callout shows and the operator presses "Discard my edits and
  load the server copy"
- **THEN** the inputs show the server copy
- **AND** the callout disappears

#### Scenario: The callout follows the chosen locale

- **WHEN** the operator has chosen German and the callout shows
- **THEN** the callout text and the button read in German

### Requirement: A list shows only its newest answer

The Instances screen, the Outbox screen and the Migrations version list SHALL
show the answer to their most recent request. An answer to an earlier request
SHALL NOT replace the list. It SHALL NOT change the screen's counts or report
an error.

#### Scenario: A late answer for an earlier filter never shows

- **WHEN** the operator types `proc_expense` into the process filter
- **AND** the answer for `proc_expens` arrives after the answer for
  `proc_expense`
- **THEN** the list shows the answer for `proc_expense`

#### Scenario: A late page for an earlier filter never joins the list

- **WHEN** the operator presses "Load more"
- **AND** the operator changes a filter before the page arrives
- **THEN** the filtered list does not receive that page

#### Scenario: The outbox counts follow the newest answer

- **WHEN** a slow answer for an earlier outbox filter arrives after the answer
  for the current filter
- **THEN** the status counts stay those of the current filter

#### Scenario: A request that fails late raises no error

- **WHEN** an earlier request fails after a newer request succeeded
- **THEN** the screen shows no error

#### Scenario: A late version list never shows

- **WHEN** the operator picks process A, then process B
- **AND** the version list of A arrives after the version list of B
- **THEN** the version choices are those of B
