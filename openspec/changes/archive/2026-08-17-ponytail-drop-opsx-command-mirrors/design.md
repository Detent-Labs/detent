## Context

See proposal.md for motivation. What follows is the measured state.

Eleven files sit under `.claude/commands/opsx/`: `apply`, `archive`,
`bulk-archive`, `continue`, `explore`, `ff`, `new`, `onboard`, `propose`,
`sync`, `verify`. Twelve skills sit under `.claude/skills/openspec-*/`. The
extra skill is `openspec-review-change`, which has no command mirror.
CLAUDE.md:98 already names that one as a skill.

A line-by-line diff of each pair gives the real overlap. Two pairs differ by
frontmatter alone. Seven differ by frontmatter plus each command's own
`/opsx:` name in its own text. One pair, `explore`, has the skill as the
larger file by 129 lines. One pair, `archive`, has 57 command-only lines.
About 50 of those are three output templates.

The `/opsx:` references do not stop at the commands. Six skills name them in
their own text. The file `openspec-onboard` names them 22 times. It teaches
them as the entry point to the workflow. CLAUDE.md names them five times.

`openspec update --help` lists two options, `--force` and `-h`. It offers no
way to keep a generated file deleted. `openspec/config.yaml` takes three
keys here: `schema`, `context` and `rules`.

## Goals / Non-Goals

**Goals:**

- One set of workflow instructions, the skills.
- No instruction text lost. The three archive templates move before the
  file holding them goes. Four example lines in `explore.md` go with it,
  named in the second decision.
- No dangling `/opsx:` reference anywhere the agent reads.
- A written record of why the directory is absent.

**Non-Goals:**

- The skills themselves. Their content stays as it is, apart from the three
  templates arriving and the cross-references retitling.
- `.claude/settings.local.json`. Git ignores it.
- `docs/CODE_REVIEW-2026-08-01.md:80`. It records what somebody wrote on
  that date, so its `opsx:archive` mention stays.
- Any change to how OpenSpec itself runs. Nothing here touches the CLI.

## Decisions

### The skills stay, the commands go

The skills auto-trigger when a task matches their description. A command
answers a typed name and nothing else. That alone decides it. The workflow
depends on the auto-trigger. CLAUDE.md leans on it for the review step.

The reverse split would also delete `openspec-review-change`, which has no
command form. The other option leaves it as the one skill beside eleven
commands. That is worse than what stands today.

### The three archive templates move first

They are the only instruction in the eleven commands that the skills lack.
Two cover an outcome the skill's single template does not. One is a change
with no delta specs. The other is a change archived with warnings. The
third covers the target-exists error. Each one tells the agent what to
print in a case it will meet.

Four further command lines have no counterpart, all in `explore.md`, and
all four are examples of what a user might type. The skill covers the same
input cases at `openspec-explore/SKILL.md:104`. Those four go with the
file.

Dropping them instead would trade 2001 lines of duplication for 50 lines of
lost instruction. That is not the trade this finding asks for.

### The record goes in CLAUDE.md, not `openspec/config.yaml`

No opt-out flag exists on `openspec update`, and `config.yaml` reads three
keys. A fourth key would sit there and do nothing. That is worse than no
line at all. The next reader would take it for a working switch.

CLAUDE.md is where this repo already records rules an agent must follow by
reading. One line under the change-workflow section states that the mirrors
stay deleted, and that `openspec update` puts them back.

### Retitle, do not delete, the cross-references

A skill that says "run `/opsx:apply`" would name nothing after this change.
Each reference names the skill instead. The file `openspec-onboard` needs
the most work. It teaches the entry point rather than mentioning it in
passing.

## Risks / Trade-offs

- Somebody types `/opsx:propose` out of habit and gets nothing → the skills
  answer their own names. They also auto-trigger on the task with no typed
  name at all. CLAUDE.md:72 carries the new names.
- A later `openspec update` puts all eleven files back → the CLAUDE.md line
  says so, and names the fix. No mechanism can prevent it.
- The same `openspec update` overwrites the archive skill and drops the
  three moved templates → see Open Questions. The exposure is the same one
  the commands carry today, so the move loses nothing either way.
- The file `openspec-onboard` reads wrong after a partial retitle → its 22
  references are one task of their own. The verification step greps for
  `opsx` across `.claude/` and `CLAUDE.md`.

## Migration Plan

None in the product. This is agent tooling and project instructions.
Deployment is the commit. Rollback is `git revert`, which restores all
eleven files.

## Open Questions

- Does `openspec update` rewrite `.claude/skills/openspec-*/SKILL.md` as
  well as the commands? If it does, the three moved templates need a
  re-check each time somebody runs it. The deleted directory needs the same
  re-check. No task here depends on the answer. The templates belong in the
  skill either way. The CLAUDE.md line already sends the reader to look
  after a run.
