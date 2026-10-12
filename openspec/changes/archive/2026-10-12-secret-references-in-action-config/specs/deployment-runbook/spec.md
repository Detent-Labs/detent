# Spec Delta

## ADDED Requirements

### Requirement: The runbook explains the secret reference allowlist

The runbook SHALL list `HTTP_SECRET_ENV_ALLOWLIST` in its variable table. It
SHALL state that the default refuses every reference. It SHALL give the entry
form `tenant:NAME` for a deployment that serves many tenants. It SHALL say
that such a deployment ignores an entry with no tenant. It SHALL say that rotating
a secret means changing the variable and restarting the engine, with no new
process version.

#### Scenario: An operator finds the allowlist and the rotation steps

- **WHEN** an operator reads the runbook to connect a partner API that needs
  a bearer token
- **THEN** the table row names `HTTP_SECRET_ENV_ALLOWLIST`, its default and
  its entry form, and the runbook states the rotation steps

#### Scenario: An operator of a deployment with many tenants finds the entry form

- **WHEN** an operator reads the row in a deployment that sets
  `TENANT_CONTROL_PLANE_URL`
- **THEN** the row shows `tenant:NAME` and says an unscoped entry has no
  effect there
