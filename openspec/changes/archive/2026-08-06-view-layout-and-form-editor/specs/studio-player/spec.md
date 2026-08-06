## ADDED Requirements

### Requirement: The Player's form pane reflows to one column under a width threshold

<!-- The quoted requirement title below is an existing spec heading and must
     match it word for word to stay a usable cross-reference. -->
<!-- antislop: allow passive-voice -->
The Player already puts the form beside the merged record. The
requirement titled "The Player is shown beside the instance's merged
transition/event record" owns that layout. This one adds only what
happens when there is no room for it.

Under a width threshold, the layout SHALL collapse to one column. The
order is instance access, the form and its controls, then the record
last.

The threshold SHALL come from the form's own comfortable measure, not
a fixed device width. This requirement governs the Player's own two
panes. The form's internal grid carries its own collapse rule. The
`form-ui` capability owns that rule, so both consumers get it at the
same point. The participant's Task screen has no second pane to fold,
so it needs nothing here.

The form itself renders through `form-ui`'s `FieldForm`, honoring the
current step's `columns` and each field's `span` (see the `form-ui`
capability). A field's own span never changes across this reflow. Only
the page's two panes fold into one.

#### Scenario: Above the threshold the side-by-side layout holds

- **WHEN** the Player renders above the width threshold
- **THEN** the form and the record sit side by side, exactly as the
  existing side-by-side requirement already specifies

#### Scenario: Narrow, the layout stacks with the record last

- **WHEN** the Player renders below the width threshold
- **THEN** instance access, then the form, then the record render in
  that order, stacked in one column

#### Scenario: A spanning field keeps its span through the reflow

- **WHEN** the Player collapses to one column and a resolved field's
  `span` is `2` on a `columns: 2` view
- **THEN** that field still renders across both of the form's own
  columns. The reflow folds the page's panes, not the form's internal
  grid
