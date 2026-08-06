## ADDED Requirements

### Requirement: A clone's push connection survives its own pre-push hook

The repository SHALL arm an SSH keepalive for its own pushes. The script the
root `prepare` step runs SHALL set `core.sshCommand` to an `ssh` invocation
carrying `ServerAliveInterval` and `ServerAliveCountMax`. It sets that beside
the `core.hooksPath` it already sets, in the same run of `bun install`. No
clone SHALL need a contributor to type it.

Git opens the connection to the remote before it runs `pre-push`. The hook's
standard input carries a remote object name per ref. Only the remote supplies
that name. The hook then runs the gates, the typecheck and the full suite.
That takes minutes. No byte crosses the connection in that time, so the
remote closes it.

The hook then exits 0, and git writes the pack into a dead socket. The push
stops at exit 141, which is 128 + 13 for SIGPIPE.

That exit code is the reason this rule is mechanical. No gate rejected
anything. So 141 reads as a broken pipe inside the hook, and it sends the
reader to the wrong file. The line that names the cause is
`Connection to github.com closed by remote host`. It reached one failing log
of four.

`ServerAliveInterval` SHALL be short enough to keep traffic on the connection
while the hook runs. The value answers the remote's idle tolerance, not the
hook's runtime. Each reply resets the clock, so one interval under that
tolerance holds the connection for any duration.

`ServerAliveCountMax` multiplied by the interval SHALL exceed the hook's
wall-clock runtime. ssh disconnects once that many probes go unanswered. A
product under the runtime turns a short network drop inside the hook window
into the failure this rule removes. The values in force are
`ServerAliveInterval=20` and `ServerAliveCountMax=30`. ssh therefore
tolerates 600 seconds.

The script SHALL NOT overwrite a `core.sshCommand` that a contributor already
set. Such a value may carry an identity file, a `ProxyCommand`, or a
different ssh binary. Overwriting it breaks that contributor's access to
every remote. The script SHALL print the two options to add, and SHALL
exit 0.

The script SHALL keep out where the environment carries `GIT_SSH`. Only the
`ssh` variant takes `-o option`. A `plink`, `putty` or `tortoiseplink` user
given `ssh -o ...` gets a different program. The script SHALL print the two
options to add there too.

The script SHALL leave the setting alone where the value already matches what
it writes. It SHALL say so. `bun install` runs the script at every install,
not only the first.

Where no git repository answers, the script SHALL exit 0 and set nothing.
`core.hooksPath` already follows that rule, for the same reason.
The production image builds from a copied tree with no `.git` directory.

`GIT_SSH_COMMAND` needs no rule. It wins over `core.sshCommand`, so a
contributor who exports it keeps what they exported.

#### Scenario: A fresh clone gains the keepalive from its first install

- **WHEN** a contributor clones the repository and runs `bun install`, with no
  `core.sshCommand` set and no `GIT_SSH` in the environment
- **THEN** `core.sshCommand` carries `ServerAliveInterval` and
  `ServerAliveCountMax`, and the script prints the value it wrote

#### Scenario: A contributor's own ssh command survives the install

- **WHEN** `bun install` runs in a clone whose `core.sshCommand` already names
  a different command, such as one carrying an identity file
- **THEN** that value stays as it is, the script prints the two options to
  add, and it exits 0

#### Scenario: A GIT_SSH user keeps their own ssh program

- **WHEN** `bun install` runs with `GIT_SSH` set in the environment
- **THEN** the script writes no `core.sshCommand`, prints the two options to
  add, and exits 0

#### Scenario: A second install writes nothing new

- **WHEN** `bun install` runs again in a clone the script already armed
- **THEN** `core.sshCommand` holds the same value as before, and the script
  says the clone already carries it

#### Scenario: An install with no git repository still succeeds

- **WHEN** `bun install` runs against a copied tree that holds no `.git`
  directory, as the production image build does
- **THEN** the install succeeds and the script writes no setting

#### Scenario: A push outlives the hook it runs

- **WHEN** a contributor pushes, and the hook runs the gates, the typecheck
  and the full suite for minutes
- **THEN** the connection to the remote carries keepalive traffic throughout.
  Git writes the pack to a live socket when the hook exits 0
