## Context

The push failure and its cause are in `proposal.md`. This document answers
four design questions, each with the evidence it rests on.

Sources used here: the `git-config` documentation, the `githooks`
documentation, and the OpenBSD `ssh_config(5)` manual page. A claim that
rests on reasoning rather than measurement says so.

## Decision 1: `core.sshCommand` is the lever

The `githooks` documentation states that `pre-push` reads
`<local-ref> <local-object-name> <remote-ref> <remote-object-name>` on
standard input. Only the remote knows the remote object name. So git has
already read the remote's ref advertisement when the hook starts. That fixes
the order. This is a transport failure, not a hook failure.

The `ssh_config(5)` page states what `ServerAliveInterval` does. After that
many seconds with no data from the server, ssh sends a request through the
encrypted channel. A reply resets the clock. That is the traffic the idle
connection lacks.

### Alternatives, and why each one loses

**`~/.ssh/config`.** This is where a `ServerAliveInterval` normally lives. It
is per-machine user state. The repository cannot write it, and a fresh clone
does not carry it. This repository's remote is `git@github-detent:...`, a
host alias that already lives in that file on this machine. The alias is the
proof: the file is a machine's, not the repository's.

**`GIT_SSH_COMMAND`.** This is the variable the one-off repair used. It lasts
one shell. A contributor must export it in every shell that pushes. That is
the manual step this change removes, in a new place.

**`http.keepAliveIdle`, `http.keepAliveInterval`, `http.keepAliveCount`.**
These are real. The `git-config` documentation defines all three as TCP
keepalive settings passed to curl, each with a `GIT_HTTP_KEEPALIVE_*`
override. They are the right answer if the HTTPS transport has this failure.
Two things say it does not have it here.

The first rests on measurement. The only remote is
`git@github-detent:Detent-Labs/detent.git`. Nobody pushes this repository
over HTTPS, so nobody can check a value against a real failure.

The second is reasoning, not measurement. Smart HTTP sends the ref
advertisement and the pack as two separate requests. A connection closed
between them costs a reconnect, not a write into a dead socket. A push over
HTTPS therefore has no long-held connection for the hook to starve. If
somebody measures the same exit code over HTTPS, those three settings are the
place to go.

**`receive.keepAlive`.** This is a server setting. It belongs to GitHub.

## Decision 2: an existing value is never overwritten

The script writes the setting only where writing it takes nothing away. Four
branches cover the cases, and each one exits 0.

| State the script finds | What it does |
|---|---|
| No `core.sshCommand` and no `GIT_SSH` | writes the value, prints it |
| `core.sshCommand` equal to the value | prints that the clone already has it |
| `core.sshCommand` set to anything else | keeps it, prints the two options to add |
| `GIT_SSH` set in the environment | keeps out, prints the two options to add |

Where `core.sshCommand` already equals the target value and `GIT_SSH` is also
set, the equal-value branch wins. The script prints the same-value message,
not the keep-out message. It writes nothing either way. Mentioning `GIT_SSH`
there would only confuse, since the value asked for is already in place.

A foreign `core.sshCommand` may carry an identity file, a `ProxyCommand`, or
a different ssh binary. Overwriting it breaks the contributor's access to
every remote. The keepalive is worth less than that.

The `GIT_SSH` branch exists for a second reason. The `ssh.variant`
documentation lists the command-line form per variant. Only the `ssh` variant
takes `-o option`. A `plink`, `putty` or `tortoiseplink` user given
`ssh -o ...` gets a different program.

Precedence is the other half of that branch. The documentation states that
`GIT_SSH_COMMAND` beats `core.sshCommand`. It does not state which of
`core.sshCommand` and `GIT_SSH` wins. The script rests on no unstated rule.
It keeps out.

`GIT_SSH_COMMAND` needs no branch. It wins over the setting either way, so a
contributor who exports it keeps what they exported.

## Decision 3: the two values, and one correction

The values in force are `ServerAliveInterval=20` and
`ServerAliveCountMax=30`. They are the values the one-off repair used. They
survive review, but not for the reason first given.

**The correction.** The finding described 20 x 30 as carrying "about ten
minutes". Ten minutes is not what the pair covers. Each reply to a probe
resets the interval clock. So at an interval of 20 seconds the connection
carries traffic for as long as the hook runs, whatever that is. The interval
covers a hook of one hour as well as a hook of four minutes.

**`ServerAliveInterval=20`.** This value answers the remote's idle tolerance,
not the hook's runtime. Nobody has measured GitHub's tolerance here. The
failing pushes give a lower bound only. All four died inside one hook's
runtime. 20 seconds sits far under any plausible tolerance. It costs three
probes a minute on an otherwise idle connection.

**`ServerAliveCountMax=30`.** The manual page states that ssh disconnects
once that many probes go unanswered. The default is 3. So interval times
count is the outage ssh tolerates before it hangs up: 600 seconds here.
This is the one value the hook's runtime bears on.

Set the product under the hook's wall clock, and a short network drop inside
the hook window kills the connection. That is the connection the keepalive
exists to hold. The default of 3 gives 60 seconds, which is under the runtime
of `bun run check` alone.

**What is still unmeasured.** The Open Questions section below carries the
detail. The hook's wall clock has no recorded number yet. Task 4.2 is where
one lands.

## Decision 4: `development-toolchain`, as a new requirement

The capability is `development-toolchain`. It already owns the requirement
"Every push runs the toolchain's checks against a real database". That
requirement owns `scripts/enable-hooks.sh` and the `prepare` step. This
change edits the same script.

It is not `push-gate-checks`. That capability defines the mechanical
detectors, and each one rejects a push. The keepalive rejects nothing.

The delta is an `ADDED` requirement, not a `MODIFIED` one. Two reasons.

The subject differs. The existing requirement says which checks a push runs
and where they run. The new one says the connection to the remote survives
them. Folding the second into the first gives one requirement with two
subjects.

The prose ratchet is the second reason, and it is mechanical. A `MODIFIED`
requirement reproduces the requirement in full. The live spec reports two
antislop findings today, and line 209 sits inside that requirement. A new
file starts at a base of zero and must reach zero. Reproducing the text would
import a finding the delta did not write.

## What this change does not add

No gate. A gate runs inside the hook, and the connection is already dying by
then. The failure it would catch is the push it runs in.

No retry. Git retries nothing after SIGPIPE, and this change does not teach
it to. A contributor who meets exit 141 after this lands has a different
cause, and `proposal.md` names the line to read.

## Migration Plan

None. The change writes local git config, not persisted application state. The
equal-value branch covers a clone that already carries `core.sshCommand` from
an earlier manual install; nothing migrates.

## Open Questions

Is 600 seconds enough headroom for the hook's real wall-clock runtime?
Unmeasured here; task 4.2 records the number on the first real push and
settles it.

Nobody has recorded the hook's wall clock as a number yet. The hook names its
own parts. Four host gates run, then `preflight.sh core`, then the lockfile
gate. Last comes a typecheck, a full suite of over 2000 tests, and a second
timezone-pinned run.

Task 4.2 checks 600 seconds against the recorded number. The spec states the
rule as a relation between the product and the runtime. So a slower suite
later does not make the spec wrong. It makes the value wrong, and the rule
says so.
