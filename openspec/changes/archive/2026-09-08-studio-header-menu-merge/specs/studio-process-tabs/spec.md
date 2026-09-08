## REMOVED Requirements

### Requirement: An overflow menu holds what is not a tab

**Reason**: The tab row's own trailing-edge control is gone. What it held
(the JSON surface, Versions and Player) moved into the header bar's `⋮`
menu. It sits beside the process-identity items that menu already carried.
The process surface now keeps exactly one "more" trigger instead of two.
See `studio-header-menu-merge`'s proposal.

**Migration**: An author looking for JSON, Versions or Player finds them in
the header bar's `⋮` menu, under a "Views" group. No route, no URL and no
engine-side behavior changes. This is a control relocation only.

## ADDED Requirements

### Requirement: The header bar's menu holds what is not a tab

The header bar's `⋮` menu SHALL carry a second group, "Views", below the
process's own "Process, saved with the draft" group. The Views group SHALL
hold the JSON surface, Versions and Player. The tab row SHALL have no
trailing control of its own. Its trailing edge is the last tab.

The JSON entry SHALL name its own state. An author reads from it whether
the entry opens the JSON surface or leaves it.

#### Scenario: The JSON surface opens from the header bar's menu

- **WHEN** an author opens the header bar's `⋮` menu and picks the JSON
  entry
- **THEN** the JSON surface replaces the tab body
- **AND** the entry now names leaving that surface

#### Scenario: The tab row has no trailing control

- **WHEN** an author reads the tab row
- **THEN** its trailing edge is the last tab, with no overflow control
  after it
