<!-- antislop: allow-file passive-voice -->
<!-- The scenarios use the fixed SHALL/WHEN/THEN grammar every spec in this
     repository uses, which reads as passive by construction. -->

# Spec Delta

## Purpose

Defines how the public demo at `detent.org` runs. It covers the deployment
definition the repository holds, the nightly reset, and the bounds a demo with
known logins needs.

## ADDED Requirements

### Requirement: The repository holds the demo's whole deployment definition

`deploy/demo/` SHALL hold every file the demo server runs from. Those are the
Quadlet units, the `Caddyfile`, an environment template, the setup script, the
reset script and the reset timer. The server SHALL need only these files and
its secrets. The setup script SHALL write those secrets on the server, and no
secret value SHALL appear in the repository.

#### Scenario: A fresh server reaches a running demo

- **WHEN** the operator follows `docs/runbooks/demo.md` on a prepared server
  and runs `scripts/deploy-demo.sh` once
- **THEN** the demo answers at `https://detent.org` with the seed's processes
  and accounts

#### Scenario: The template has no secret

- **WHEN** a test reads the environment template
- **THEN** every secret variable holds a placeholder, never a value

### Requirement: The demo serves one origin over TLS

Caddy SHALL end TLS for `detent.org` and proxy every request to the engine. The
engine SHALL serve both the API and the browser bundle. The demo SHALL run no
second origin and no nginx container.

#### Scenario: The shell and the API share the origin

- **WHEN** a browser opens `https://detent.org/app`
- **THEN** the engine answers with the shell, and the shell's API requests go to
  the same origin

### Requirement: The demo resets to the seed state every night

A systemd timer SHALL run the reset script once a day. The reset SHALL drop and
recreate the demo database, restart the engine, and run the seed script. A
visitor's change SHALL therefore last until the next reset at most.

#### Scenario: A visitor's change disappears

- **WHEN** a visitor deletes a process during the day and the nightly reset runs
- **THEN** the process exists again, with every other seed record

### Requirement: The public demo bounds what a visitor can cause

The demo's environment template SHALL leave `HTTP_ACTION_ALLOWED_HOSTS` and
every `SMTP_*` variable unset, so no action reaches another host. It SHALL NOT
set `ALLOW_INSECURE_DEV_AUTH`. It SHALL set `MAX_ATTACHMENT_BYTES` to `1048576`.
It SHALL set `TRUST_PROXY=1`, since Caddy discards an incoming
`X-Forwarded-For`.

#### Scenario: A visitor publishes an outbound action

- **WHEN** a visitor publishes a process whose `http.request` action names any
  host
- **THEN** the engine refuses the delivery, because the allowed-host list is
  empty

#### Scenario: A large upload

- **WHEN** a visitor uploads a file larger than 1 MiB
- **THEN** the engine refuses it

### Requirement: The demo database pins a major version

The demo's Postgres unit SHALL name a fixed major version tag, never `latest`.
It SHALL mount the volume at `/var/lib/postgresql`, the parent of the versioned
data directory.

#### Scenario: A newer Postgres image on the server

- **WHEN** the server pulls a newer Postgres image
- **THEN** it stays on the pinned major version, and the volume stays readable

### Requirement: The engine image builds off the server

`scripts/deploy-demo.sh` SHALL build the engine image on the machine that runs
it. It SHALL ship the image to the server over SSH. The server SHALL NOT build
an image.

#### Scenario: A later deploy

- **WHEN** the operator runs `scripts/deploy-demo.sh` with a new commit checked
  out
- **THEN** the server loads the new image and restarts the pod, and runs no
  build
