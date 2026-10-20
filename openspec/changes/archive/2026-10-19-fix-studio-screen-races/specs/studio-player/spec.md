## ADDED Requirements

### Requirement: The record pane shows only the open instance's record

The Player SHALL write a record answer only while that answer belongs to the
newest record load. An author can open one instance and then a second one.
The record of the first can arrive after that. Such an answer SHALL then
change nothing on the screen. That covers the entries, the "load more"
cursor and the record error.

A "load more" page SHALL append only when no record load started after the
click. A page that arrives after a reload SHALL change nothing.

#### Scenario: The Player drops a late record answer for an earlier instance

- **WHEN** an author opens instance A, then opens instance B, and A's record
  answer arrives after B's
- **THEN** the record pane shows B's entries and none of A's

#### Scenario: The Player drops a late "load more" page after a reload

- **WHEN** an author clicks "load more", and the record reloads before that
  page arrives
- **THEN** the record pane shows the reloaded entries with no appended page

#### Scenario: A late record error for an earlier instance shows nothing

- **WHEN** the record request for instance A returns an error after the
  author opened instance B
- **THEN** the record pane shows no record error for A
