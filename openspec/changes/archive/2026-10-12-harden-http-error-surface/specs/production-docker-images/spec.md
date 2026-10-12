# Spec Delta

## MODIFIED Requirements

### Requirement: The engine image reads all configuration from its runtime environment

The engine image SHALL set no application environment variable itself. One
exception exists: it SHALL set `NODE_ENV=production`, so the runtime never
answers an error with its development page. It
SHALL read `DATABASE_URL`, `AUTH_JWT_SECRET`/`AUTH_ISSUERS`,
`CORS_ALLOWED_ORIGINS`, and `PORT` from whatever supplies its container
runtime environment. It SHALL NOT set `ALLOW_INSECURE_DEV_AUTH`.

#### Scenario: A required variable is missing

- **WHEN** the engine image starts with neither `AUTH_JWT_SECRET` nor
  `AUTH_ISSUERS` set
- **THEN** the process fails to start and names the missing configuration,
  the same error `resolveAuthResolver` already raises outside a
  container

#### Scenario: The image never enables the insecure dev resolver on its own

- **WHEN** a reviewer inspects the engine image's own file contents
- **THEN** no instruction sets `ALLOW_INSECURE_DEV_AUTH`

#### Scenario: The image runs in production mode

- **WHEN** a reviewer inspects the engine image's own file contents
- **THEN** an `ENV` instruction sets `NODE_ENV` to `production`
