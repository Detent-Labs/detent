## Context

See proposal.md, section Why, for what the two ports were.

One detail shapes the work. Both bring-up scripts write the override file only
when it does not exist. See `scripts/dev-up.ps1:22` and
`scripts/dev-up.sh:24`. `.gitignore` covers that file, so every developer
carries their own copy. A copy on a machine that ran `dev-up` before this
change keeps the two dead lines.

## Goals / Non-Goals

**Goals:**

- A fresh clone publishes one frontend port, the one a package can serve.
- The two documents describe what the compose file holds.

**Non-Goals:**

- Rewriting an existing `.devcontainer/docker-compose.override.yml`. See the
  first risk below.
- Touching 5173. `packages/web` serves there. A browser on the host reaches a
  container dev server only through a published port.
- Touching `CORS_ALLOWED_ORIGINS` itself. Its value is already
  `http://localhost:5173`. Only the comment above it is wrong.
- Adding a preflight check for a frontend dev port. `dev-up` starts no dev
  server. Such a check would fail on a correct stack.
- Settling who owns the override file. The `development-toolchain` spec
  describes a contributor who adds a binding themselves. Its SMTP-catcher
  requirement states that. Here the script writes the file for them, mailpit
  port included. That predates this change. This change keeps the generation
  as it is, and this entry records the tension.

## Decisions

**Delete the two lines rather than comment them out.** Git carries the
history. The archived `pin-frontend-dev-ports` and
`consolidate-frontend-shell` changes carry the reasoning. A commented-out port
in a generated file reads as a port somebody is about to need.

**Leave an existing override file alone.** Alternatives considered:

- *Rewrite the file on every run.* This overwrites what a developer wrote
  into a gitignored file. That file is the documented place to publish an
  extra port for a one-off experiment.
- *Detect the two lines and strip them.* The script would rewrite a file it
  does not own, in place. That needs a parser for a format the script only
  ever writes. The two stale lines cost one bound port each.

**Correct the comment in the tracked compose file.** Keep the value. The
comment names three dev servers because three packages once existed. The
value it documents is right. A reader who trusts the comment goes looking for
`packages/admin`.

## Risks / Trade-offs

**A machine that ran `dev-up` before this change keeps publishing 5174 and
5175.** → Accepted, and named in the Non-Goals above. The cost is two bound
ports on a loopback address. A developer who wants the change deletes
`.devcontainer/docker-compose.override.yml` and re-runs `dev-up`. Task 3.1
states that.

**A future second browser package needs a second port.** → It gets one. The
`development-toolchain` spec already says how: the package pins its own port
with `strictPort: true`, and its entry joins the table. Removing an unowned
port line does not make adding an owned one harder.

## Migration Plan

No migration. The scripts hold no state. A fresh clone takes the new override
on its first `dev-up`.

Rollback is a revert of the commit. An override file from either version stays
valid: the scripts generate that file, and `.gitignore` covers it.

## Open Questions

None.
