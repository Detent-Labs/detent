<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     Rewriting the prose here would touch content from many prior changes
     for a purely stylistic reason, unrelated to any change this file
     documents. -->

## MODIFIED Requirements

### Requirement: The frontend image builds exactly one package per invocation

`docker/frontend.Dockerfile` SHALL accept a build argument, `PACKAGE`,
naming exactly one of `app`, `admin`, `studio`, or `reporting`. A single
build SHALL build a static bundle for that one package only. A separate
package SHALL NOT need a separate Dockerfile.

#### Scenario: Building the admin package

- **WHEN** `docker build -f docker/frontend.Dockerfile --build-arg
  PACKAGE=admin .` runs against the repository
- **THEN** the resulting image contains `packages/admin`'s static assets,
  and no other package's assets

#### Scenario: Building the reporting package

- **WHEN** `docker build -f docker/frontend.Dockerfile --build-arg
  PACKAGE=reporting .` runs against the repository
- **THEN** the resulting image contains `packages/reporting`'s static assets,
  and no other package's assets
