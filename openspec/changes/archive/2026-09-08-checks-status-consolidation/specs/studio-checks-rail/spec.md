## MODIFIED Requirements

### Requirement: The rail adds a consolidated view; a field's checks stand at their zones

`IssueList` SHALL keep rendering its existing per-entity views. Those views
sit under the process header, on a step page, and on a path row. The Checks
tab is one more consolidated view over the same `validation.issues[]` array.
It does not replace those placements.

The Fields tab is the one placement that changes. A field's own check SHALL
stand at the zone the check names, per the `studio-app` capability's zone
requirement. The Fields tab SHALL mount no `IssueList` gathering that field's
checks in one place.

The reason the old placement existed still holds, and the zone rule answers
it. A check inside one section of a field hid whenever the author opened
another section. Zones open none, so no check hides.

#### Scenario: An issue shows in both its entity placement and the rail

- **WHEN** a path guard carries a CEL issue
- **THEN** that issue stands in the path's own `IssueList` placement and in
  the Checks tab's CEL group

#### Scenario: A field's check shows at its zone and in the rail

- **WHEN** a field carries a validation issue
- **THEN** the check stands in the definition half's "Validation" zone
- **AND** the Checks tab's own count includes it

#### Scenario: No zone hides a field's check

- **WHEN** a field carries checks naming two different zones
- **THEN** both checks stand at once, and neither waits on the author opening
  anything

## REMOVED Requirements

### Requirement: The rail collapses to a one-line issue-count summary when the developer selects a step

**Reason**: This change removes the area nav's Checks control. Live-tested
against the tab row's own Checks tab: the control opened that same tab, and
did nothing else. `ChecksRail`'s `collapsed` form existed only to serve that
one site. It carried a held-back indicator, a state dot and its own
accessible-name sentence. That site is gone now.

**Migration**: An author reads the Checks tab's own count and color instead.
See `studio-process-tabs`'s "A tab carries the count of what it holds"
requirement. See its "The area nav carries no draft control" requirement
too.

The held-back indicator this requirement described for the collapsed form
stays available. It now stands in full, per-group form on the Checks tab
body itself. This removal drops only the retired one-line summary. It does
not drop held-back reporting from the rail's full list. That stays covered
by this capability's own "The rail reports the held-back state of a
structurally invalid draft" requirement.

### Requirement: The rail docks its collapsed summary on the panels screen

**Reason**: This requirement recorded the collapsed summary's migration
history. That history ran from an earlier panels screen into the area nav.
The collapsed form itself is gone now. No summary remains to dock anywhere.
No placement history remains to carry forward.

**Migration**: See the removal above of "The rail collapses to a one-line
issue-count summary when the developer selects a step." See also
`studio-process-tabs`'s "A tab carries the count of what it holds"
requirement.

### Requirement: The checks rail renders from compiled styles

**Reason**: This requirement asserted pixel parity against a stylesheet. An
earlier migration already deleted that stylesheet. The assertion covered
each of the rail's two rendering states.

This change removes the collapsed state. The requirement's own premise,
"both states," no longer holds. Nothing in this change adds a replacement
assertion for the one remaining state.

That coverage was always a one-time migration check. It was never an
ongoing behavior contract. The remaining full-list state's behavior stays
specified by this capability's other requirements: grouping, held-back
reporting, and the consolidated view.

**Migration**: None. No requirement replaces this one. This change leaves
the full, grouped-by-source list's functional behavior unaffected. That
behavior stays covered by this capability's other requirements. This repo's
mandatory browser check confirms its visual correctness, the way it
confirms any other studio screen's.
