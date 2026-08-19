## MODIFIED Requirements

### Requirement: The rail adds a consolidated view; it does not replace per-entity issue placements

`IssueList` SHALL keep rendering its existing per-entity views. Those
views sit under the process header, on a step card, and on a path row.
They also sit on the panels screen's Fields view, above the field
editor's tab set. The checks rail is one more consolidated view over
the same `validation.issues[]` array. It does not replace those
placements.

A field's own `IssueList` SHALL sit above the tab set rather than
inside one tab. The field's validation rules sit on the Rules tab.
Inside that tab, an issue would hide whenever the author opened
another one.

#### Scenario: An issue shows in both its entity placement and the rail

- **WHEN** a path guard carries a CEL issue
- **THEN** that issue shows in the path's own `IssueList` placement and
  in the checks rail's CEL group

#### Scenario: A field's issue stays visible on every tab

- **WHEN** a field carries a validation issue and the developer opens
  the Values tab
- **THEN** that field's `IssueList` still shows the issue above the tab
  set
