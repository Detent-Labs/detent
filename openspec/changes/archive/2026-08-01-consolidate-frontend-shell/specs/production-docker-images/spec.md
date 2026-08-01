<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## MODIFIED Requirements

### Requirement: The frontend image builds exactly one package per invocation

`docker/frontend.Dockerfile` SHALL build the one workspace package that
produces a browser bundle, `packages/web`. It SHALL NOT take a build argument
naming which package to build: exactly one exists, and the four areas it
contains are not separately buildable.

A single build SHALL produce a static bundle covering every area. A separate
area SHALL NOT need a separate Dockerfile or a separate image.

#### Scenario: Building the admin package

- **WHEN** an image is wanted for what used to be `packages/admin`
- **THEN** `docker build -f docker/frontend.Dockerfile .` builds it with no
  build argument, and the resulting image contains the admin area along with
  every other area, because one bundle now covers all of them

#### Scenario: Building the reporting package

- **WHEN** an image is wanted for what used to be `packages/reporting`
- **THEN** the same argument-free build produces it, and
  `docker/frontend.Dockerfile` declares no build argument selecting a package
  or an area

### Requirement: The frontend image serves the built SPA with a client-side routing fallback

The frontend image SHALL serve the built assets through nginx.
Nginx SHALL fall back to `index.html` for any request path that matches
no built file. This SHALL match the shell's client-side
History API routing, including every area prefix.

#### Scenario: A deep link loads directly

- **WHEN** a browser requests a path the built assets do not contain
  directly, for example `/studio/processes/abc/edit`
- **THEN** the server responds with `index.html`, and the client-side
  router then renders the matching screen

#### Scenario: An area prefix is not a special case

- **WHEN** a browser requests any of `/app`, `/admin`, `/studio` or
  `/reporting`
- **THEN** the same fallback serves `index.html`, with no per-area nginx
  location block
