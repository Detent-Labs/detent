<!-- antislop: allow-file trailing-negation -->
<!-- The requirement text is copied from the live spec; only the docker/ to deploy/ path differs. -->
# Spec Delta

## MODIFIED Requirements

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
kind they set. The argument `VITE_API_URL` in `deploy/frontend.Dockerfile` is
one of them.

The table SHALL cover at minimum the twenty variables `src/` reads today.
Those are `DATABASE_URL`, `PORT`, `WEB_ROOT`, `AUTH_JWT_SECRET`,
`AUTH_ISSUERS`, `ALLOW_INSECURE_DEV_AUTH`, `CORS_ALLOWED_ORIGINS`,
`DATA_RETENTION_DAYS`, `LOG_LEVEL`, `MAX_ATTACHMENT_BYTES`,
`ASSIGNMENT_RESOLUTION_TIMEOUT_MS`, `METRICS_TOKEN`, `TRUST_PROXY`,
`HTTP_ACTION_ALLOWED_HOSTS`, `HTTP_ACTION_ALLOW_INSECURE` and the five
`SMTP_*` variables.

The table SHALL also cover `SEED_ALLOW`. The seed script reads it.
`.dockerignore` excludes no part of `scripts/`, so that script reaches the
engine image. The row SHALL mark it as a maintenance-script variable rather
than a variable the server reads.

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
