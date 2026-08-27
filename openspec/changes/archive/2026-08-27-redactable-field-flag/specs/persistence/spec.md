## MODIFIED Requirements

### Requirement: The audit relation is append-only for the application

`initSchema` SHALL grant only insert and select on the audit relation to
the role the engine connects as. It SHALL NOT grant update or delete.
Insert SHALL stay, so the trigger's own writes still land.

`initSchema` SHALL also revoke the redaction function's execute
privilege from `PUBLIC`. A function created with no explicit privilege
list carries one. The redaction is the single path that clears a stored
value, and it belongs to the engine's role alone.

The relation and the redaction function SHALL belong to a separate
login-less owner role `initSchema` creates. Clearing the redactable
fields' values SHALL run under that owner's privilege. The trigger's
append and that redaction SHALL be the only two paths that write the
relation.

`initSchema` SHALL grant the engine's role membership in that owner role
without inheritance. Creating the owner's objects needs the membership.
An inheriting grant would hand the engine's role the owner's update and
delete outright, with no assumption of the role.

A superuser is restrained by no grant. The guarantee therefore holds
against a non-superuser role, and the tests SHALL create one to prove it
there.

#### Scenario: A non-superuser role cannot update an audit row

- **WHEN** a non-superuser role with the engine's grants and its
  membership updates a row of the audit relation
- **THEN** the database refuses the statement

#### Scenario: A non-superuser role cannot delete an audit row

- **WHEN** a non-superuser role with the engine's grants and its
  membership deletes a row of the audit relation
- **THEN** the database refuses the statement
