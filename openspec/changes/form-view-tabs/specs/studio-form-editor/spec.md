## ADDED Requirements

### Requirement: A tab strip above the canvas authors the form's tabs

A strip above the canvas SHALL read and write the step view's `tabs`. It
SHALL offer adding a tab, renaming one, reordering the list and removing a
tab. Outside the JSON view, this is the only control that writes `tabs`.

A form with no tab SHALL show the strip's add control alone. The canvas then
lays every entry out the way it does today.

The strip SHALL change a tab's name as authored text. It writes the content
locale the studio already resolves authored text for. Adding a tab SHALL seed its
`label` with a non-empty base-locale entry. The draft then never carries a
tab that fails the base-locale rule.

The editor SHALL mint a tab's `key`, unique within the view. The author
names the label; nothing asks them for a key.

The editor SHALL NOT rewrite a tab's `key` afterwards. Renaming a tab changes
its `label` alone. The definition contract makes that key the anchor every
entry's `tab` names. A rewrite would orphan them.

Selecting a tab in the strip SHALL show that tab's own entries on the canvas
and hide the others. Every existing canvas behavior SHALL keep working
within the selected tab. That covers placement, the column count, spans,
groups and the keyboard move commands.

#### Scenario: Adding the first tab

- **WHEN** the developer adds a tab to a form that had none
- **THEN** the draft's `view.tabs` holds one member with a minted key and a
  seeded base-locale label

#### Scenario: Renaming a tab writes its label

- **WHEN** the developer renames a tab
- **THEN** the draft records the new text under the content locale
- **AND** the tab keeps its key, so every entry naming it still resolves

#### Scenario: Selecting a tab filters the canvas

- **WHEN** the developer selects the second tab
- **THEN** the canvas shows the entries naming that tab alone, at the form's
  own column count

### Requirement: Creating and removing a tab leaves no entry stranded

Adding the FIRST tab to a form SHALL move every existing root entry into it.
The draft then satisfies the definition contract's rule for a tabbed view.
The author has no step to remember.

Removing the LAST remaining tab SHALL clear `tab` from every entry and remove
`tabs` from the view. The form returns to the shape it had before any tab
existed.

Removing a tab while others remain SHALL move its entries to the tab before
it in the strip. They move to the tab after it when the removed tab was the
first. The editor deletes no entry. It opens no dialog either.

Reordering the strip SHALL change the tab order alone. It SHALL move no entry
between tabs.

#### Scenario: The first tab sweeps up the existing form

- **WHEN** a form holds four root entries and the developer adds a tab
- **THEN** all four entries name that tab, and the canvas shows all four

#### Scenario: Removing the last tab returns the form to one page

- **WHEN** a form holds one tab and the developer removes it
- **THEN** `view.tabs` is gone, no entry carries a `tab`, and every entry
  renders on one canvas

#### Scenario: Removing a middle tab hands its entries to its left neighbour

- **WHEN** a form holds three tabs and the developer removes the second
- **THEN** the second tab's entries name the first tab, in their existing
  order

#### Scenario: Removing the first tab hands its entries to its right neighbour

- **WHEN** a form holds two tabs and the developer removes the first
- **THEN** its entries name the remaining tab

#### Scenario: Reordering moves no entry

- **WHEN** the developer moves the third tab to the front
- **THEN** `view.tabs` records the new order, and every entry keeps the tab
  it named

### Requirement: A selected entry's strip assigns it to a tab

The strip that already sets an entry's overrides SHALL carry a tab picker,
beside the group picker it already carries. It SHALL list the form's tabs and
write the selected entry's `tab`.

The picker SHALL stay inert for an entry that names a group. Its group
decides its tab, per the definition contract's rule that a group and its
members share one tab. The picker SHALL say so rather than sitting inert
with no reason.

Assigning an entry to a group SHALL clear that entry's own `tab`. Clearing an
entry's group on a tabbed form SHALL set its `tab` to the tab the canvas is
showing. Neither move leaves a draft the contract rejects.

The picker SHALL offer no empty choice on a tabbed form. A root entry there
always names a tab. No selectable state then reaches a draft the contract
rejects.

Moving a group between tabs SHALL move its members with it. The members carry
no `tab` of their own, so nothing else has to change.

This requirement covers both entry kinds. A note's own strip SHALL carry the
same tab picker, under the same rules.

#### Scenario: The picker writes the selected entry's tab

- **WHEN** the developer selects a root field and picks the second tab
- **THEN** the draft records `tab` on that entry, and the card leaves the
  first tab's canvas

#### Scenario: A grouped entry's picker stays inert and says why

- **WHEN** the developer selects a field that names a group
- **THEN** the tab picker stays inert, and it states that the group decides
  the tab

#### Scenario: Moving a field into a group clears its tab

- **WHEN** the developer moves a root field into a group on the same tab
- **THEN** the entry carries the group and no longer carries a `tab`

#### Scenario: Moving a field out of a group assigns the shown tab

- **WHEN** the developer clears a field's group while the canvas shows the
  second tab
- **THEN** that entry names the second tab

#### Scenario: A note takes a tab the same way a field does

- **WHEN** the developer selects a note and picks the third tab
- **THEN** the draft records `tab` on the note entry

### Requirement: The live preview beside the canvas shows the form's tabs

The participant preview SHALL show the draft's tabs, through the same
`FieldForm` a participant gets. It SHALL open the tab the canvas is showing.
The two halves of the editor then never disagree about which tab is open.

Selecting a tab in the preview SHALL select the same tab on the canvas. The
author edits and previews one tab at a time.

One selected-tab value SHALL drive both halves. The editor owns it and passes
it to `FieldForm` as `activeTab`, taking `onTabChange` back. That is the
`form-ui` capability's own controlled shape, so the two halves cannot drift.

#### Scenario: The preview opens the tab the canvas shows

- **WHEN** the developer selects the second tab on the canvas
- **THEN** the preview draws the tab strip with the second tab open

#### Scenario: Selecting a tab in the preview moves the canvas

- **WHEN** the developer selects the third tab inside the preview
- **THEN** the canvas shows the third tab's entries
