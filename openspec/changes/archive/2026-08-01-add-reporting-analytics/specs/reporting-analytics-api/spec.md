<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     Rewriting the prose here would touch content from many prior changes
     for a purely stylistic reason, unrelated to any change this file
     documents. -->

## Purpose

The process-owner-facing read surface: cycle time, per-step bottlenecks, and
SLA adherence for one selected process, computed live from the instance,
history and runtime-event records the engine already keeps. It answers "where
does this process lose time, and does it meet its own SLA?" — a different
question from the operator-facing `admin-operations-api`, over a different
data shape, for a different audience.

## ADDED Requirements

### Requirement: A per-instance step timeline is reconstructed from the existing record

The engine SHALL derive, for one instance, an ordered timeline of
`(stepId, enteredAt)` pairs consisting of the initial step of the version the
instance is pinned to at `instances.startedAt`, followed by every
`HistoryEntry` for that instance in `transitionSeq` order, contributing
`toStepId` at `at`. This timeline SHALL be the single source for both the
per-step dwell numbers in the cycle-time view and the bottleneck ranking, so
the two views cannot disagree about how long an instance sat in a step.

A `HistoryEntry` whose `cause` is `migration` and whose `toStepId` equals the
step of the preceding timeline entry SHALL NOT open a new timeline entry: a
migration that leaves the instance on the same step is a relocation of the
definition under it, not a re-entry, and treating it as one would split a
single stay into two traversals and halve every rate computed over them. This
suppression SHALL apply to the `migration` cause only. A transition whose
`cause` is `user`, `automatic` or `timer` and whose target equals its source
is a genuine self-loop — it re-arms the step's timers and resets the entry
instant — and SHALL yield two traversals.

Every consecutive pair of timeline entries SHALL yield one completed
traversal: the step id of the earlier entry, with a duration equal to the
later entry's timestamp minus the earlier entry's timestamp. The final entry
of a timeline SHALL yield no traversal, because the instance has not left that
step within the record. No traversal duration SHALL be estimated against the
current wall-clock time.

Cancellation writes a transition to the cancel sink, so the step an instance
occupied when it was cancelled SHALL yield a traversal ending at the
cancellation instant — the instance did occupy that step for that long, and a
bottleneck reading of "how long do instances sit here" counts an abandoned
wait as time spent. The cancel sink itself SHALL yield no traversal and SHALL
NOT appear in any view, being an engine-supplied sink rather than an authored
step.

Traversals SHALL aggregate by step `id` across every published version of the
selected process, `id` being the stable reference anchor across versions. A
step present in more than one version SHALL contribute to a single aggregate
row.

#### Scenario: A completed instance yields one traversal per step it left

- **WHEN** an instance is created and transitions from its initial step through
  two further steps to a terminal step
- **THEN** the timeline yields a traversal for the initial step and for each
  intermediate step, each with a duration equal to the gap between consecutive
  entry timestamps, and no traversal for the terminal step

#### Scenario: A running instance contributes no traversal for its current step

- **WHEN** an instance has entered a step and has not transitioned out of it
- **THEN** that step receives no traversal from this instance, and no duration
  is computed against the current time

#### Scenario: A cancelled instance contributes the step it was cancelled in

- **WHEN** an instance passes through two steps and is then cancelled while in
  a third
- **THEN** all three steps receive a traversal, the third ending at the
  cancellation instant, and the cancel sink receives none

#### Scenario: A migration onto the same step does not split the stay

- **WHEN** an instance sits in a step, is migrated to a version that maps that
  step to itself, and later leaves it
- **THEN** the step receives one traversal spanning the whole stay, not two

#### Scenario: A migration onto a different step closes the old step's stay

- **WHEN** an instance sits in a step and is migrated to a version that maps it
  onto a different step
- **THEN** the original step receives a traversal ending at the migration
  instant, and the new step's stay begins there

#### Scenario: A self-loop transition is two traversals

- **WHEN** an instance takes a path whose target is its own source step
- **THEN** that step receives two traversals, not one

#### Scenario: The same step id aggregates across versions

- **WHEN** a process has two published versions that both declare a step with
  the same `id`, and instances of each version have traversed it
- **THEN** the traversals from both versions aggregate into one row keyed by
  that step `id`

#### Scenario: A revisited step contributes one traversal per visit

- **WHEN** an instance enters a step, leaves it, and later re-enters and leaves
  it again
- **THEN** that step receives two traversals from that instance, each with its
  own duration

### Requirement: Every reporting view is scoped to one process and a date range

Each reporting view SHALL take exactly one process id and an optional
inclusive date range, and SHALL consider only instances of that process whose
`instances.startedAt` falls within the range. The range SHALL bound the
instances scanned, never the individual history timestamps, so an instance
that starts inside the range and finishes after it closes is fully counted.
No view SHALL combine data from more than one process. When no range is
supplied the server SHALL apply no implicit range of its own.

Every view SHALL compute on each request from the live record, with no cached
result, no precomputed rollup and no background aggregation job.

#### Scenario: An instance started before the range is excluded

- **WHEN** a cycle-time, bottleneck or SLA view is requested with a range whose
  start is after an instance's `startedAt`
- **THEN** that instance contributes to none of the three views

#### Scenario: An instance started inside the range but still running is in range

- **WHEN** an instance starts inside the requested range and has not finished
- **THEN** it is in range, and each view applies its own status rule to decide
  what the instance contributes

#### Scenario: A repeated request reflects a state change immediately

- **WHEN** an instance transitions between two otherwise identical requests for
  the same view, process and range
- **THEN** the second response reflects the transition

### Requirement: The cycle-time view reports total duration percentiles and per-step averages

The cycle-time view SHALL report, over the in-range instances of the selected
process whose `status` is `completed` and over no others:

1. the p50, p90 and p99 of total instance duration, measured from
   `instances.startedAt` to the timestamp of the `HistoryEntry` that reached
   the terminal step; and
2. the average dwell time per step, computed from the traversals of those same
   completed instances, presented in the workflow order declared by the
   process's latest published version.

A cancelled or faulted instance SHALL contribute to neither number, since it
did not finish its normal path. When no completed instance falls in range the
view SHALL return an empty result rather than an error.

An instance created directly onto a terminal step — a legitimate shape, which
the engine records as `completed` at creation with no transition at all —
SHALL be excluded from the percentiles rather than contributing a zero. It
never ran, and a population of such instances would report a cycle time of
zero for a process that has none.

#### Scenario: Percentiles are computed over completed instances only

- **WHEN** the in-range set holds completed, cancelled, faulted and running
  instances
- **THEN** the reported p50/p90/p99 are computed from the completed instances
  alone

#### Scenario: A known distribution yields the expected median

- **WHEN** an odd number of completed instances with known, distinct total
  durations is in range
- **THEN** the reported p50 equals the middle duration of that set

#### Scenario: Per-step averages follow the latest version's workflow order

- **WHEN** the per-step breakdown is requested for a process whose latest
  published version declares its steps in a given order
- **THEN** the per-step rows are returned in that order

#### Scenario: An empty range returns an empty result

- **WHEN** no completed instance of the process falls in the requested range
- **THEN** the view returns an empty result and not an error

#### Scenario: An instance created onto a terminal step contributes no zero

- **WHEN** an instance is created for a process whose initial step is terminal,
  so it is `completed` with no transition recorded
- **THEN** it contributes to no percentile, and the reported figures are those
  of the instances that actually ran

### Requirement: The bottleneck view ranks steps by median dwell and reports current work in progress

The bottleneck view SHALL rank the selected process's steps by median
traversal duration, descending, computed over every in-range instance
regardless of its status — a step's own speed being observable as soon as an
instance has passed through it. This scope SHALL be wider than the cycle-time
view's completed-only scope by design, and the two views' per-step numbers
SHALL NOT be reconciled with each other.

Alongside the ranking the view SHALL report, per step, the current count of
`running` instances of that process whose `currentStepId` is that step. This
count SHALL ignore the date range, since it answers a present-tense question.

A step with no traversal in range SHALL be absent from the ranking; its
current work-in-progress count SHALL still be reported if any running instance
is parked in it.

#### Scenario: Steps are ordered by descending median dwell

- **WHEN** three steps have known, distinct median traversal durations in range
- **THEN** they appear in the ranking from longest median to shortest

#### Scenario: A cancelled instance's traversals count toward the ranking

- **WHEN** an instance passes through a step and is later cancelled
- **THEN** that step's traversal from the instance is included in the median

#### Scenario: The work-in-progress count ignores the date range

- **WHEN** a running instance parked in a step started before the requested
  range
- **THEN** it is counted in that step's current work-in-progress figure and
  contributes nothing to the median ranking

#### Scenario: Only running instances count as work in progress

- **WHEN** an instance is `completed`, `cancelled` or `faulted`
- **THEN** it contributes to no step's current work-in-progress count

### Requirement: The SLA view derives breach rates from recorded timer firings

The SLA view SHALL report, per step of the selected process, a breach rate
equal to the number of traversals during which one of that step's declared
timers fired, divided by the total number of traversals of that step in range.

A step's threshold SHALL be its declared reminder or escalation timer, never a
value supplied by the caller: the view SHALL accept no threshold parameter. A
step declaring no timer SHALL carry no SLA and SHALL be absent from this view
entirely, rather than appearing with a zero or null rate.

A firing SHALL be recognised in both of the two forms the engine records,
because a timer that moves the instance and a timer that does not are
recorded differently and only the second produces a runtime event:

1. **A reminder timer** — one declaring actions and no target path — enqueues
   its actions without moving the instance and records a `timer.fired` runtime
   event carrying its timer id. It SHALL be recognised from that event.
2. **A transition timer** — one declaring a target path, the shape an
   escalation uses — forces a transition down that path and records a
   `HistoryEntry` whose cause is `timer` and whose path id is that target
   path. It records no `timer.fired` event. It SHALL be recognised from that
   history entry, by matching the entry's path id against the target path of
   a timer declared on the step being left.

Recognising only the first form SHALL be treated as incorrect rather than
incomplete: a step whose SLA is expressed as an escalation would otherwise
report a breach rate of zero over a full denominator, asserting that a step
which breached on every traversal met its SLA every time.

The engine SHALL resolve each version referenced by an in-range instance and
build, per version, a mapping from timer id to the step declaring it and from
timer target path to the step declaring that timer. A runtime event SHALL be
attributed to the traversal whose entering transition sequence equals the
event's own sequence — an event records the sequence in force and never
advances it, so equality is exact and attributes a firing to the visit during
which it occurred even when an instance visits the same step more than once. A
transition-timer firing is attributed to the traversal the history entry
itself closes.

A traversal SHALL count as breached at most once, however many of the step's
timers fired during it.

#### Scenario: A reminder firing counts that traversal as breached

- **WHEN** an instance sits in a step long enough that the step's reminder
  timer fires, and then leaves the step
- **THEN** that traversal counts as breached in the step's rate

#### Scenario: An escalation firing counts that traversal as breached

- **WHEN** an instance sits in a step long enough that the step's transition
  timer fires and moves it down the timer's target path
- **THEN** that traversal counts as breached in the step's rate, even though
  no `timer.fired` event was recorded

#### Scenario: A step whose only timer is an escalation still reports a rate

- **WHEN** the SLA view is requested for a process whose step declares one
  timer, a transition timer, which has fired on some traversals and not others
- **THEN** the step's reported rate is the fraction of traversals on which it
  fired, and is neither zero nor absent

#### Scenario: Two timers firing in one traversal count as one breach

- **WHEN** a step declares both a reminder and a transition timer and both fire
  during one traversal
- **THEN** that traversal contributes one breach, not two

#### Scenario: A step whose timer never fired is not breached

- **WHEN** an instance traverses a timer-bearing step without the timer firing
- **THEN** that traversal counts toward the denominator and not the numerator

#### Scenario: A step with no declared timer is absent

- **WHEN** the SLA view is requested for a process containing a step that
  declares no timer
- **THEN** that step appears nowhere in the response

#### Scenario: A firing is attributed to the visit it occurred in

- **WHEN** an instance visits a timer-bearing step twice and the timer fires
  only during the second visit
- **THEN** the step's rate counts one breached traversal out of two

#### Scenario: The view accepts no caller-supplied threshold

- **WHEN** a request carries an SLA threshold parameter
- **THEN** it does not change any reported rate

### Requirement: The reporting routes expose the three views and the process list

The HTTP surface SHALL expose four read-only routes under `/reporting`: a
process listing, and one route per view taking the process id in the path and
the optional range bounds as ISO date query parameters. Every route SHALL be a
`GET`, SHALL mutate nothing, and SHALL be gated by the reports role as
required by the `authorization` capability. The process listing SHALL return
the same processes the existing engine-wide listing returns.

A request naming a process id that does not exist SHALL return `404`. A
request whose range bounds are not parseable ISO dates, or whose start is
after its end, SHALL return `400` and run no query.

#### Scenario: Each view is reachable over HTTP

- **WHEN** an actor holding the reports role requests the cycle-time,
  bottleneck or SLA route for an existing process
- **THEN** each returns `200` with that view's result

#### Scenario: An unknown process id is a 404

- **WHEN** an actor holding the reports role requests a view for a process id
  that does not exist
- **THEN** the response is `404`

#### Scenario: A malformed range is rejected

- **WHEN** a request carries a range bound that is not a valid ISO date, or a
  start later than its end
- **THEN** the response is `400` and no query runs

#### Scenario: The routes mutate nothing

- **WHEN** any `/reporting/*` route is called
- **THEN** no instance, definition, draft, outbox row or timer changes state
