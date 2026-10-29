<!-- antislop: allow-file passive-voice -->
<!-- The scenarios keep the fixed SHALL/WHEN/THEN grammar of the live spec. -->

# Spec Delta

## ADDED Requirements

### Requirement: The engine image carries the built browser bundle

`deploy/engine.Dockerfile` SHALL build the browser bundle in a separate build
stage. The final stage SHALL copy only the built `packages/web/dist` from it
and SHALL set `WEB_ROOT` to that directory. The final stage SHALL still install
production dependencies only, so no build tool reaches the image.

#### Scenario: The image serves the shell

- **WHEN** the engine image starts with a valid configuration
- **THEN** a browser request for `/` receives the shell from `WEB_ROOT`

#### Scenario: The build tools stay in the build stage

- **WHEN** a reviewer inspects the final engine image
- **THEN** it holds `packages/web/dist/index.html` and no `vite` package
