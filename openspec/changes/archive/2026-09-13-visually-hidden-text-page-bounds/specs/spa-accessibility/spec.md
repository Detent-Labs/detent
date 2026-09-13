## ADDED Requirements

### Requirement: Text kept for a screen reader stays inside the region that holds it

A browser package hides some text from sight and keeps it for assistive
technology. Examples are a tab's blocker state, a rail entry's kind word and a
live region's announcement. Such text SHALL lay out inside the nearest region
that scrolls around it. That region SHALL clip it and scroll it with the rest
of its content.

Hidden text SHALL leave the document's size unchanged at every window width.
A window as narrow as 400px scrolls sideways only where visible content needs
the room.

Hidden text SHALL keep its place beside the content it names. A screen
reader's reading cursor moves the view to the text it reads. Text placed at
the page's corner would pull the view away from the content around it.

#### Scenario: A blocker on the Checks tab leaves a narrow window unscrolled

- **WHEN** a draft's Checks tab counts a blocker, and the window stands 400px
  wide
- **THEN** the document's scroll width equals its client width on every tab

#### Scenario: A long entity rail leaves the studio page unscrolled

- **WHEN** the Fields tab's rail holds more entries than a 1280 by 720 window
  shows
- **THEN** the document's scroll height equals its client height, and the
  rail scrolls inside its own box

#### Scenario: Hidden text scrolls with its own region

- **WHEN** hidden text sits inside a region that scrolls, and that region
  scrolls
- **THEN** the text moves with the entry it names and stays clipped to the
  region
