# Tasks

## 1. Deployment runbook

- [x] 1.1 Add a section "Running more than one engine process" to `docs/runbooks/deployment.md`, before "The proxy rule". State that a tenant may run more than one process against one database. Name the login rate-limit windows as the one piece of process-local state. Say that each added process raises the effective threshold, and that a restart clears the windows. State the startup rule and its reason. Verify: the section answers each clause of the delta spec's requirement.
- [x] 1.2 In the runbook's "Serving many tenants" section, find "the same process" and "from one process". Reword both to name the deployment. Verify: `grep -n "one process\|same process" docs/runbooks/deployment.md` prints no line from that section.

## 2. Decision record

<!-- antislop: allow trailing-negation -->
<!-- "Decided, not yet built" quotes an existing section heading verbatim. -->
- [x] 2.1 In `docs/decisions.md`, find SEC-2, SEC-3, SEC-5, SEC-6 and SEC-9 under "Open from the 2026-08-18 code review". Move them to "Decided, not yet built" as its newest entries. Each entry keeps its anchors, adds the 2026-09-23 verdict, and names its follow-up change and chosen shape from design.md. Verify: `grep -n "SEC-" docs/decisions.md` shows each of the five once, under "Decided, not yet built" and nowhere else.
<!-- antislop: allow trailing-negation -->
<!-- "Decided, not yet built" quotes an existing section heading verbatim. -->
- [x] 2.2 Add the section "Accepted risks (decided, nothing to build)" after "Decided, not yet built" in the file. Move SEC-4, SEC-8 and SEC-10 there, each with its anchors and the reason from design.md. Verify: the same grep shows each of the three once, under "Accepted risks".
- [x] 2.3 Add an entry under "Decided, not yet built" for the startup race. `initSchema` takes no lock. An advisory lock around it retires the runbook's startup rule. Verify: the entry cites `src/engine/store.ts:76` and `src/http/server.ts:893`.
- [x] 2.4 Correct the two intro counts of the 2026-08-18 section to the entries that remain. Verify: count the bullets under each intro against its number.
- [x] 2.5 Check that every file anchor the moved entries cite still points at the named symbol. Verify: open each cited line.

## 3. Follow-up briefs

- [x] 3.1 Write one brief per follow-up change under `tmp/briefs/`: `password-floor-and-self-rotation.md`, `postgres-login-rate-limit.md`, `instance-attachment-byte-ceiling.md` and `live-roles-for-local-tokens.md`. Each names its findings, the chosen shape, and the starting files. Verify: the four files exist.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` in the devcontainer. Record its output.
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set in the devcontainer. Pipe the log through `scripts/gates/silent-green.sh`.
- [x] 4.3 Commit, then run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Verify: no file's finding count rises.
- [x] 4.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Verify: it reports nothing.
