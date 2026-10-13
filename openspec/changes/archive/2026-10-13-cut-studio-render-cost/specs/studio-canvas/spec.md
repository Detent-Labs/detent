# Spec Delta

## ADDED Requirements

### Requirement: The Arrange command loads its layout library on first use

The layout library the Arrange command runs SHALL load through a dynamic import
when the command first runs. Opening the canvas SHALL NOT download it. The
command SHALL keep the confirmation and the result the Arrange requirements
state. A library that fails to load SHALL leave the layout as it was. The
command SHALL then tell the author the load failed.

#### Scenario: Opening the canvas does not load the layout library

- **WHEN** an author opens a draft's Canvas tab
- **THEN** the browser does not request the layout library's chunk

#### Scenario: Arrange loads the library and then arranges

- **WHEN** the author runs the Arrange command
- **THEN** the browser requests the library's chunk once, and the command
  repositions every step as before
