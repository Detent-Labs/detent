<!-- The MODIFIED block below copies the live http-action-handler
     requirement verbatim, apart from the two lines this change adds. That
     file carries the findings already, and rewriting its prose here would
     make the delta and its destination disagree. This directive dies with
     the change, at archive time. -->
<!-- antislop: allow-file passive-voice long-words synonym-rotation sentence-length -->

## ADDED Requirements

### Requirement: The deployment, not the author, decides what the handler may reach

The handler SHALL check every target against a deployment-held egress policy
before it opens a connection. The policy lives in the environment, beside
`DATABASE_URL` and the `SMTP_*` settings. No part of it lives in a process
body.

The policy decides whether the handler sends the request. It changes no field
of that request. The requirement that the handler builds its request from
static config alone stays true.

The policy holds two rules.

First, the target host SHALL appear in `HTTP_ACTION_ALLOWED_HOSTS`, a
comma-separated list. An entry names a host, which is a hostname with an
optional port. The match is exact, and it covers no subdomain the list does
not name. An unset or empty variable denies every target, the way an unset
`CORS_ALLOWED_ORIGINS` permits no origin.

The handler SHALL strip the space around an entry and SHALL compare letters
without regard to case. A URL's host arrives lower-case and without a default
port. A list the operator typed with a space after each comma, or with a
capital letter, still matches what the URL carries.

Second, the target scheme SHALL be `https:`. A deployment that sets
`HTTP_ACTION_ALLOW_INSECURE` to `1` also accepts `http:`. That escape hatch
exists for a development target and for the test suite.

A target that fails either rule SHALL raise a permanent failure. The message
SHALL name the host or the scheme that failed. The handler SHALL send no
request in that case.

The handler SHALL NOT follow a redirect. A 3xx answer SHALL reach the
existing failure classification, which treats it as permanent. Following a
redirect would check the first hop against the policy and no other hop.

#### Scenario: A target outside the allowlist never opens a connection

- **WHEN** `HTTP_ACTION_ALLOWED_HOSTS` is `api.example.com` and an
  `http.request` action targets `https://169.254.169.254/latest/meta-data/`
- **THEN** the delivery fails permanently with a message naming the host, and
  the handler sends no request

#### Scenario: An unset allowlist denies every target

- **WHEN** `HTTP_ACTION_ALLOWED_HOSTS` is unset or empty and an
  `http.request` action targets any URL
- **THEN** the delivery fails permanently, and the handler sends no request

#### Scenario: An allowlisted host over https succeeds

- **WHEN** `HTTP_ACTION_ALLOWED_HOSTS` holds the target's host and the URL's
  scheme is `https:`
- **THEN** the handler sends the request and classifies the answer the way it
  classifies any other answer

#### Scenario: A spaced, capitalized entry still matches

- **WHEN** `HTTP_ACTION_ALLOWED_HOSTS` is `a.example.com, API.Example.com`
  and an `http.request` action targets `https://api.example.com/hook`
- **THEN** the policy permits the target

#### Scenario: A plain-http target needs the escape hatch

- **WHEN** an `http.request` action targets `http://localhost:3001/hook`,
  `HTTP_ACTION_ALLOWED_HOSTS` holds `localhost:3001`, and
  `HTTP_ACTION_ALLOW_INSECURE` is unset
- **THEN** the delivery fails permanently with a message naming the scheme
- **WHEN** the same action runs with `HTTP_ACTION_ALLOW_INSECURE` set to `1`
- **THEN** the handler sends the request

#### Scenario: A redirect off the allowlist is not followed

- **WHEN** an allowlisted host answers `302` with a `Location` of
  `http://169.254.169.254/`
- **THEN** the handler treats the `302` as a permanent failure, and it sends
  no request to the redirect target

## MODIFIED Requirements

### Requirement: Failures are classified as permanent or transient

The handler SHALL classify every non-success outcome as either permanent
(immediate dead-letter, no retry) or transient (existing outbox retry and
backoff, dead-lettering only after exhausting `MAX_ATTEMPTS`):

- A target the egress policy refuses SHALL be permanent.
- A `3xx` response SHALL be permanent, since the handler follows no redirect.
- A `4xx` response other than `429` SHALL be permanent.
- A `429` response SHALL be transient.
- A `5xx` response SHALL be transient.
- A network error raised by the underlying request SHALL be transient.
- A request that is aborted for exceeding its bound (see the timeout
  requirement below) SHALL be transient.

An egress refusal is permanent because a retry meets the same policy. Only an
operator makes that target reachable, by changing the environment. The
restart that follows re-reads the policy.

#### Scenario: A refused target is a permanent failure

- **WHEN** the egress policy refuses the target's host or scheme
- **THEN** the handler's action delivery dead-letters immediately, without
  consuming a transient retry attempt

#### Scenario: A 404 response is a permanent failure

- **WHEN** the target responds `404`
- **THEN** the handler's action delivery dead-letters immediately, without
  consuming a transient retry attempt

#### Scenario: A 429 response is a transient failure

- **WHEN** the target responds `429`
- **THEN** the handler's action delivery is treated as transient and is
  retried through the existing outbox retry/backoff before dead-lettering
  only if attempts are exhausted

#### Scenario: A 5xx response is a transient failure

- **WHEN** the target responds `500`
- **THEN** the handler's action delivery is treated as transient, identical
  in kind to a `429` response

#### Scenario: A network failure is a transient failure

- **WHEN** the underlying request fails before receiving a response (e.g. a
  connection error)
- **THEN** the handler's action delivery is treated as transient
