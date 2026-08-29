# draft-test-instances

## Purpose

Defines the studio-only capability that creates a real, running instance
against a process's current draft body — frozen at the moment of creation —
so an author can exercise a process before it has ever been published, marked
distinctly from every instance created against a published version.

## ADDED Requirements

### Requirement: A test instance executes the process's current draft body

Creating a test instance SHALL start a real instance of the target process
whose frozen body is the process's current draft body, not a published
version. Every execution mechanism that applies to an ordinary instance
SHALL apply identically: candidate resolution and assignment at step entry,
claim and release, submission and transition, timer arming and firing, and
action dispatch through the transactional outbox with real side effects.
Nothing about a test instance's execution SHALL be simulated, mocked, or
suppressed.

#### Scenario: A test instance is created from an unpublished draft edit
- **WHEN** an authoring-capable actor creates a test instance for a process whose draft was just edited
- **THEN** a new instance is created and its resolved body reflects the draft's current content, including edits never published

#### Scenario: A test instance dispatches real actions
- **WHEN** a test instance transitions across a path whose `onPath` carries an action (for example `notification.email`)
- **THEN** the action is enqueued to the transactional outbox and dispatched exactly as it would be for an instance created against a published version

#### Scenario: A test instance supports claim and submit like any instance
- **WHEN** a test instance is on a step with assignment, and a candidate actor claims it and submits data
- **THEN** the claim and submission succeed and transition the instance using the same rules that govern an ordinary instance

### Requirement: A test instance's body is frozen at creation

The draft body a test instance runs against SHALL be captured as a snapshot
at the moment the test instance is created. A later save to the process's
draft — including one that edits the step the test instance currently
occupies — SHALL NOT alter the already-created test instance's resolved
steps, guards, fields, or any other resolved content. Every rehydration of
the test instance for the rest of its lifetime SHALL resolve against that
same frozen snapshot, never against the draft's current state.

#### Scenario: A draft edit after creation does not affect a running test instance
- **WHEN** a test instance is created from a draft, and the draft is subsequently saved with a change to the step the test instance is currently on
- **THEN** the running test instance continues to resolve its current step, guards, and fields exactly as they were at the moment the test instance was created

#### Scenario: A draft edit after creation does not affect a test instance created earlier from a different revision
- **WHEN** two test instances are created from the same process at different draft revisions
- **THEN** each instance resolves its own frozen snapshot independently, and a later edit to the draft affects neither already-created instance

### Requirement: A test instance is marked distinctly from a published instance

Every instance created against a process's draft body SHALL carry a marker
identifying it as a test instance, distinct from the marker every other
instance carries. Every instance created against a published version —
including every instance that existed before this capability existed —
SHALL carry the marker identifying it as a published instance.

#### Scenario: A newly created test instance carries the test marker
- **WHEN** an authoring-capable actor creates a test instance
- **THEN** the created instance's marker identifies it as a test instance

#### Scenario: A newly created ordinary instance carries the published marker
- **WHEN** an actor creates an instance against a process's published version, through the ordinary instance-creation path
- **THEN** the created instance's marker identifies it as a published instance

#### Scenario: An instance created before this capability existed reads as published
- **WHEN** an instance created prior to this capability's introduction is read
- **THEN** its marker identifies it as a published instance, with no migration step required to produce that reading

### Requirement: Only an authoring-capable actor may create a test instance

Creating a test instance for a process SHALL require the same standing an
actor already needs to read and write that process's draft. An actor lacking
that standing SHALL be refused server-side, even if the actor holds a valid
session granting some other role.

#### Scenario: An author or developer may create a test instance
- **WHEN** an actor holding the author role, or the developer role, requests creation of a test instance for a process
- **THEN** the test instance is created

#### Scenario: An actor without authoring standing is refused
- **WHEN** an actor holding no role that grants draft read/write access requests creation of a test instance for a process
- **THEN** the request is refused with an authorization error, and no instance is created

### Requirement: Creating a test instance requires no published version

Creating a test instance SHALL succeed for a process that has a draft but has
never been published. Nothing about test-instance creation SHALL require a
`definitions` row to exist for the process.

#### Scenario: A never-published process can still have a test instance created
- **WHEN** an authoring-capable actor creates a test instance for a process that has a saved draft and no published version
- **THEN** the test instance is created successfully, running the draft body

### Requirement: A structurally unsound draft fails gracefully, not at creation time

Creating a test instance SHALL perform no structural validation of the
draft's soundness beyond what is needed to begin execution. A draft that
could never occur in a published body — for example a step whose declared
type does not match its own spec, or a reference to a step id that does not
exist in the draft — SHALL NOT be rejected at creation time by a dedicated
pre-play validation pass. When execution reaches content that cannot be
resolved, the test instance SHALL fail in the same controlled way any other
unresolvable runtime condition does: a diagnostic response naming what
failed, never an unhandled crash with no diagnostic.

#### Scenario: An unresolvable initial step fails the creation request gracefully
- **WHEN** an authoring-capable actor creates a test instance for a draft whose `workflow.initialStep` names a step id absent from the draft's own step list
- **THEN** the creation request fails with a diagnostic response identifying the unresolved step, and no test instance is left running

### Requirement: A subprocess step always fails gracefully for a test instance

A test instance reaching a `subprocess` step SHALL NEVER spawn a child
process instance; spawning a child from a test instance is out of scope for
this capability, categorically, regardless of whether the referenced child
process has a resolvable published version. When a test instance's current
step is a `subprocess` step, the spawn attempt SHALL fail in the same
controlled way as any other unresolvable runtime condition — whether the
child process has no matching published version, or does have one — rather
than ever succeeding in spawning a real child instance.

#### Scenario: A test instance parks at a subprocess step whose child has no resolvable version
- **WHEN** a test instance's execution reaches a `subprocess` step whose declared child process has no version resolvable at that spawn attempt
- **THEN** the spawn attempt fails in a controlled way with a diagnostic naming the unresolved child, and no child instance is created

#### Scenario: A test instance parks at a subprocess step whose child DOES have a resolvable version
- **WHEN** a test instance's execution reaches a `subprocess` step whose declared child process HAS a version resolvable at that spawn attempt
- **THEN** the spawn attempt still fails in a controlled way with a diagnostic naming the step, and no child instance is created, exactly as if the child were unresolvable

### Requirement: A `process.start` action from a test instance stays a test instance

When a test instance dispatches a `process.start` action, the newly started
instance SHALL carry the same `kind` as the acting (test) instance, rather
than the default `kind: "published"` an ordinary `process.start` dispatch
produces. A chain of instances started, directly or transitively, from a
test instance's `process.start` action SHALL therefore remain subject to
this capability's visibility rules at every link in the chain.

#### Scenario: A test instance's process.start action starts another test instance
- **WHEN** a test instance transitions across a path whose `onPath` carries a `process.start` action
- **THEN** the newly started instance is created with `kind: "test"`, not `kind: "published"`, and is subject to the same visibility exclusions as the acting instance

#### Scenario: An ordinary instance's process.start action is unaffected
- **WHEN** an ordinary, `kind: "published"` instance dispatches a `process.start` action
- **THEN** the newly started instance is created with `kind: "published"`, matching today's behavior
