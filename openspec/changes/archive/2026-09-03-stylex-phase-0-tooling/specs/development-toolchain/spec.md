## ADDED Requirements

### Requirement: The frontend build compiles component styles

The frontend production build SHALL run the style compiler as part of
`vite build`. The compiler SHALL run before the React transform.
`packages/web` SHALL pin the compiler to an exact version. The
`frozen-lockfile` gate then covers every upgrade.

The build SHALL name the stylesheet that receives compiled rules. It SHALL
carry a browserslist declaration that matches `build.target`. The compiler's
own CSS pass and Vite then agree on the browsers they serve.

The build SHALL assert that the stylesheet `index.html` links contains a
known compiled rule. A build whose compiled rules land elsewhere SHALL fail.

This requirement covers the build pipeline's own gate. `web-styling`'s "The
compiled stylesheet lands where the page links it" describes the same
assertion, from the styling model's side. Keep both in step if the
assertion changes.

#### Scenario: A push compiles the styles

- **WHEN** a contributor pushes with the devcontainer up
- **THEN** the hook's build step compiles every component style into the
  entry stylesheet

#### Scenario: A misplaced stylesheet blocks the push

- **WHEN** a chunking change moves the compiled rules into another stylesheet
- **THEN** the build fails, names the stylesheet it checked, and the push
  does not proceed

#### Scenario: A style upgrade needs a lock change

- **WHEN** a manifest raises the compiler's version without a matching lock
- **THEN** the `frozen-lockfile` gate rejects the push

### Requirement: A test preload never reaches the engine's test process

`bunfig.toml` registers a preload for every `bun test` process, engine
suites included. A preload that exists for a frontend concern SHALL
transform no engine file: nothing under the root `src/` or `test/`. At its
own module scope it SHALL import only the test runner's plugin API. It
SHALL import no frontend compiler, transpiler or shim. It MAY mock a
module, provided no engine module imports that module. The engine carries
no UI dependency, and its test process SHALL run no frontend-specific logic
through that preload.

#### Scenario: An engine test loads no frontend preload logic

- **WHEN** `bun test test/` runs an engine suite
- **THEN** no engine module resolves the mocked frontend module
- **AND** no engine module passes through a frontend transform

#### Scenario: A preload that reaches engine files fails review

- **WHEN** a preload's transform would match a path under the root `src/`
  or `test/`
- **THEN** review rejects the change before merge
