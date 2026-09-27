## MODIFIED Requirements

### Requirement: Only an authoring-capable actor may create a test instance

To create a test instance, an actor SHALL need the standing that reads and
writes that process's draft. The server SHALL refuse an actor without that
standing. A valid session with some other role SHALL NOT change that.

A process can already have a draft or a published version. For such a process,
the standing SHALL take one of two forms. The first is an authoring role plus
a place on the process's Developer list. The second is the administrator role
alone. An authoring role without a place on the list SHALL NOT be enough.

#### Scenario: An author or developer may create a test instance
- **WHEN** a listed actor with the author or developer role asks for a test instance
- **THEN** the server creates the test instance

<!-- antislop: allow passive-voice -- the live spec names this scenario, and a MODIFIED block must keep that name -->
#### Scenario: An actor without authoring standing is refused
- **WHEN** an actor with no draft-access role asks for a test instance
- **THEN** the server refuses with an authorization error
- **AND** the server creates no instance

#### Scenario: The server refuses an unlisted author or developer
- **WHEN** an unlisted actor with the author or developer role asks for a test instance
- **AND** the process has a draft
- **THEN** the server refuses with an authorization error
- **AND** the server creates no instance

#### Scenario: An unlisted administrator may create a test instance
- **WHEN** an unlisted actor with the administrator role asks for a test instance
- **AND** the process has a draft
- **THEN** the server creates the test instance
