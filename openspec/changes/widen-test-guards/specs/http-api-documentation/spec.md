# Spec Delta

## ADDED Requirements

### Requirement: A test holds the document to the required route list

A test SHALL read the route list that "OpenAPI document exists and covers the
customer-facing surface" names. It SHALL assert that `docs/openapi.yaml` lists
every route of that list, by method and path. A document that omits one route
SHALL fail the test. The failure SHALL name the route.

#### Scenario: Every required route has an entry

- **WHEN** the test runs against the shipped document
- **THEN** each required route appears under its method and path

#### Scenario: A removed route fails the test

- **WHEN** a path or one of its methods leaves the document
- **THEN** the test fails and names the route
