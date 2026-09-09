## MODIFIED Requirements

### Requirement: Publish states a blocked draft's reason before the click

The loaded draft may report `canPublish: true` while the studio's own
validation finds a blocking issue. In that case, the Publish control SHALL
stay available, exactly as it does today. The screen SHALL state in visible
text that a blocking issue stands in the way.

That text SHALL render in flow, on the header bar's own row, ahead of the
action cluster. It SHALL NOT render beneath the control. It SHALL NOT cross
the header bar's own bottom border. A line that crosses that border reads as
a caption of the row below it. The border then reads as a strike through the
sentence.

Rendering it SHALL move no control in the header bar. An auto-margin pins the
action cluster's trailing edge, so the cluster grows leftward. The text SHALL
render inside that cluster, ahead of its controls. That placement is what
holds every control still.

The text SHALL wrap with the cluster it belongs to. The cluster SHALL keep
its own auto-margin at every width. A reason placed beside the cluster takes
that margin with it. The controls then strand at the row's leading edge, on
every width where the row wraps.

The control SHALL reference that text through `aria-describedby`, the same
pattern the permission-denied case already uses. That reference SHALL be the
whole binding. The reason renders elsewhere in the row, so no wrapper holds
the two together.

This case SHALL NOT set `aria-disabled`. The control stays fully operable. A
developer who clicks through still reaches the confirmation dialog. That
dialog restates the same warning, per this capability's own dialog
requirement.

The blocked reason SHALL take the refusal tone. It names an issue the draft
itself carries, the same fact the Checks count colors. The permission-denied
reason SHALL keep the muted tone. That one names an administrative fact about
the actor instead. Both SHALL keep one register, so the two refusals of one
control read alike.

Where the draft's issues are all advisory, or the draft is clear, this text
SHALL NOT render. The control renders exactly as it does today in either
case.

A draft reporting `canPublish: false` SHALL keep rendering per this
capability's existing unavailable-control requirement, whatever its issues.
That requirement's own reason renders in this same place. This requirement's
own text SHALL NOT also render there. A caller without the permission never
reaches this requirement's condition.

#### Scenario: A blocked-but-permitted draft warns before the click

- **WHEN** a draft loads with `canPublish: true` and one blocking issue
- **THEN** the Publish control renders available, with no `aria-disabled`
- **AND** text naming that blocker renders on the header bar's row, as the
  action cluster's leading item
- **AND** that text takes the refusal tone
- **AND** the control references that text through `aria-describedby`

#### Scenario: The pre-click reason moves no control

- **WHEN** a change turns a clear draft into a blocked one
- **THEN** the reason text appears on the header bar's row
- **AND** Publish and every button beside it keep the position they held

#### Scenario: A wrapped row keeps its controls trailing-aligned

- **WHEN** the viewport narrows until the row wraps, with a reason
  rendered
- **THEN** the action cluster stays aligned to the row's trailing edge
- **AND** the reason wraps with that cluster

#### Scenario: An advisory-only draft shows no pre-click warning

- **WHEN** a draft loads with `canPublish: true` and only advisory issues
- **THEN** the Publish control renders exactly as it does for a clear draft

#### Scenario: A permission-denied draft keeps its existing reason

- **WHEN** a draft loads with `canPublish: false`, whether or not it also
  carries a blocking issue
- **THEN** the control renders per the existing unavailable-control
  requirement
- **AND** its reason renders in this requirement's own place, in the muted
  tone
- **AND** this requirement's own text does not also render
