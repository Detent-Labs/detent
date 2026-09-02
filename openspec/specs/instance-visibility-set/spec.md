<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the
     rest of this repo's specs use (see data-retention/spec.md's own
     allow-file passive-voice for the same reason). That grammar is
     structurally passive ("WHEN X is called", "THEN Y is deleted");
     rewriting it to dodge the rule would break the required Scenario
     format. -->

## Purpose

Records who took part in an instance, so a reader can ask which instances they
were involved in. Participation accumulates as the instance moves through its
steps, and no author configures anything.

## Requirements

### Requirement: An instance carries a set of principals

The engine SHALL maintain, per instance, a set of principals. A principal is an
actor id, a role string, or a group id. It is the same value kind a step's
assignment candidates already hold.

The set SHALL be a set. A principal added twice appears once.

The set is not the definition and not the instance body. It SHALL NOT
participate in `definitionHash`, and adding it SHALL NOT invalidate any
published definition.

#### Scenario: A principal appears once however often it is added

- **WHEN** the same principal is added to one instance's set twice
- **THEN** the set holds one entry for it

#### Scenario: The set is absent from the definition hash

- **WHEN** an instance accumulates principals
- **THEN** its pinned `definitionHash` is unchanged, and its published
  definition stays valid

### Requirement: Four events append principals

The engine SHALL append principals at four points, each inside the transaction
that already commits the event.

On instance creation it SHALL add the starter, when the instance has one.

On every step entry it SHALL add the assignment candidates that entry commits.
This holds for a step entry of any cause. A participant's submit, an automatic
transition, a timer-forced transition and a migration relocation all append.

A migration is the one cause that commits no new candidate. It carries the
instance's existing assignment rather than resolving the target step's, so its
append finds every principal already there. Involvement does not change under a
migration, and neither does visibility.

On a claim or a delegation it SHALL add the actor who now holds the claim. A
delegation target does not join the assignment candidates. Without this rule
the delegate would hold a claim on an instance they cannot list.

On a subprocess spawn it SHALL copy the parent instance's principals, as they
stand at that moment, into the child.

#### Scenario: The starter joins the set at creation

- **WHEN** an actor creates an instance
- **THEN** that actor is a principal of it

#### Scenario: A step's candidates join the set at entry

- **WHEN** an instance enters a step whose assignment resolves to candidates
- **THEN** every resolved candidate is a principal of that instance

#### Scenario: A migration relocation adds nobody

- **WHEN** a migration moves an instance onto a step whose own assignment names
  a candidate the set does not hold
- **THEN** the principal set is unchanged, because the migration carried the
  instance's existing assignment instead of resolving that step's

#### Scenario: A delegate joins the set

- **WHEN** a claimant delegates their claim to an actor who is not an
  assignment candidate
- **THEN** that actor is a principal of the instance

#### Scenario: A spawned child inherits the parent's principals

- **WHEN** a subprocess step spawns a child instance
- **THEN** every principal the parent held at that moment is a principal of the
  child

#### Scenario: A chained instance inherits nothing

- **WHEN** a `process.start` action creates an instance from an acting one
- **THEN** the created instance holds none of the acting instance's principals
- **AND** the reason is that a chain link is a reporting backlink, not a
  parent

#### Scenario: A principal added to the parent after a spawn does not reach the child

- **WHEN** a parent instance gains a principal after its child was spawned
- **THEN** the child's set is unchanged

#### Scenario: The append shares the step entry's transaction

- **WHEN** a step-entry commit fails
- **THEN** neither the step entry nor its principals are written

### Requirement: Participation never removes a principal

No ordinary workflow event SHALL remove a principal from the set. Four in
particular SHALL leave an existing principal in place:

- leaving a step
- releasing a claim
- losing a place among a step's candidates
- a migration

Only two things remove one: an explicit administrative revocation, and the
redaction rule in the `data-retention` capability.

An operator action therefore cannot take a participant's access away by
accident. It can only take it away on purpose.

#### Scenario: Leaving a step keeps the principal

- **WHEN** an instance moves off a step whose candidate C is a principal
- **AND** C is not a candidate on the step it enters
- **THEN** C is still a principal of that instance

#### Scenario: Releasing a claim keeps the principal

- **WHEN** a claimant releases their claim
- **THEN** that actor is still a principal of the instance

#### Scenario: A completed instance keeps its principals

- **WHEN** an instance reaches a terminal step and its assignment is cleared
- **THEN** every principal it accumulated is still a principal of it

#### Scenario: A cancelled instance keeps its principals

- **WHEN** an instance is cancelled
- **THEN** every principal it accumulated is still a principal of it

### Requirement: An administrator revokes one person from one instance

The engine SHALL let an administrator revoke a named actor's visibility of a
named instance. It SHALL also let one restore it.

A revocation SHALL name the actor, never the principal the actor matched by.
An actor commonly matches through a role or a group. Removing that principal
would revoke the instance for every other holder of it. That is not the
operation an administrator asked for.

A revocation SHALL hold while the actor keeps matching a principal the instance
carries. The instance moving through further steps SHALL NOT clear it. Only two
things clear it: an administrator restoring it, and the assignment rule below.

Restoring a revocation SHALL return the actor to the visibility they had
before. It SHALL have no other effect.

A revocation SHALL narrow the accumulated set alone. It SHALL NOT change the
instance body, its assignment, its history, or any other actor's visibility.

#### Scenario: A revoked actor loses an instance they saw through a group

- **WHEN** actor A sees an instance because it carries a group A belongs to
- **AND** an administrator revokes A from that instance
- **THEN** A no longer sees it

#### Scenario: Revoking one actor leaves the group's other members alone

- **WHEN** an administrator revokes actor A from an instance A saw through a
  group
- **THEN** every other member of that group still sees it

#### Scenario: Moving through unrelated steps does not clear a revocation

- **WHEN** an instance A was revoked from enters further steps
- **AND** none of them resolves A as a candidate or claimant
- **THEN** A still does not see it, though the instance still carries the group
  A belongs to

#### Scenario: Restoring returns the earlier visibility

- **WHEN** an administrator restores a revoked actor
- **THEN** that actor sees the instance again

#### Scenario: A revocation touches nothing else

- **WHEN** an administrator revokes an actor from an instance
- **THEN** the instance's body, assignment and history are unchanged

### Requirement: A live assignment outranks a revocation

A revoked actor SHALL see the instance while the workflow assigns them work on
it. Assignment here means one of two things. The actor is an eligible candidate
on the instance's current step, or the actor holds its claim.

The override SHALL be live, evaluated as the list is read. The revocation
SHALL stay stored while it is overridden. No commit path deletes one.

Two properties follow, and both are intended.

The engine can never hand an actor a task they cannot open. That state has no
resolution inside the product, so the assignment has to win.

An administrator's revocation survives the assignment that overrode it. When
the instance moves to a step that does not assign the actor, the revocation
applies again. A workflow routing one task therefore cannot permanently undo a
decision an administrator made on purpose.

An administrator who wants the actor off the case for good removes the
assignment as well. That is an assignment operation, not a visibility one.

#### Scenario: An assigned revoked actor sees the instance

- **WHEN** an instance A was revoked from enters a step resolving A as an
  eligible candidate
- **THEN** A sees that instance

#### Scenario: A claim by a revoked actor restores their access

- **WHEN** a revoked actor takes the claim on the instance's current step
- **THEN** that actor sees the instance

#### Scenario: The revocation applies again once the assignment ends

- **WHEN** an assignment has been overriding a revocation
- **AND** the instance moves to a step that does not assign that actor
- **THEN** the actor no longer sees the instance

#### Scenario: No commit deletes a revocation

- **WHEN** a step entry assigns a revoked actor
- **THEN** the revocation is still stored afterwards

### Requirement: An administrator grants a person an instance they never took part in

The engine SHALL let an administrator add a named actor as a principal of a
named instance. The actor then sees it under the visible scope, exactly as a
participant does.

This is the mirror of revocation. It covers the person a workflow never routed
work to. A supervisor asked to examine one case is the worked example.

#### Scenario: A granted actor sees the instance

- **WHEN** an administrator grants actor B an instance B never took part in
- **THEN** B sees it under the visible scope

#### Scenario: A grant reaches no other instance

- **WHEN** an administrator grants actor B one instance
- **THEN** B's visibility of every other instance is unchanged

### Requirement: A visibility change is recorded

The engine SHALL append a runtime event to the instance for every revocation,
restoration and grant. The event SHALL name the acting administrator and the
actor whose visibility changed.

A visibility change is an access decision an auditor has to be able to
reconstruct. Nothing else in the instance's record would show it.

#### Scenario: A revocation appears in the instance's record

- **WHEN** an administrator revokes an actor from an instance
- **THEN** the instance's record carries an event naming both actors

#### Scenario: A grant appears in the instance's record

- **WHEN** an administrator grants an actor an instance
- **THEN** the instance's record carries an event naming both actors

### Requirement: Revoking is a process-scoped permission

The engine SHALL gate revocation, restoration and grant behind the
process-scoped permission mechanism the `authorization` capability defines. It
SHALL check against the process the instance belongs to.

Today that permission SHALL take the operator role, so only an operator
performs these three. An installation that later wants a per-process
administrator writes a grant for it, and needs no code change.

The permission SHALL NOT be expressed as a role string carrying a scope. A role
names a principal and a grant names the scope, which is the division the
`authorization` capability already holds.

#### Scenario: An operator may revoke on any process

- **WHEN** an actor holding the operator role revokes an actor from an instance
- **THEN** the engine performs it

#### Scenario: An actor with no standing may not revoke

- **WHEN** an actor holding neither the operator role nor a matching grant
  attempts a revocation
- **THEN** the engine refuses it

#### Scenario: A grant admits a per-process administrator

- **WHEN** the store holds a grant of this permission to role R over process A
- **AND** an actor holding R revokes an actor from an instance of process A
- **THEN** the engine performs it
- **AND** the same actor's revocation on an instance of process B is refused

### Requirement: An actor's principal set resolves from the credential

The engine SHALL match a reader against an instance's principals on three
values. Those are the reader's own id, the reader's roles, and the group ids
the reader belongs to. It SHALL resolve all three from the reader's credential,
never from a client-supplied value.

Group membership resolves live, against the group store. An actor joining a
group SHALL therefore reach the instances that group is a principal of. No
instance's set is rewritten.

#### Scenario: A role match is enough

- **WHEN** an instance holds role R as a principal and a reader holds R
- **THEN** the reader matches that instance

#### Scenario: A group match is enough

- **WHEN** an instance holds group G as a principal and a reader is a member
  of G
- **THEN** the reader matches that instance

#### Scenario: Joining a group reaches existing instances

- **WHEN** an actor joins group G, which is already a principal of an instance
- **THEN** that actor matches the instance without the instance being rewritten

#### Scenario: A client-supplied identity is ignored

- **WHEN** a reader supplies an actor id belonging to another actor
- **THEN** the match uses the credential's own actor, not the supplied id

### Requirement: Existing instances are backfilled once

The change SHALL derive a principal set for every instance that exists before
the set does. It SHALL derive it from four sources:

- the instance's starter
- its current assignment candidates
- its claimant
- the acting actor recorded on each history entry

Without the backfill every pre-existing instance would carry an empty set and be
invisible to every reader. The backfill SHALL be idempotent, so a second run
adds nothing.

#### Scenario: A pre-existing instance gains its historical actors

- **WHEN** the backfill runs over an instance whose history records actor A as
  having taken a transition
- **THEN** A is a principal of that instance

#### Scenario: The backfill is idempotent

- **WHEN** the backfill runs a second time
- **THEN** no instance's principal set changes

### Requirement: Every branch of the read carries the whole filter set

The read resolves one bounded, ordered lookup per principal and merges them.
Each lookup SHALL apply every filter the request carries, before its own bound.

A lookup that returns rows a later step discards under-fills the page. The
list decides whether more rows exist by comparing the row count against the
requested limit. An under-filled page therefore reports no cursor, and the
walk stops while visible instances remain. That is silent truncation of a
reader's own list, and it is the failure this requirement prevents.

#### Scenario: A page stays full when a filter excludes branch rows

- **WHEN** a reader requests a page, and some instances their principals reach
  are excluded by a filter the request carries
- **THEN** the page holds the full requested count, as long as that many
  visible instances remain

#### Scenario: The walk reaches every visible instance

- **WHEN** a reader pages to the end of a result whose instances are partly
  excluded by a filter
- **THEN** every instance they may see is returned across the pages, and the
  walk does not stop early

### Requirement: The read stays fast for a narrow and a broad reader

A reader's principals vary in how many instances they reach. A personal id
reaches few. A role held across the organization reaches nearly all. The read
SHALL stay efficient across that range. It SHALL NOT degrade into a full scan
of the principal set, nor into an external sort, for either shape.

The read SHALL resolve one ordered, bounded lookup per principal. It SHALL
merge those in the list's existing order. It SHALL NOT run one lookup over
the union of the reader's principals. A union lookup cannot use the ordering
index once one of the reader's principals reaches most instances.

It SHALL NOT express the whole rule as one predicate over the instances
relation either. That shape reads well and defeats the indexes. The
alternation between the principal test and the live-assignment test can use
neither one's index.

The stored set SHALL carry the list's ordering key. One index then serves both
the principal lookup and that order.

#### Scenario: A reader holding a widespread role pages without an external sort

- **WHEN** a reader whose principals include a role most instances hold
  requests a page
- **THEN** the read returns the page from indexed lookups, with no external sort

#### Scenario: A reader holding only a personal id pages without a full scan

- **WHEN** a reader whose principals reach a small fraction of instances
  requests a page
- **THEN** the read returns the page without scanning every instance

#### Scenario: A deep page costs no more than a first page

- **WHEN** a reader requests a page far into the result
- **THEN** the read resolves it from the same indexed lookups

### Requirement: The direct read consults the set

The engine SHALL answer a direct read of one instance from the same rule the
visible scope lists by. A direct read is `getInstanceView`. It is also every
other Runtime API Layer call that shares its loader: comments and
attachments, in both directions.

For an ordinary instance and a non-administrative actor, the direct read SHALL
admit the actor on either of two grounds:

- a live assignment: the actor holds the current step's claim, or is an
  eligible candidate on it;
- participation, with no revocation naming the actor on this instance. The
  actor started the instance. Or the instance's principal set holds the
  actor's id, a role of theirs, or a group of theirs.

A live assignment SHALL outrank a revocation, and SHALL clear nothing. The
"A live assignment outranks a revocation" requirement states that rule for
the list. Here it applies to one instance.

The actor's principal set SHALL resolve as the "An actor's principal set
resolves from the credential" requirement states. That is id, roles and group
memberships, from the credential alone. The engine SHALL resolve that set in
one function. The direct read, the visible scope and report sharing SHALL all
call it.

A refused actor SHALL get the same `AuthorizationError` an unrelated actor
gets. The refusal SHALL disclose nothing about the instance.

A test instance SHALL keep the narrower rule of the `runtime-api` capability.
Its principal set is not consulted.

The list and the direct read SHALL agree on the participation ground. An
instance the visible scope returns to an actor by a principal match SHALL open
for that actor. One it withholds on that ground SHALL refuse them.

Three cases sit outside that guarantee. A test instance never reaches a
participant list, and its starter still opens it. The live-assignment ground
carries its own predicate on each side, and the two do not match today. The
starter ground has no SQL form at all, so the list omits an instance the
backfill never reached.

#### Scenario: A past participant opens the instance

- **WHEN** an actor was a candidate on a step the instance has since left
- **AND** that actor holds no claim and no candidacy on the current step
- **THEN** `getInstanceView` returns the view

#### Scenario: A group member opens the instance

- **WHEN** the instance holds group G as a principal and the actor is a member
  of G
- **THEN** `getInstanceView` returns the view

#### Scenario: A revoked participant is refused

- **WHEN** an administrator has revoked the actor from the instance
- **AND** the actor holds no claim and no candidacy on the current step
- **THEN** `getInstanceView` throws `AuthorizationError`

#### Scenario: A revoked starter is refused

- **WHEN** an administrator has revoked the instance's starter
- **AND** the starter holds no claim and no candidacy on the current step
- **THEN** `getInstanceView` throws `AuthorizationError`

#### Scenario: A live assignment outranks the revocation on the direct read

- **WHEN** a revoked actor holds the current step's claim, or is an eligible
  candidate on it
- **THEN** `getInstanceView` returns the view
- **AND** the revocation is still stored

#### Scenario: The revocation applies again after the assignment ends

- **WHEN** an assignment has been overriding a revocation on the direct read
- **AND** the instance moves to a step that does not assign that actor
- **THEN** `getInstanceView` throws `AuthorizationError` for that actor

#### Scenario: A granted actor opens the instance

- **WHEN** an administrator has granted an actor an instance they never took
  part in
- **THEN** `getInstanceView` returns the view to that actor

#### Scenario: Comments and attachments follow the same rule

- **WHEN** a past participant lists or posts comments on the instance, or
  uploads, lists or downloads an attachment
- **THEN** the call succeeds
- **AND** the same call by a revoked participant with no live assignment
  throws `AuthorizationError`

#### Scenario: A test instance keeps its own rule

- **WHEN** a test instance holds a group as a principal
- **AND** a member of that group, who did not start it, requests the view
- **THEN** `getInstanceView` throws `AuthorizationError`

### Requirement: The report reads by the same rule, the aggregates never do

The engine SHALL narrow a report's rows by the rule the visible scope lists
by. A row a viewer may not see SHALL be absent from the table. The table
raises nothing, marks nothing, and counts nothing it left out.

The rule is the one the list and the direct read carry. A live assignment on
the current step admits, and consults no revocation. Participation admits
too, unless a revocation names the actor. Taking part means the starter, or a
match between the actor's principals and the instance's principal set.

The engine SHALL narrow the report through the same row set the visible list
uses. It SHALL NOT carry a second predicate for one rule. The list, the direct
read and the report SHALL agree on which instances an actor may see.

An `ADMIN_ROLE` caller SHALL read unnarrowed, as they do on the list and the
direct read.

The three aggregate views SHALL stay unfiltered permanently. Those are cycle
time, bottleneck and SLA. They return distributions over steps. They return no
instance id and no field value. A narrowed population would hand two readers
two different cycle times, and no screen would explain the difference.

`reporting-analytics-api` owns those three views and keeps its own gate. This
requirement binds them from outside and asks nothing of them.

#### Scenario: A report withholds a row the list withholds

- **WHEN** an instance matches a report's query
- **AND** the visible list does not return that instance to the viewer
- **THEN** the report's table holds no row for it

#### Scenario: A report returns a row the list returns

- **WHEN** an instance matches a report's query
- **AND** the visible list returns that instance to the viewer
- **THEN** the report's table holds its row

#### Scenario: A live assignment admits a revoked viewer's row

- **WHEN** a revoked viewer holds the current step's claim on a matching
  instance
- **THEN** the report's table holds that instance's row

#### Scenario: An operator reads the whole table

- **WHEN** an actor holding `ADMIN_ROLE` executes a report
- **THEN** no row is withheld

#### Scenario: The aggregates answer the same numbers to every reader

- **WHEN** two actors with different visible sets read the cycle-time view
  for one process
- **THEN** both receive the same distribution
