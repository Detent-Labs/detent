## ADDED Requirements

### Requirement: The HTTP server declares a maximum request body size

`Bun.serve` SHALL be given an explicit `maxRequestBodySize`, sized to the
largest plausible legitimate request (a definition or draft of a few
megabytes), rather than inheriting Bun's 128 MiB default.

The default is the only bound that exists today between an HTTP caller and
persisted state: no route narrows it, `saveDraft` deliberately validates only
its envelope, and a submitted value on a `file`- or plugin-typed field passes
the runtime type check without a size constraint an author could even declare.
This requirement covers the transport edge only — it does not claim to bound
what a body may contain once accepted.

An over-size request SHALL be refused by the server before any route handler
runs; the refusal is a transport-level failure, not a typed engine error.

#### Scenario: An ordinary request is unaffected

- **WHEN** any route is called with a realistic body — a definition, a draft,
  a submission
- **THEN** it is processed exactly as before

#### Scenario: An over-size request is refused

- **WHEN** a request body exceeds the configured maximum
- **THEN** the server refuses it without invoking a route handler, and nothing
  is written

#### Scenario: The limit is a single declared value

- **WHEN** the server is constructed
- **THEN** the maximum is declared in one place in the composition root, so
  the bound that applies to publish, draft save and submission is the same
  reviewable number
