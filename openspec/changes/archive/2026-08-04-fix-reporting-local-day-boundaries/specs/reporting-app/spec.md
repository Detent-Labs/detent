## MODIFIED Requirements

<!-- antislop: allow-file passive-voice sentence-length em-dash -->
<!-- The block below reproduces the wording of the requirement it replaces,
     which archive needs in full. Rewriting the carried-over prose would lose
     the match against openspec/specs/reporting-app/spec.md. Only the three
     added paragraphs and the two added scenarios are new. -->

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
