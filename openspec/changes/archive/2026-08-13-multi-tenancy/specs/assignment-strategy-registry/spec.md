<!-- antislop: allow-file passive-voice -->
<!-- The base spec carries this same directive, for the same reason: SHALL-form
     normative spec prose. -->

## ADDED Requirements

### Requirement: A strategy that reads the database takes it from the context

A strategy needing its own database access SHALL take that handle from the
resolution context. It SHALL NOT take one bound at registry construction.

Every context SHALL carry the handle. It is not optional: an absent handle has
no sane fallback once one process serves many tenants.

`org.manager-of-starter` reads `auth_users`. Bound at construction it would
resolve every tenant's manager against one directory. The wrong actor would
then land in the wrong inbox.

The `static` strategy reads no database and SHALL ignore the handle.

This reverses a decision `registry.ts` states in a comment, and
`.claude/rules/process-contract.md` restates. Both said no connection handle
travels in this context. Both SHALL change with this requirement, so the rule
file and the code do not disagree.

#### Scenario: A manager resolves in the instance's own tenant

- **WHEN** a step in tenant `acme` resolves `org.manager-of-starter`
- **THEN** the lookup reads `acme`'s account directory

#### Scenario: The static strategy is unaffected

- **WHEN** a step resolves the `static` strategy
- **THEN** it answers its configured list, as it does today
