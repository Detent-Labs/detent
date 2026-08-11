## ADDED Requirements

### Requirement: The shell's screen slot can fill the window's remaining height

The shell SHALL lay out its chrome and the area screen below it as one
vertical stack. That stack is at least as tall as the window. The header
keeps its own height and never shrinks.

An area screen fills the height the header leaves only when that screen
asks for it. A screen that asks for nothing SHALL keep the height its own
content gives it. The page SHALL then scroll as it scrolls today. The
shell offers the height, and the screen decides.

#### Scenario: A screen that asks for no growth keeps what it shows today

- **WHEN** a screen of the app, admin or reporting area loads in a window
  taller than its content
- **THEN** the screen keeps its content height, its width and its
  centering, and empty space stays below it

#### Scenario: A screen that asks to grow reaches the bottom of the window

- **WHEN** a screen that asks to fill the remaining height loads in a
  window taller than its content
- **THEN** the screen's bottom edge is the window's bottom edge, and the
  header keeps its place and its height
