# Spec Delta

## ADDED Requirements

### Requirement: A login email with a NUL byte is a request error

`POST /auth/login` SHALL answer `400` with `error.type` equal to
`"request-shape"` when `email` has a NUL character. The check SHALL run
before either rate-limit window records a try and before any database query.
A refused request is not a try, so it adds nothing to either count.

#### Scenario: A NUL byte in the email

- **WHEN** an anonymous caller sends `POST /auth/login` with the email
  `a\u0000b@x.ch`
- **THEN** the response is `400` with `Content-Type` `application/json` and
  `error.type` equal to `"request-shape"`
- **AND** no database query runs

#### Scenario: The refused request leaves the count unchanged

- **WHEN** a caller sends that request more often than the per-email limit
- **THEN** every response is `400` and none is `429`
