## Context

See proposal.md, section Why, for the two faults.

Two constraints shape the work. The devcontainer runs UTC, so a test that
reads the ambient timezone proves nothing there. And `reportingLogic.ts` is
deliberately pure. Its header calls the module "pure view-model helpers ...
everything a test can assert lives here, components stay thin". The fix stays
in that module.

`defaultRange` already takes an injectable `now`. The reporting-app spec
requires a test against a fixed instant, in its testability requirement. That
is the shape to follow.

## Goals / Non-Goals

**Goals:**

- A picked day covers that day where the process owner sits.
- A bound read back into the control shows the day the owner picked.
- The tests fail in UTC when the fault returns.

**Non-Goals:**

- A timezone selector. The viewer's own timezone is the answer. A selector is
  a product decision nobody has asked for.
- Server-side day handling. `src/engine/reporting.ts` compares two instants
  against `instances.startedAt`. It needs no notion of a day.
- Storing a timezone beside a saved range. Nothing saves a range today. It
  lives in `root.tsx:36` React state for the session.
- Historical timezone correctness across a DST shift inside the picked day.
  The platform's own `Date` handles that, and this change adds no arithmetic.

## Decisions

**Build the bounds with the local `Date` constructor.**
`new Date(y, m - 1, d)` is local midnight by definition. It works on every
platform, with no offset arithmetic and no timezone argument. The end bound is
`new Date(y, m - 1, d, 23, 59, 59, 999)`.

Alternatives considered:

- *Compute the offset and subtract it.* `getTimezoneOffset()` returns the
  offset for one instant. Applying it to a different instant breaks across a
  DST shift. That is the case a Swiss user meets twice a year.
- *Carry an IANA timezone through the module.* Three functions would take one
  more argument. Somebody would then decide where that name comes from. The
  viewer's own timezone is already what the local constructor reads.

**Read the day back with the local getters.** `toDateInput` uses
`getFullYear`, `getMonth` and `getDate`, zero-padded. It drops
`iso.slice(0, 10)`, which reads the UTC day. That slice is the second fault.

**Test the round trip, not a literal.** The three current assertions compare
against literal UTC strings. That is why they pass while the code is wrong. A
round-trip assertion holds in every timezone:

```
toDateInput(fromDateInput(day, "start")) === day
toDateInput(fromDateInput(day, "end")) === day
```

That form does not fail against the current code, in any zone. Task 1.3 ran it
and proved so. The two old conversions are wrong in the same direction.
`fromDateInput` writes UTC midnight, `toDateInput` reads the UTC day, and they
cancel. The round trip guards a later one-sided change. It does not catch
today's fault.

The companion is therefore the proof, not the garnish. It pins `TZ` to a zone
ahead of UTC. It then asserts that the start bound of a summer day is 22:00 on
the previous day in UTC. Against the old code it failed with exactly that
difference. It skips visibly when `TZ` is unset, matching the
`test.skipIf(!DB)` convention, so a run without the zone cannot look like
coverage.

Alternative considered: run the whole suite under a non-UTC `TZ`. That hides
the fault behind a runner setting, and every other test in the repo moves with
it.

**Snap `defaultRange` to the same edges.** Today it returns two raw instants
derived from `now`. The control therefore opens on a range whose bounds do not
survive a redisplay.

The snapped window is not thirty days. Its start is local midnight of the day
thirty days back. Its end is the last millisecond of the local day of `now`.
Each end therefore grows by part of a day. The span reaches thirty-one local
days less one millisecond.

The base requirement asks for bounds "covering the thirty days before it". A
superset covers them, so the wider window satisfies that scenario. It needs no
second delta.

One thing it does not satisfy is `reporting-reportingLogic.test.ts:26`. That
line asserts the span equals `DEFAULT_RANGE_DAYS` exactly. Task 3.2 replaces
the assertion with the bound this decision produces.

## Risks / Trade-offs

**The companion test depends on the runner honoring `TZ`.** → It runs as its
own process, with `TZ` set in the command. It never assigns `process.env.TZ`
mid-run, which `Date` may already have read. The task states that.

**A plain suite run skips the proving test.** → Accepted, and unavoidable. The
container runs UTC, and inside a UTC process no assertion can tell a local day
from a UTC day. The verification group therefore runs the reporting test file
a second time with `TZ=Europe/Zurich`. The skip stays visible in the count, so
a reader sees the gap rather than a false green.

**A range that spans a DST shift has 23 or 25 hours in one of its days.** →
Correct, and intended. The picked day is the local day, whatever length it has
that year.

**Local midnight is missing one day a year in some zones.** → The constructor
returns 01:00 instead. Where the DST shift lands at midnight, the window loses
that hour. Zurich shifts at 02:00, so the case does not arise there. Elsewhere
it costs one hour once a year. The platform resolves that boundary the same
way for every other local-time consumer.

**Someone reads the new tests as timezone-independent throughout.** → The
round-trip pair is. The companion is not, by design, and its name states the
timezone it pins.

## Migration Plan

No migration. No persisted state carries a range. `root.tsx:36` holds it in
React state for the session, and a reload recomputes the default.

A process owner with a view open when the new bundle ships keeps the old range
until they reload. Both ranges are valid inputs to the API, which compares
instants.

Rollback is a revert of the commit.

## Open Questions

None.
