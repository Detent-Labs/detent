## Purpose

The contract for `docs/runbooks/deployment.md`, the document a deployment
reads before it runs the engine image or the frontend image. It names every
environment variable those images read, and the two operational rules this
repository states nowhere else. No engine code backs this capability, the
same way `backup-restore-runbook` backs none.

## ADDED Requirements

### Requirement: The runbook lists every environment variable the engine reads

The runbook SHALL carry one table row for every environment variable the
engine or either image reads. Each row SHALL give four things. Those are the
variable's name, what it controls, whether a deployment must set it, and its
default.

A row SHALL also mark a default the deployment must not keep. A default is
unsafe when it widens access, or when it leaves a control off. The row SHALL
say what to set instead.

The table SHALL also cover every build argument either image takes. Each row
SHALL say which kind it is. A build argument fixes a value into the built
bundle, where a runtime variable does not. An operator needs to know which
kind they set. The argument `VITE_API_URL` in `docker/frontend.Dockerfile` is
one of them.

The table SHALL cover at minimum `DATABASE_URL`, `PORT`, `WEB_ROOT`,
`AUTH_JWT_SECRET`, `AUTH_ISSUERS`, `ALLOW_INSECURE_DEV_AUTH`,
`CORS_ALLOWED_ORIGINS`, `DATA_RETENTION_DAYS`, `LOG_LEVEL`,
`MAX_ATTACHMENT_BYTES`, `ASSIGNMENT_RESOLUTION_TIMEOUT_MS` and the five
`SMTP_*` variables.

A change that adds a variable SHALL add its row in the same commit. A change
that removes one SHALL remove its row there.

#### Scenario: An operator finds what a variable does

- **WHEN** an operator reads the runbook looking for one variable
- **THEN** they find a row naming it, what it controls, whether they must set
  it, and its default

#### Scenario: The runbook marks an unsafe default

- **WHEN** the runbook lists `ALLOW_INSECURE_DEV_AUTH`, or any other
  variable whose default widens access or leaves a control off
- **THEN** the row marks that default as unsafe for a deployment, and says
  what to set instead

#### Scenario: The runbook names a build argument as one

- **WHEN** the runbook lists `VITE_API_URL`, or any other value an image
  takes as a build argument
- **THEN** the row marks it as a build argument, not as a runtime variable

#### Scenario: A new variable arrives with its row

- **WHEN** a change adds an environment variable the engine reads
- **THEN** that change adds the variable's row to the runbook in the same
  commit

### Requirement: The runbook states the proxy rule

The runbook SHALL state that a proxy in front of the engine must overwrite
the `X-Forwarded-For` header. It must not append to it. The runbook SHALL
also state that a deployment sets `TRUST_PROXY` only after its proxy does
so.

A proxy that appends leaves a caller-supplied value in the header. The engine
would then count a login against an address the caller chose. The runbook
SHALL say that, so an operator reads the reason with the rule.

#### Scenario: An operator learns what the proxy must do

- **WHEN** an operator plans to set `TRUST_PROXY`
- **THEN** the runbook tells them their proxy must overwrite
  `X-Forwarded-For` first, and says what goes wrong when it appends

### Requirement: The runbook states the dependency review

The runbook SHALL name `bun audit` as the dependency check, and SHALL state
how often a maintainer runs it. It SHALL state where the result goes.

The runbook SHALL say that no gate runs this check, and why. Each gate in
`.githooks` covers a defect class this repository produced more than once. A
gate that reaches the network also breaks an offline push.

#### Scenario: A maintainer knows the cadence and the command

- **WHEN** a maintainer looks for the dependency check
- **THEN** the runbook names `bun audit`, states the cadence, and states
  where the result goes

#### Scenario: A reader learns why no gate runs it

- **WHEN** a reader asks why the push gate does not run `bun audit`
- **THEN** the runbook gives the reason, so nobody re-opens it as an
  oversight
