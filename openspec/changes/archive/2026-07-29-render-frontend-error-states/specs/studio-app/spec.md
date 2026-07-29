## MODIFIED Requirements

### Requirement: A save conflict is surfaced and resolved by reloading, never merged

When `PUT /drafts/:processId` answers 409, the studio SHALL tell the user that
the draft was changed elsewhere and SHALL offer reloading the stored draft. It
SHALL NOT merge, SHALL NOT silently retry with the newer revision, and SHALL
NOT discard the conflict.

Reloading SHALL leave the editor in a **clean** state: the body the toolbar
treats as "last known persisted" SHALL be advanced to the reloaded body, in
the same operation that replaces the draft, the layout and the revision. A
reload is by definition the point at which current and saved coincide — the
same invariant the initial seed and the post-save advance already encode.

Without this the unsaved-changes comparison is made against the discarded
local edits, so a draft byte-identical to the stored one reads as dirty for
the rest of the session (the toolbar is not remounted by a reload). Publishing
then always prompts to save first: accepting re-writes the just-fetched body
and bumps the stored revision for nothing, invalidating a concurrent editor's
in-flight revision, and declining aborts a publish the user was entitled to
make.

#### Scenario: A conflicting save is reported

- **WHEN** a save answers 409
- **THEN** a conflict message is shown with a reload action, and the local
  editing state is left intact until the user chooses

#### Scenario: Reloading adopts the stored draft

- **WHEN** the user reloads after a conflict
- **THEN** the stored body, layout and revision replace the local state and a
  subsequent save succeeds

#### Scenario: Publishing straight after a reload does not prompt to save

- **WHEN** the user reloads after a conflict and immediately publishes,
  without editing
- **THEN** the publish proceeds without the unsaved-changes prompt, because
  the draft is identical to the stored one

#### Scenario: Editing after a reload is dirty again

- **WHEN** the user reloads after a conflict and then makes an edit
- **THEN** the unsaved-changes prompt reappears on publish, so the fix does
  not turn the gate off
