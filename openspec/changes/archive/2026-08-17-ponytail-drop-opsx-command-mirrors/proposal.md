## Why

`PONYTAIL-AUDIT.md`'s finding 1 is the largest cut in the 2026-08-16 scan.
Eleven files under `.claude/commands/opsx/` restate eleven skills under
`.claude/skills/openspec-*/`. Both sets come from `openspec init`. Together
the commands hold 2001 lines.

The skills are the set to keep. They auto-trigger on a matching task, and
`openspec-review-change` has no command mirror at all. CLAUDE.md already
sends that one review step to the skill by name.

A fresh diff re-measures the finding. The audit says the bodies match, with
zero difference on `onboard` and `bulk-archive` and at most eleven lines on
the rest. Only the first half holds.

## What Changes

- Move three output templates from `.claude/commands/opsx/archive.md` into
  `.claude/skills/openspec-archive-change/SKILL.md`. The skill carries one
  template, "Output On Success". The command carries three more: the
  no-delta-specs case, the with-warnings case, and the target-exists error.
  Nothing else in the eleven commands is an instruction the skills lack.
- Drop the four example bullets in `.claude/commands/opsx/explore.md`. They
  illustrate what a user might type, and no skill repeats them word for
  word. `openspec-explore/SKILL.md:104` covers the same input cases.
- Delete all eleven files under `.claude/commands/opsx/`.
- Retitle every `/opsx:` cross-reference inside the skills to the skill it
  now names. The skill `openspec-onboard` holds 22 of them. It teaches the
  commands as the entry point. The other five hold one to three each:
  `openspec-apply-change`, `openspec-explore`, `openspec-ff-change`,
  `openspec-propose` and `openspec-review-change`.
- Retitle the five `opsx:` mentions in `CLAUDE.md`. Four sit in the change
  workflow section, one in the "no phase is optional" paragraph.
- Add one line to `CLAUDE.md` recording that the mirrors stay deleted.
  The command `openspec update` regenerates them and carries no opt-out
  flag. The next person to run it needs to delete them again.

The re-measurement, in full:

- `onboard` and `bulk-archive` differ from their skills by frontmatter
  alone. That half of the audit's claim holds.
- `archive` carries 57 lines the skill lacks. Roughly 50 of them are the
  three output templates above. This change moves them.
- `explore` is the reverse case. Its skill carries 129 lines the command
  lacks. Four command lines have no counterpart, and all four are examples.
- The other seven differ by frontmatter plus their own `/opsx:` name. That
  is the retitling above, not lost content.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change touches agent tooling under `.claude/` and the project
instructions in `CLAUDE.md`. No specification under `openspec/specs/` names
a command or a skill file, and no shipped behavior changes. Marked
`skip_specs: true`.

## Impact

- `.claude/commands/opsx/`: the whole directory goes, 2001 lines.
- `.claude/skills/openspec-archive-change/SKILL.md`: three output templates
  arrive.
- `.claude/skills/openspec-onboard/SKILL.md`: 22 references retitled.
- Five further `SKILL.md` files: one to three references each.
- `CLAUDE.md`: five mentions retitled, one line added.
- `PONYTAIL-AUDIT.md`: finding 1 recorded as resolved and re-measured.
- `.claude/settings.local.json` holds eleven `opsx:` entries. Git ignores
  that file, so it is local cleanup and not part of this change.
- The user-visible cost: `/opsx:propose` and its ten siblings stop
  existing. `/openspec-propose` and its siblings answer instead.
