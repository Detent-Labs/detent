## ADDED Requirements

### Requirement: A test that spawns a server takes an ephemeral port and reaps its child

A test that spawns a listening process SHALL let the operating system choose
its port. It SHALL NOT hardcode one.

The reason is a measured failure, not a preference. A run that dies abnormally
leaves its child alive, still holding the bind. A later run asking for that
same number then fails at startup. That failure names a port, rather than
whatever orphaned the child.

The test SHALL read the port the child bound, from what the child itself
reports. A port the test picks in advance is the thing this rule removes.

An operating system does not assign a port that something currently holds. A
stray child therefore cannot redden a later run.

A test that spawns such a process SHALL stop it on every path out, including a
failed assertion. A leaked server holds resources the suite shares, a database
connection among them.

This rule cannot cover a runner that dies abnormally. Its `finally` never
runs. The ephemeral port is what makes that survivable, rather than the
cleanup.

#### Scenario: Two runs of the same suite do not collide

- **WHEN** a run leaves a spawned server alive, and the suite runs again
- **THEN** the second run spawns its own server and passes

#### Scenario: A failed assertion leaves no server behind

- **WHEN** an assertion fails between the spawn and the child's exit
- **THEN** the test stops the child before it reports the failure

#### Scenario: The test reads the bound port rather than choosing it

- **WHEN** a spawned server starts
- **THEN** the test learns its port from the child, and the suite declares no
  port for a listener it spawns
