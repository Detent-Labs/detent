## ADDED Requirements

### Requirement: An area's router ships match, round-trip and half-match coverage

`CLAUDE.md` names an `/admin/*` route collision as one of three defects that
shipped past a green suite. Every area router in `packages/web` SHALL carry
the coverage `admin-routing.test.ts` already has.

A change that adds or edits a route SHALL extend that coverage.

#### Scenario: A new route matches and round-trips

- **WHEN** an area gains a route
- **THEN** a test asserts that the path matches the route
- **AND** a test asserts that the route round-trips through its path builder

#### Scenario: A deeper path does not half-match

- **WHEN** a request path runs deeper than a declared route
- **THEN** a test asserts the router falls back rather than half-matching

#### Scenario: Two prefixes do not collide

- **WHEN** an area declares two routes sharing a leading segment
- **THEN** a test asserts each path reaches its own route
- **AND** an area with no such pair carries no contrived case for it
