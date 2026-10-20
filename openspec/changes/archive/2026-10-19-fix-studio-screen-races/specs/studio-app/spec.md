## ADDED Requirements

### Requirement: Creating a template over an existing key asks first

The templates screen SHALL ask for a confirmation before a create whose key
matches a template in the loaded list. The engine replaces a template that
has the same key, and a template keeps no earlier version. A confirmation
SHALL let the create go ahead. A cancel SHALL send no request and SHALL keep
the typed key and the chosen source in the form.

A create with a key the list does not hold SHALL NOT ask.

#### Scenario: A create over an existing key asks before the request

- **WHEN** a curator types the key `approval`, which the list already holds,
  and presses Create
- **THEN** the screen asks for a confirmation before it calls the engine

#### Scenario: A cancelled replacement sends nothing

- **WHEN** the curator cancels that confirmation
- **THEN** the screen sends no request and the stored template stays as it
  was
- **AND** the form keeps the key and the source

#### Scenario: A new key creates without a prompt

- **WHEN** a curator types a key the list does not hold and presses Create
- **THEN** the screen creates the template and asks nothing
