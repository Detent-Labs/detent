<!-- antislop: allow-file sentence-length run-ons passive-voice em-dash synonym-rotation -->

## ADDED Requirements

### Requirement: A browser navigation is answered from the web root before route matching

An area's URL prefix can be the same as an API prefix. The admin area's
`/admin/outbox`, `/admin/timers` and `/admin/users` screens have exactly the
paths of three `GET` admin routes, so serving assets only behind every API route
answers a reload or a shared link to those screens with `401` JSON instead of
the shell.

The server SHALL therefore offer a `GET` or `HEAD` **navigation** request to
this capability BEFORE matching any API route, whenever a web root is
configured. Every other request keeps the existing order, in which an API route
answers first and only an unmatched request reaches the web root.

A navigation request is one carrying `Sec-Fetch-Mode: navigate`. When the
request carries no `Sec-Fetch-Mode` header at all, a request whose `Accept`
names `text/html` SHALL count as a navigation.

An API caller that asks for HTML therefore receives the shell document rather
than its route's JSON. That is the deliberate cost of the rule, and it is why
the test is this narrow rather than "any request a browser could make".

#### Scenario: A reload of a colliding admin screen serves the shell

- **WHEN** a browser navigates to `/admin/outbox`, sending
  `Sec-Fetch-Mode: navigate`, and a web root is configured
- **THEN** the response is the shell document with `200`, not the admin route's
  `401`

#### Scenario: The area's own request still reaches the API route

- **WHEN** the admin area fetches `/admin/outbox` with `Sec-Fetch-Mode: cors`
- **THEN** the admin route answers, exactly as it did before this rule

#### Scenario: A client sending no Sec-Fetch headers is judged by Accept

- **WHEN** a `GET` arrives with no `Sec-Fetch-Mode` and an `Accept` naming
  `text/html`
- **THEN** it is treated as a navigation

#### Scenario: A non-navigation request is unaffected by the reordering

- **WHEN** a `GET` arrives with `Sec-Fetch-Mode: no-cors` for an asset under the
  web root
- **THEN** it is served from the web root by the existing fallthrough, behind
  route matching, unchanged

#### Scenario: A navigation to an unmatched path still serves the shell

- **WHEN** a browser navigates to `/studio/processes/p1/edit`, which matches no
  API route
- **THEN** the response is the shell document, as it was before this rule
