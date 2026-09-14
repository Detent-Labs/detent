## ADDED Requirements

### Requirement: The shell's own full-page states cap their content column at 61rem

Every full-page state the shell itself renders SHALL center its content
in a column capped at 61rem. That is the same cap the app area uses.
This covers the login screen, the profile page, and the error boundary
fallback. It also covers the explanatory state shown when an actor's
roles deny the area or screen they reached.

#### Scenario: A wide viewport still keeps the column capped

<!-- WHEN/THEN content stays verbatim per task brief; the word count is inherent to enumerating all 4 protected full-page states. -->
<!-- antislop: allow sentence-length -->
- **WHEN** a participant opens the login screen, the profile page, the
  error boundary fallback, or an explanatory state, on a viewport wider
  than 61rem
- **THEN** the screen's content column renders at 61rem, centered in the
  available width
