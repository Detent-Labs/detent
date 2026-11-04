## ADDED Requirements

### Requirement: The assignable-groups route takes the draft read's gate

`GET /drafts/:processId/assignable-groups` SHALL admit exactly the actors `GET /drafts/:processId` admits. On a process with a draft or a published version, an operator holding `system:admin` passes. Any other actor needs an authoring role and a place on its Developer list. On a process with neither, an authoring role alone admits. The route joins the no-code authoring subset and the routes the Developer list narrows.

#### Scenario: An author on the Developer list reads the groups

- **WHEN** an actor holding `system:author` stands on the process's Developer list and calls the route
- **THEN** the engine authorizes the request

#### Scenario: The route refuses an author outside the Developer list

- **WHEN** an actor holding `system:author` stands outside the process's Developer list and calls the route
- **THEN** the response is `403`

#### Scenario: An operator reads the groups

- **WHEN** an actor holding `system:admin` calls the route for a process with a draft
- **THEN** the engine authorizes the request

#### Scenario: The route refuses an operator alone on a process with neither

- **WHEN** an actor holding only `system:admin` calls the route for a process with no draft and no version
- **THEN** the response is `403`

#### Scenario: The route refuses a participant

- **WHEN** an actor holding no authoring role and not `system:admin` calls the route
- **THEN** the response is `403`
