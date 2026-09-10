## ADDED Requirements

### Requirement: A view declaring tabs renders as a tab strip over one panel

`FieldForm` SHALL accept three props. The `tabs` prop is an ordered list.
Each member carries a `key` and a `LocalizedText` `label`. The `activeTab`
prop names the key the consumer wants open.

The `onTabChange` prop takes a key when the participant opens a tab. An
absent or empty `tabs` SHALL render the form exactly as it renders today,
with no strip and no panel.

`FieldForm` SHALL hold no tab state. It already holds no value state and no
locale state, and the open tab joins that rule rather than breaking it. The
package uses no React hook, and this requirement adds none.

`FieldForm` SHALL derive the open tab on every render and store nothing. It
takes `activeTab` when the strip draws that tab, and the first drawn tab
otherwise. That derivation covers a hidden `activeTab`, with no effect and no
state.

Given a non-empty list, `FieldForm` SHALL draw a `role="tablist"` above the
grid, one `role="tab"` per drawn tab, in the list's own order. It SHALL draw
one `role="tabpanel"` at a time, for the open tab alone. The panel SHALL hold
the root entries whose `tab` names that tab, in view-array order. It lays them
out in the same `columns` grid the form already declares.

An entry carrying a `group` SHALL keep rendering inside its group. The
group's own entry is what places it under a tab. A group therefore draws
whole, on one tab, never split.

Each `role="tab"` SHALL carry `aria-selected` and `aria-controls` naming its
panel, and the panel SHALL carry `aria-labelledby` naming its tab. Arrow
keys SHALL move focus between tabs without opening one, and `Enter` or
`Space` SHALL open the focused tab. `Home` and `End` SHALL move focus to the
first and last tab. That is the WAI-ARIA tabs pattern with manual activation,
the same pattern the studio's own process tab row already follows.

The strip SHALL compile from StyleX and read `form-ui/tokens.stylex`, the way
every other part of this package's rendering does.

Tabs SHALL change no submitted value. `editableFieldIds` and
`filterToEditable` SHALL ignore `tab`, so a value typed on one tab submits
whichever tab is open at the time.

`form-ui` SHALL export `resolveTabsLocale(tabs, locale, baseLocale)`. It is
the sibling of the `resolveFieldsLocale` its consumers already call. A tab
label sits outside `fields`, so it reaches no existing resolver. One call
then applies the same base-locale fallback.

#### Scenario: A form with no tabs renders as it does today

- **WHEN** a consumer renders `FieldForm` with no `tabs` prop
- **THEN** every root entry renders in one grid, with no tablist in the
  output

#### Scenario: A tabbed form draws one panel at a time

- **WHEN** a consumer renders `FieldForm` with two tabs, entries naming both,
  and `activeTab` naming the first
- **THEN** the first tab reports `aria-selected="true"`, its own entries
  render, and the output holds none of the second tab's entries

#### Scenario: Opening a tab calls back rather than switching

- **WHEN** the participant activates the second tab
- **THEN** `FieldForm` calls `onTabChange` with that tab's key, and the panel
  swaps once the consumer passes the new `activeTab` back in

#### Scenario: An `activeTab` naming an undrawn tab falls back

- **WHEN** `activeTab` names a tab the strip does not draw
- **THEN** the first drawn tab renders open, and `FieldForm` stores nothing

#### Scenario: Arrow keys move focus without opening a tab

- **WHEN** focus sits on the first tab and the participant presses
  `ArrowRight`
- **THEN** focus moves to the second tab, and the first tab stays selected
  until `Enter` or `Space`

#### Scenario: A group draws whole inside its tab

- **WHEN** a group entry names the second tab, and three entries name that
  group
- **THEN** all three render inside the group's fieldset on the second tab,
  and none of them appears on the first

#### Scenario: A value typed on one tab survives a tab switch

- **WHEN** the participant types into a field on the first tab, opens the
  second, and returns
- **THEN** the field still shows the typed value, because the consumer holds
  it

### Requirement: A tab with nothing to draw hides itself

`FieldForm` SHALL draw no `role="tab"` for a tab holding no resolved entry.
A tab whose entries all resolved invisible arrives as a tab no entry names.
So does a tab the author left empty.

This is what gives an author a conditional tab. Every entry already carries
`visible`, so a tab hides when its own contents hide. The tab itself needs no separate
`visible`, and nothing reads one.

When no tab holds a drawn entry, `FieldForm` SHALL draw no tablist at all.
The form then renders its remaining output, path buttons included, with no
empty strip above it.

`form-ui` SHALL export `drawnTabs(entries, tabs)`. That pure function
answers which tabs the strip draws. `FieldForm` reads it. A consumer reads it
to keep its own `activeTab` on a tab that still exists.

#### Scenario: An empty tab draws no tab button

- **WHEN** a view declares three tabs and no entry names the third
- **THEN** the tablist holds two tabs, and the third's label is absent from
  the output

#### Scenario: A tab whose entries all hide disappears

- **WHEN** every entry naming the second tab resolves invisible
- **THEN** the tablist holds the other tabs alone

#### Scenario: Hiding the open tab moves the participant to the first drawn one

- **WHEN** `activeTab` names the second tab and a value change hides every
  entry on it
- **THEN** the first drawn tab renders open, and its entries render

#### Scenario: `drawnTabs` answers the same list the strip draws

- **WHEN** a caller passes the resolved entries and the view's tabs to
  `drawnTabs`
- **THEN** it answers the tabs the strip draws, in the strip's own order

#### Scenario: A form whose every tab is empty draws no strip

- **WHEN** a view declares two tabs and every entry naming either resolves
  invisible
- **THEN** no tablist renders, and the path buttons render as they always do

### Requirement: A helper names the first tab holding an issue, and each tab marks its own

`form-ui` SHALL export `firstTabWithIssue(entries, tabs, issuesByField)`. It
answers the first drawn tab, in the strip's own order, holding an entry that
carries an issue. It answers `undefined` when no drawn tab holds one.

A consumer SHALL call it after a submission fails and set its own `activeTab`
to the answer. A required field on an unopened tab otherwise blocks the
submission with nothing on screen to explain it.

The switch belongs to the consumer. `FieldForm` has no tab state, so it can
start no switch of its own. The helper keeps the rule in one place, and its
three call sites share one behavior.

Each drawn tab holding an entry that carries an issue SHALL report that
programmatically. Color alone SHALL NOT carry it. The tab SHALL carry text
naming how many issues its entries hold, reachable by a screen reader.

Each issue SHALL keep attaching to its own field's input, exactly as the
existing per-field requirement states. Tabs add where the form looks, never
how an issue attaches.

#### Scenario: The helper names the offending tab

- **WHEN** `issuesByField` carries an issue for a field on the second tab
- **THEN** `firstTabWithIssue` answers that tab's key

#### Scenario: Two tabs holding issues answer the earlier one

- **WHEN** `issuesByField` carries issues for a field on the second tab and a
  field on the third
- **THEN** `firstTabWithIssue` answers the second tab's key, and both tabs
  report their issue counts

#### Scenario: A clean map names no tab

- **WHEN** `issuesByField` is empty
- **THEN** `firstTabWithIssue` answers `undefined`, and the consumer leaves
  its `activeTab` alone

#### Scenario: A tab's issue count is available to a screen reader

- **WHEN** one tab's entries hold two issues
- **THEN** that tab carries text naming two issues, beyond any color or
  border it draws

#### Scenario: A tab's issue count survives a re-render

- **WHEN** the consumer re-renders with the same `issuesByField`
- **THEN** each tab reports the same issue count, and `activeTab` decides
  which panel draws
