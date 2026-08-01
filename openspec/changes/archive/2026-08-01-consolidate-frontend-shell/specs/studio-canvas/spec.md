<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## MODIFIED Requirements

### Requirement: Canvas interaction logic is tested as pure functions, independent of rendering


Following the existing convention (`packages/web/src/areas/app/screens/inboxLogic.ts`),
hit-testing, drag-delta computation, the auto-place traversal, and the
connection-validity predicate SHALL live in pure modules with `bun:test`
coverage. The SVG/React rendering and pointer-event wiring itself is not
required to be tested.

#### Scenario: Connection validity is tested without rendering

- **WHEN** the connection-validity predicate is given a step's existing
  paths and a candidate path
- **THEN** it returns accept or reject-with-reason, and the test needs no
  DOM or canvas rendering

