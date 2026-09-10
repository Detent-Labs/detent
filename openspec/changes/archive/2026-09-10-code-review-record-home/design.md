## Context

See `proposal.md` for the motivation. This section carries the measurements the
decisions below rest on. The three research reports that produced them sit under
`tmp/`, which `.gitignore` covers, so every number worth keeping is restated here.

### The four files, measured at `4b5d20f3`

| File | Lines | Date in header | antislop findings |
|---|---|---|---|
| `docs/CODE_REVIEW.md` | 621 | 2026-08-18 | 6 |
| `docs/CODE_REVIEW-2026-07-29.md` | 611 | 2026-07-29 | 588 |
| `docs/CODE_REVIEW-2026-08-01.md` | 739 | 2026-08-01 | 9 |
| `docs/CODE_REVIEW-2026-08-09.md` | 503 | 2026-08-09 | 7 |

Three of the four open with an `antislop: allow-file` line. It silences four
rules. One file has none, `-2026-07-29.md`. That absence is why its count reads
588 rather than 9.

The four form one chain: `-07-29` to `-08-01` to `-08-09` to `CODE_REVIEW.md`.
Each header links its predecessor with `**Supersedes:**`. Commit `9fe8fb38` set
the convention. The live review sits at the unnumbered path. A new pass renames
the outgoing one to its own date, "so its record and disposition table survive".

### What each file already has covered elsewhere

The 07-29 findings are fully covered. All 27 closed, carried by nine archived
changes under `openspec/changes/archive/2026-07-29-*`.

The 08-01 findings are covered except ARCH-1. Six changes archived under
`2026-08-06-*`. ARCH-2's decline reason survives at
`2026-08-06-harden-http-response-boundary/proposal.md:54-55`. ARCH-3 verified
closed: `validateTarget` sits at `src/runtime/api.ts:1445-1451`.

The 08-09 findings are covered. Its seven findings reappear at
`docs/CODE_REVIEW.md:79-89`, four carried and three closed, with fresh evidence
per row.

`docs/decisions.md` covers the ten action-list items of `CODE_REVIEW.md` under
`## Open from the 2026-08-18 code review`. The tree re-check of 2026-09-09
confirmed each of the ten. That copy is fresher than its source on every one.

### `docs/decisions.md` at `main` today, and after the ponytail change

At `main` today the file holds 1,305 lines and four `##` headings:
`## Open questions`, `## Decided and built`, `## Decided, not yet built` and
`## Open from the 2026-08-18 code review`. Line 1 is an
`antislop: allow-file` directive. It silences five rules: `synonym-rotation`,
`em-dash`, `passive-voice`, `sentence-length` and `run-ons`. With it the file
measures 27 findings and exits 0. Without it the file measures 184 findings and
exits 1. That number comes from a copy with line 1 removed. Of those, 85 are
`sentence-length`, 30 `passive-voice`, 21 `em-dash`, 17 `trailing-negation`, 13
`run-ons`, 8 `negation-habit` and 8 `synonym-rotation`.

The ponytail change lands first and leaves the file in a different state. Its
task 3.4 appends a fifth heading, `## Refused simplifications`, at the end of
the file. Its task 3.1 adds one bullet under `## Decided, not yet built`. Its
task 3.2 rewrites the SEC-5 bullet in place and drops the
`docs/CODE_REVIEW.md:281` citation from it. Its task 3.4 also verifies
`grep -c antislop docs/decisions.md` prints 0, which removes the line 1
directive. Every line number from `:970` down moves. This change therefore
anchors on heading text and on entry ids, never on a line number of that file.

One caveat about the sibling. Its task 3.5 verifies the same file still exits 0
after 3.4. The copy measured above says the two verifies cannot both hold. Task
1.0 of this change measures the file as the sibling left it, whichever way that
went. The rule this change follows holds in both states. No new entry adds a
finding.

### The prose gate and a rename

`scripts/gates/prose.sh:23-24` states the rule in its own words: "A rename keeps
its baseline: the base count is read at the old path." The gate passes `-M` to
`git diff` for exactly this purpose, and the comment at `:64-68` records the
measurement behind it. Renaming `timers/spec.md` without `-M` reported 0
findings at the base and 220 at the tip.

That consequence is what makes this change affordable. Moving
`-2026-07-29.md` with `git mv` costs zero prose findings, despite the 588 it
carries. Without that property no archived change could ever ship.

## Goals / Non-Goals

**Goals:**

- Carry the one live, unowned finding out before anything moves.
- Carry the nine findings that never reached `docs/decisions.md`.
- Put the frozen half of the record in the repository's one frozen home.
- Write the rule that answers the same question for the next audit.

**Non-Goals:**

- Fixing any finding. Each fix needs its own OpenSpec change.
- Deciding the `NotFoundError` mapping. The entry states the question.
- Rewriting archived prose. Not one archived byte changes.
- Repairing archived citations. See the citation decision below.
- Folding the review text itself into `docs/decisions.md`. Measured at 3,758
  lines and a rise of 54 antislop findings, and it destroys the dates.

## Decisions

### One archived directory holds all four files

The four files move into `openspec/changes/archive/2026-08-18-code-review-record/`.

Four directories would split one chain into four entries. Those four entries
never were four changes. The disposition table in `-07-29` maps findings across
the whole chain. Each header links the file before it. A split breaks both. One
`ls` shows the chain, and the four filenames keep their own dates.

The directory name takes the date of the newest review in the chain. This
change's own landing date stays out of it. That deviates from the archive's
usual `<change-date>-<change-name>` shape, on purpose. The entry is a record
rather than a change that ran. Naming it `2026-09-10-*` would put it beside this
change's own archived directory under two near-identical names.

The archive already holds spec-less entries. Of 304 archived changes, 26 have no
`specs/` directory, `2026-09-10-code-review-carryover` among them. No archived
entry today holds a nested non-specs directory. That is the second reason the
files go straight to `archive/`, rather than riding inside this change's own
directory through `openspec archive`.

The entry gains one `README.md`. It names the chain, the rename convention, the
commit that set it, and where the live findings now sit. That file is the only
new prose in the entry.

### The `NotFoundError` question lands under `## Open questions`

The entry has no id of its own, because the file already holds an ARCH-1. That
one is the 2026-08-18 finding on the size of `src/runtime/api.ts`, in the
code-review section. A second ARCH-1 in the same file would put two findings
under one id. The entry names its source as ARCH-1 of the 2026-08-01 review
instead.

`src/http/errors.ts:95` reads
`{ ctor: NotFoundError, status: 500, type: "internal" }`. The header comment at
`:10-16` calls the not-found conditions "the one exception carved out of that
fallback", kept "message-bearing at 500 (not 404; see design.md's 'Keep
not-found at 500' and the recorded open question)".

That recorded open question does not exist.
`openspec/changes/archive/2026-07-29-correct-api-error-responses/design.md:65-69`
says: "Changing it to 404 is defensible and is what most APIs do." It goes on:
"it is a contract change for every consumer... Recorded as an open question."
`grep -n "NotFoundError" docs/decisions.md` returns nothing today.

So the entry goes under `## Open questions`. The code-review section is the
wrong home. The archived design already classified it. That section's heading
reads "each needs its own OpenSpec change", which presumes a decided direction.
This one has none.

The mapping is pinned in three places in the live spec:
`openspec/specs/http-wrapper/spec.md:215` holds the status-table row, `:242` the
scenario "A typed 'not found' error maps to 500, not 404", and `:1665` the
attachment requirement. Changing it to 404 is therefore a contract change for
every consumer, plus a spec change at three sites. The entry says that and
stops. It decides nothing.

One drift is worth recording. The review cites `src/http/errors.ts:82`. The
mapping sits at `:95` today. The entry uses the live anchor.

### Nine findings carried, each re-verified

Every one was re-checked against the tree for this change. All nine stay open.
Six carry a drifted anchor, and the entries use the live one.

| Id | Severity | Review anchor | Live anchor | Verdict |
|---|---|---|---|---|
| SEC-7 | Low | `cel/eval.ts:129,166`, `compile.ts:149` | `eval.ts:129,166` holds; `MAX_EXPRESSION_LENGTH` at `compile.ts:156` | open |
| SEC-8 | Low | `routes.ts:104`, `:365`, `server.ts:174` | `MIME_TOKEN_PAIR` at `routes.ts:108`, schema `:111`, download `:394`, `toBinaryResponse` at `server.ts:196` | open |
| SEC-9 | Low | `auth/jwt.ts:117-124` | `:115-124`; no `rolesVersion` in `src/` or `openspec/specs/` | open |
| SEC-10 | Informational | `.devcontainer/docker-compose.yml` | `ALLOW_INSECURE_DEV_AUTH` at `:47`, `POSTGRES_PASSWORD` at `:92` | open |
| ARCH-2 | Low | `BINARY_ROUTES`, per-handler role checks | `BINARY_ROUTES` at `http/server.ts:268`, still hand-kept | open, narrowed |
| CQ-2 | Low | `auth/authorize.ts` header | route-to-role facts at `:28-44` | open |
| DEP-2 | Informational | no `bun audit` step | `grep -rn "bun audit" .github/` returns nothing | open |
| PERF-1 | Low | `engine/host.ts:310` | `pollForever` on a 500 ms loop at `:326` | open |
| PERF-2 | Low | `auth/authorize.ts:103` | `can()` at `:118` | open |

Two need a word beyond "open".

ARCH-2 narrowed. `test/http-disposition.test.ts` exists and drives every
declared `BINARY_ROUTES` entry. TEST-1 covers the per-handler ledger and already
sits under the code-review heading of `docs/decisions.md`. What remains is one
case: a binary route added and never declared. The entry says exactly that.

SEC-9 is the only one of the nine with a real recommendation. A role reduction
does not reach an already-issued token. An operator revoking one privilege waits
up to eight hours. The code at `src/auth/jwt.ts:115-124` reads roles from the
token's own claim by design, and the comment there points at the
`admin-user-management` spec.

The zero-code answer is to document the disable-then-re-enable method. No
operator document holds it today. The other answer is a `rolesVersion` claim, a
schema change that needs its own OpenSpec change.

The nine add roughly 40 lines to a file already at 1,305. That growth is the
price of keeping them. Seven Low and two Informational findings invite a
reviewer to argue each one. So every entry states its risk in one sentence.
Each recommends nothing beyond what the review recommended.

### Archived citations stay as they are

Eighteen archived files name a `CODE_REVIEW` path. The count comes from
`git grep -l CODE_REVIEW -- openspec/changes/archive | wc -l`, run on
2026-09-10. Every one of the eighteen names a path this change empties. Five
cite one of the three dated files. Two cite the glob `docs/CODE_REVIEW-*.md`.
Eleven cite `docs/CODE_REVIEW.md` itself.

The five dated citations:

- `2026-08-17-ponytail-cut-unreachable-code/tasks.md:15` confirms nothing else
  references a deleted script "besides `docs/CODE_REVIEW-2026-07-29.md` (a dated
  review, left as historical record)".
- `2026-08-23-allow-schema-refinement-tightening/tasks.md:133` lists the same
  file in a grep hit list.
- `2026-08-17-ponytail-drop-opsx-command-mirrors/design.md:41` lists
  `docs/CODE_REVIEW-2026-08-01.md:80` under Non-Goals.
- `2026-08-23-reject-unsatisfiable-required-readonly/proposal.md:81` and
  `tasks.md:73` list that file in a scope-exclusion sweep.

All five say one thing in different words. A grep sweep hit this file. It is a
dated review, so leave it alone. Not one reads a finding, a number or a
recommendation. Each records a decision taken on its date. That record stays
true whether or not the file still sits at that path.

The two glob citations sit at `2026-09-09-track-latest-postgres/proposal.md:74`
and `tasks.md:35`. Both take the same shape.

The eleven `docs/CODE_REVIEW.md` citations split seven against four. Seven
archived proposals already point at the wrong document. Six say "The 2026-08-01
code review (`docs/CODE_REVIEW.md`)":
`2026-08-06-deliver-framing-and-sniffing-headers/proposal.md:26`,
`document-deployment-and-self-enable-the-hook/proposal.md:3`,
`harden-http-response-boundary/proposal.md:3`,
`harden-local-account-sessions/proposal.md:3`,
`restrict-http-action-egress/proposal.md:25` and
`surface-worker-failures/proposal.md:30`. A seventh,
`2026-08-09-add-ci-workflow/proposal.md:3`, says "`docs/CODE_REVIEW.md`
(2026-08-09)". The rename convention broke all seven weeks ago. Following any of
them now lands on the 2026-08-18 review, the wrong file.

The four newest cite the right document at the path it holds today.
`2026-09-10-code-review-carryover` is the heaviest citer of the eighteen. Its
`design.md`, `proposal.md` and `tasks.md` name `docs/CODE_REVIEW.md` at more
than a dozen sites. Its `tasks.md:36-40` holds four `grep` Verify commands
against that path. `2026-09-10-contract-doc-sync/design.md:197` names it once.
Those Verify commands stop resolving after the move. An archived Verify command
records what its change checked on its date. Every archived Verify command that
names a since-moved line number already reads that way.

Nobody noticed and nothing failed. A stale pointer inside the archive is not a
hypothetical cost here. It is the status quo, at seven sites against eleven.
So this change repairs none of the eighteen, and rewrites no archived byte.

### `CLAUDE.md:333-334` points at two homes

<!-- antislop: allow em-dash -->
The bullet today reads: "`docs/CODE_REVIEW.md` — the current review and its open
action list. The three dated files beside it are superseded, and still cited."

Both sentences stop being true after the move. The replacement names the two
homes the new requirement defines. `docs/decisions.md` holds the open findings.
The archived entry holds the record with its dates, its commits and its method.
Two lines out, two lines in.

### The requirement joins `development-toolchain`

That capability already holds "A browser check lands as an assertion or as a
checklist entry" at `openspec/specs/development-toolchain/spec.md:830`. That
requirement governs where a check's record goes. It says nothing about code
behavior. The new requirement has the same shape and the same job.

The file holds 1,033 lines and 21 requirements, and opens with an
`antislop: allow-file` line silencing `passive-voice`. The delta adds one
requirement with four scenarios, which matches the sibling's four.

The alternative was a new capability. One requirement does not earn one. A
reader looking for "where does an audit land" reaches for the toolchain spec
first. The browser-check rule sits beside it.

## Risks / Trade-offs

**A reader who knows only `docs/CODE_REVIEW.md` finds nothing there.** The
`CLAUDE.md` retarget is the mitigation. It is the same mechanism that already
sends readers to `docs/decisions.md` for the ten open items.

**The archived entry carries the review's date.** A reader scanning `archive/`
by change date sees it out of order. The `README.md` inside it and the
`CLAUDE.md` pointer both mitigate that. The four filenames carry the dates
anyway.

**Eighteen archived citations go stale.** Seven of them already point at the
wrong review today. They have
cost nothing for weeks, so this is a rounding error. Repairing them would
rewrite archived prose, which this change refuses on principle.

**`docs/decisions.md` grows by about 40 lines of Low and Informational
findings.** The alternative is losing them. Each entry states one risk in one
sentence and proposes nothing new.

**The prose gate is the only real cost.** Three files gain prose:
`docs/decisions.md`, `openspec/specs/development-toolchain/spec.md` and the new
`README.md` in the archived entry. The four moves cost zero, measured. The
toolchain spec silences `passive-voice` alone, and the delta costs it zero. A
copy with the delta appended measures 16 findings, the same as the file at
base. The `README.md` has a base of 0, so one error-class finding in it blocks
the push.

The ponytail change's task 3.4 leaves `docs/decisions.md` with no directive at
line 1. Its nine new bullets and its one new question therefore
meet no silenced rule. Task 1.0 measures the file's count
as the ponytail change left it. Tasks 1.2, 1.4 and 3.2 each leave that count
unchanged.

**An `openspec` command may not expect a hand-built archive entry.** The task
list checks that. It runs `openspec list` and `openspec validate --all --strict`
right after the move, before anything else lands.

## Migration Plan

Nothing deploys and nothing rolls back at runtime. A `git revert` undoes the
whole change at no cost.

Order matters in one place. Every finding lands in `docs/decisions.md` before
any file moves. That way a `git revert` of the move alone still leaves the
findings recorded.

This change is the second of three that append to `docs/decisions.md`. The
ponytail change lands first and leaves the file with five `##` headings. The
fifth, `## Refused simplifications`, sits at the end of the file and runs to
EOF. This change writes into the first and the fourth sections. Its one
question lands at the tail of `## Open questions`, before `## Decided and
built`. Its nine entries land at the tail of
`## Open from the 2026-08-18 code review`, before `## Refused simplifications`.
Nothing lands after the fifth heading. Task 1.0 checks the heading count before
any write.

This change anchors on heading text because the ponytail change moves every
line number from `:970` down. It also assumes the ponytail change removed the
`allow-file` directive at line 1, per that change's task 3.4. If the directive
survived, the entries still cost zero, since task 1.0 measures the count in
either state. The field-model change lands third and writes above the fifth
heading under the same rule.

## Open Questions

- Does the archived entry ever gain a `proposal.md` stub, so that `openspec`
  tooling sees a conventional shape? Task 2.3 checks that the tooling
  tolerates the entry as it stands. Nothing here decides the stub.
- Does the next audit create its own archived entry, or add its file to
  `2026-08-18-code-review-record`? The rename convention set at `9fe8fb38`
  suggests the chain continues. The requirement names neither, on purpose.
