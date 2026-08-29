<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     Rewriting the prose here would touch content from many prior changes
     for a purely stylistic reason, unrelated to any change this file
     documents. -->

# reporting-app Specification

## Purpose

The process-owner frontend, the reporting area of `packages/web`: a workspace package
mirroring the admin area of `packages/web`'s shape, reaching the engine only over the HTTP
wrapper, presenting the cycle-time, bottleneck and SLA views for one selected
process behind a shared date-range filter. Read-only throughout — it offers no
way to change anything in the engine.
## Requirements
### Requirement: The reporting frontend is a separate workspace package reaching the engine only over HTTP

The reporting frontend SHALL live at `packages/web/src/areas/reporting`, inside
the one workspace package that produces a browser bundle (see the
`unified-shell` capability), and SHALL NOT carry a build, typecheck or dev
server of its own. At runtime it SHALL reach the engine exclusively through the
HTTP wrapper and SHALL open no database connection of its own. At compile time
it SHALL import from the engine package only the definition-contract types it
renders, and SHALL NOT import the compile or expression-checking entry points
that the authoring area uses. It SHALL NOT consume the shared step-form
renderer, since it renders aggregated numbers and never a step form, and it
SHALL NOT import from another area's directory.

#### Scenario: The package builds and typechecks on its own

- **WHEN** the workspace build and typecheck commands run
- **THEN** `packages/web` builds and typechecks as one unit, with the reporting
  area needing no build of its own

#### Scenario: The package reaches the engine only over HTTP

- **WHEN** the area's runtime imports are inspected
- **THEN** none of them reaches the engine's database layer or its in-process
  runtime API directly

#### Scenario: The form renderer is not consumed

- **WHEN** the reporting area's imports are inspected
- **THEN** the shared step-form renderer is absent from them

#### Scenario: The authoring entry points stay out

- **WHEN** the reporting area's imports are inspected
- **THEN** neither the compile nor the expression-checking entry point appears

### Requirement: Access requires signing in and holding the reports role

The shell SHALL authenticate through the engine's existing login endpoint and
persist the resulting session under the one shared storage key (see the
`unified-shell` capability); the reporting area SHALL hold no storage key of
its own and SHALL send that session's token on every request. An
unauthenticated visitor SHALL be shown the login screen and no reporting data.
A signed-in actor lacking the reports role SHALL be shown an explicit refusal
naming the missing role rather than an empty report, a blank screen or a
generic failure.

#### Scenario: An unauthenticated visitor sees the login screen

- **WHEN** a visitor with no stored session opens any reporting screen
- **THEN** the login screen is shown and no reporting request is sent

#### Scenario: A signed-in actor without the role is told which role is missing

- **WHEN** an actor without the reports role signs in and the area receives
  `403` from a reporting route
- **THEN** the screen states that the reports role is required, and shows no
  report data

#### Scenario: A signed-in actor with the role reaches the views

- **WHEN** an actor holding the reports role signs in
- **THEN** the process picker is shown

#### Scenario: No second sign-in

- **WHEN** an actor holding the reports role is signed in under another area
  and navigates to `/reporting`
- **THEN** no login screen appears

### Requirement: A process is selected before any view is shown

The frontend SHALL require the process owner to select exactly one process
before showing any of the three views, mirroring the process-first shape the
authoring frontend's version and migration screens already use. The selected
process SHALL remain selected while switching between the three views, so
switching views does not re-ask for the process.

#### Scenario: No view renders before a process is chosen

- **WHEN** the app opens with no process selected
- **THEN** the process picker is shown and none of the three views renders

#### Scenario: The selection survives a view switch

- **WHEN** a process is selected and the process owner switches from one view
  to another
- **THEN** the same process stays selected and the new view loads for it

### Requirement: Every view shares one date-range filter defaulting to the last thirty days

The three views SHALL share one date-range control. When the process owner has
not chosen a range, the frontend SHALL send an explicit range covering the
last thirty days, computed in the frontend — it SHALL NOT omit the range and
rely on a server-side default. Changing the range SHALL reload the current
view for the same process, and the chosen range SHALL persist while switching
views.

The control speaks calendar days, the API speaks instants. A picked day SHALL
mean that day in the viewer's local timezone. The start bound SHALL be local
midnight of the picked day. The end bound SHALL be the last millisecond of
that local day.

Reading a bound back into the control SHALL yield the local calendar day of
that instant. A day sent through the control and read back SHALL return
unchanged, in every timezone.

The default range SHALL use the same day edges, so the control opens on a
range it redisplays unchanged.

#### Scenario: The default range is sent explicitly

- **WHEN** the process owner opens a view without touching the date control
- **THEN** the outgoing request carries explicit range bounds covering the last
  thirty days

#### Scenario: Changing the range reloads the current view

- **WHEN** the process owner changes the range
- **THEN** the current view reloads for the same process with the new bounds

#### Scenario: The range persists across a view switch

- **WHEN** the process owner sets a range and switches to another view
- **THEN** the new view loads with the same range

#### Scenario: A picked day covers that day in local time

- **WHEN** a process owner in a timezone ahead of UTC picks one day
- **AND** an instance of that process starts half an hour after local
  midnight on that day
- **THEN** the request bounds contain that instance's start instant

#### Scenario: The control redisplays the day the owner picked

- **WHEN** the control reads back a bound that it built from a picked day
- **THEN** the control shows the picked day, in every timezone

### Requirement: The three views present their numbers with their scope stated

The cycle-time view SHALL present the total-duration percentiles and the
per-step average dwell times, and SHALL state that both cover completed
instances only. The bottleneck view SHALL present the steps ranked by median
dwell time together with each step's current work-in-progress count, and SHALL
state that the ranking covers instances of every status while the
work-in-progress count ignores the date range. The SLA view SHALL present the
per-step breach rate and SHALL state that steps without a declared timer are
absent rather than passing.

A step SHALL be identified to the reader by its label from the process's
latest published version. A view whose result is empty SHALL say so in words
rather than rendering an empty table or an error.

#### Scenario: The cycle-time view states its completed-only scope

- **WHEN** the cycle-time view renders
- **THEN** it shows the percentiles and per-step averages, and states that both
  cover completed instances only

#### Scenario: The bottleneck view separates the ranking from the live count

- **WHEN** the bottleneck view renders
- **THEN** the ranking and the current work-in-progress count are
  distinguishable, and the differing scope of each is stated

#### Scenario: The SLA view explains an absent step

- **WHEN** the SLA view renders for a process where some steps declare no timer
- **THEN** it states that steps without a declared timer carry no SLA and are
  absent

#### Scenario: An empty result is stated in words

- **WHEN** a view's result contains no rows
- **THEN** the screen says so rather than showing an empty table or an error

### Requirement: The frontend offers no way to change anything

The reporting frontend's cycle-time, bottleneck and SLA views SHALL issue
only read requests. None of the three SHALL present a control that
publishes, cancels, migrates or edits a definition. None of the three SHALL
present a control that administers a user or changes an instance. None of
the three SHALL reach any route outside the reporting prefix other than the
login endpoint.

The report builder screen (the `reporting-data-tables` capability) is the
one exception this area carries. It SHALL confine every mutating request it
issues to the `/reporting/reports` routes. It SHALL NOT reach any other
route capable of a write. It SHALL NOT relax the rule above for the three
existing views. None of them gains a write path because the area now
carries one elsewhere.

#### Scenario: The screens issue only read requests

- **WHEN** a reviewer inspects every request the cycle-time, bottleneck or
  SLA screens can issue
- **THEN** each is a read request against a reporting route, apart from the
  login request

#### Scenario: The screens offer no mutating control

- **WHEN** a reviewer inspects the cycle-time, bottleneck or SLA screens
- **THEN** none presents a control that changes engine state

#### Scenario: The report builder's writes stay confined to its own routes

- **WHEN** a reviewer inspects every mutating request the report builder can
  issue
- **THEN** each targets a `/reporting/reports` route, and no mutating
  request reaches any route outside that set

### Requirement: The view-model computations are pure and tested

The percentile formatting, the ranking presentation and the default-range
computation SHALL live in pure modules that the components consume, matching
the convention the operator area's migration logic already uses, and SHALL
carry their own tests. Components themselves SHALL NOT be tested, per the
existing repository convention.

#### Scenario: The default range computation is tested against a fixed instant

- **WHEN** the default-range module is given a fixed reference instant
- **THEN** it returns bounds covering the thirty days before it, and a test
  asserts this

#### Scenario: The ranking presentation is tested independently of rendering

- **WHEN** the ranking module is given an unordered set of per-step medians
- **THEN** it returns them ordered longest-first, asserted without rendering a
  component

### Requirement: The reporting area renders its wording from a catalog

Every string the reporting area shows a process owner SHALL come from the
area's own catalog through `t(locale, key)`. The catalog SHALL carry an
English and a German map, and both maps SHALL declare the same key set.

The area SHALL render in the locale the shell holds. A locale change in the
account menu SHALL change the wording of every reporting screen without a
reload.

This covers the three view headings, the date range control's labels, the
scope note each view carries, the empty state, the waiting state and the
failure note.

#### Scenario: A view renders its catalog value

- **WHEN** a process owner opens a reporting view in a supported locale
- **THEN** its heading, controls, scope note and empty state read their values
  from the reporting catalog for that locale

#### Scenario: A locale change re-renders the area

- **WHEN** a process owner switches the account menu's language while a
  reporting view is open
- **THEN** that view re-renders its wording in the newly chosen locale

#### Scenario: Both locales declare the same keys

- **WHEN** the reporting catalog's English and German maps are compared
- **THEN** each declares the same key set, so no key falls back to a missing
  value

### Requirement: A duration reads its units from the catalog

The reporting area prints an elapsed time as a largest-fitting-unit duration,
such as `4.5 h`. It SHALL take each unit suffix from a catalog key rather than
from a literal. It SHALL print the decimal part with the locale's own
separator, so German reads `4,5`. It SHALL keep the figure in the mono face
and right-aligned in both locales.

The figure beside a measuring rule SHALL stay the content. The rule itself
carries no wording.

#### Scenario: A duration suffix follows the locale

- **WHEN** a view prints a median or an average as a duration
- **THEN** each unit suffix in it comes from a catalog key for the chosen
  locale

#### Scenario: A decimal separator follows the locale

- **WHEN** a view prints a duration with a decimal part in German
- **THEN** the figure carries a comma, not a full stop

#### Scenario: A duration column stays aligned in either locale

- **WHEN** the same table of durations is shown in English and in German
- **THEN** the figures stay right-aligned in both

### Requirement: A sentence carrying a count is one catalog key per form

The reporting area states how many instances a view excludes. It SHALL NOT
assemble that sentence from fragments. Each grammatical form SHALL be one
catalog key holding the whole sentence, with the count substituted into it.

A translator has to see the whole sentence. A count-bearing sentence has a
singular and a plural form in English and in German alike.

#### Scenario: A singular count reads as one sentence

- **WHEN** exactly one instance is excluded
- **THEN** the view shows the singular form's catalog value with the count
  substituted into it

#### Scenario: A plural count reads as one sentence

- **WHEN** more than one instance is excluded
- **THEN** the view shows the plural form's catalog value with the count
  substituted into it
