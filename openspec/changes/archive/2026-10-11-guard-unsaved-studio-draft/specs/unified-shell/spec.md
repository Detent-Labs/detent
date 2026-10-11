# Spec Delta

## ADDED Requirements

### Requirement: An area may hold the account menu's exits behind its own confirmation

Three handlers reach the header's `Chrome` from the root of the open area. They
serve the area entries, the profile entry and the logout entry. An area that
holds unsaved work MAY ask the actor to confirm first. Declining SHALL close the
menu and leave the actor in the area with the work untouched. The shell SHALL
NOT ask for the area. A `401` is no account menu exit, and it SHALL end the
session at once with no prompt.

#### Scenario: An area asks before the area switch

- **WHEN** the open area holds unsaved work and the actor selects another
  area in the account menu
- **THEN** the area asks for confirmation before the shell navigates
- **AND** declining leaves the actor in the open area

#### Scenario: An area asks before logout

- **WHEN** the open area holds unsaved work and the actor selects the logout
  entry
- **THEN** the area asks for confirmation before the shell signs the actor out

#### Scenario: Declining closes the menu

- **WHEN** the actor declines the confirmation of an area
- **THEN** the account menu stays closed and the actor stays in the area

#### Scenario: A 401 ends the session without a prompt

- **WHEN** an API call from an area that holds unsaved work answers 401
- **THEN** the shell signs the actor out and the login screen appears
- **AND** no confirmation appears

## MODIFIED Requirements

### Requirement: The account menu dismisses via native light-dismiss

The header's account menu SHALL open on a click of its trigger button. It
SHALL dismiss on an outside pointer interaction or on the Escape key. Both
SHALL work through the browser's native popover light-dismiss behavior,
never a hand-written document listener.

A control nested inside the open menu keeps its own action. A pointer
interaction with that control SHALL NOT dismiss the menu first. Four
controls carry this rule: the language picker, an area-switcher entry,
the profile entry, and the logout button.

#### Scenario: A click outside the open menu closes it

- **WHEN** the account menu is open and the actor clicks anywhere outside
  the menu and its trigger button
- **THEN** the menu closes and no menu action runs

#### Scenario: Escape closes the open menu

- **WHEN** the account menu is open and the actor presses Escape
- **THEN** the menu closes and focus returns to the trigger button

#### Scenario: The language picker inside the menu stays usable

- **WHEN** the account menu is open and the actor changes the language
  picker's selection
- **THEN** the locale changes and the menu stays open for a further
  selection

#### Scenario: Selecting an area-switcher entry closes the menu and navigates

- **WHEN** the account menu is open and the actor clicks another permitted
  area's entry
- **AND** the open area asks for no confirmation or the actor confirms it
- **THEN** the menu closes and the shell navigates to that area

#### Scenario: Selecting the profile entry closes the menu and navigates

- **WHEN** the account menu is open and the actor clicks the profile
  entry
- **AND** the open area asks for no confirmation or the actor confirms it
- **THEN** the menu closes and the shell navigates to the profile page

#### Scenario: Selecting the logout entry closes the menu and signs out

- **WHEN** the account menu is open and the actor clicks the logout
  entry
- **AND** the open area asks for no confirmation or the actor confirms it
- **THEN** the menu closes and the shell signs the actor out
