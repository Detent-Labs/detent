## Context

See `proposal.md` for motivation. Five facts fix the shape of this change.

The source of record is `tmp/doc-audit/10-carryover.md`. That report re-checked
all ten action-list items of `docs/CODE_REVIEW.md` against the tree on
2026-09-09, at `55f36abb`. For each one it names the file and the line that
proves it open. It also rejects four claims of the audit that started this
effort. Where the report and the audit disagree, the report wins.

This session re-checked every number and every symbol name the report
publishes. Five of them needed a correction, recorded under Decisions.

Two changes touch `docs/decisions.md`. The audit's Change A restructures it. A
new `## Decided and built` section takes seven finished entries, and the lede
grows to name four sections. That work lands first.

The `"Unsaved changes"` entry then ends `## Decided, not yet built`. Its last
line reads `  result.`, with two leading spaces, and that string occurs once
in the whole file. This change appends there.

The two files carry different prose baselines. `docs/decisions.md` opens with
an `allow-file` directive for five rules. It silences `synonym-rotation`,
`em-dash`, `passive-voice`, `sentence-length` and `run-ons`.
`docs/CODE_REVIEW.md` silences four of those five. Neither one silences
`filler` or `phrasal-verbs`, and both of those are error-class.

`docs/CODE_REVIEW.md` disagrees with itself about three ids. Seven sites use
the detailed findings' numbering: `:87`, `:229`, `:258`, `:286`, `:585`,
`:591`, and the action list at `:610-615`. Three sites use another one: `:61`,
`:64` and `:88`.

`docs/superpowers/specs/` holds one file today. Wave 0 of this effort moved the
other two design drafts out. `.gitignore` excludes the directory, so a fresh
clone carries nothing of the display-name design.

## Goals / Non-Goals

**Goals:**
- Record all ten open action-list items in `docs/decisions.md`, one entry
  each. Each entry carries the evidence that proves the item open.
- Record the wrong source comment at `src/schema/compile.ts:1218` as an
  eleventh entry. The audit's Change B routed it here.
- Make `docs/CODE_REVIEW.md` agree with itself about SEC-4, SEC-5 and SEC-6.
- Preserve the display-name design inside the repository. The rescue must not
  read as approval to build it.
- Correct one stale line citation that no other change in this effort covers.

**Non-Goals:**
- No fix for any of the ten findings. Each one needs its own OpenSpec change.
  This change schedules none of them.
- No exploitation path in any entry. Each risk sentence names the consequence
  and stops there.
- No new severity and no new priority order. The review owns both. The entries
  repeat its judgment as the review's own.
- No new sentence in `docs/runbooks/deployment.md`. See the SEC-5 resolution
  below.
- No deletion of the gitignored source design. Git does not track it, so a
  deletion leaves a reviewer nothing to read. Whoever clears
  `docs/superpowers/specs/` may delete it once this change lands.
- No new lede. Change A already widens the lede to name this change's section.

## Decisions

**Fixing an id typo inside a dated review is safe, and this change does it.**
Four properties make it safe. First, the review's date, scope, severities,
evidence and recommendations stay untouched, so no conclusion moves. Second,
the three wrong sites are the minority. Seven sites in the same file already
use the corrected ids, and the change makes the document agree with itself.

Third, an id is an addressing scheme rather than evidence. Fourth, git history
keeps the original bytes.

Leaving the error costs a reader real time. The action list orders the work by
id. A reader who plans from the top-findings list starts SEC-4, a decision,
when they meant SEC-5, a day of work.

**A `docs/decisions.md` entry is the carrier for the display-name design.**
The alternative is a full OpenSpec change proposal. That costs four artifacts,
a review to zero findings, an apply pass and four verification gates. Somebody
needs that change anyway on the day the screen gets built. Proposing it today
buys an earlier start and nothing else. The design has no approval, so an
earlier start is exactly what it must not get. One entry under
`## Decided, not yet built (each needs its own OpenSpec change)` states the
design's status in the heading itself. The entry's last sentence says that
building waits for the owner.

**The eleventh entry sits last in the section, under a label that names its
source.** Its bullet opens `**Not from that review: ...**`. No reader takes it
for an action-list item. Change A's lede calls the section "the open findings
of the 2026-08-18 code review". That description stays true for the ten, and
the label carries the difference for the eleventh.

**Five facts in report 10 needed a correction.** This session re-checked all
five against the tree at `b94f7d04`.

- CQ-1's count. The report says 68 directives across nine files. That omits
  the root `test/` tree, which holds 13 more across six files. The repository
  holds 81 across fifteen files. Sixty-six name
  `@typescript-eslint/no-explicit-any`. Thirteen name
  `react-hooks/exhaustive-deps`. Two name one rule each. The report also
  compares its 68 against the review's ten. Those two numbers count different
  things. `docs/CODE_REVIEW.md:467` counts ten in `src/schema/compile.ts`
  alone, and that same file holds 53 today. The entry publishes both numbers
  with their scopes.
- SEC-5's second record. `git ls-files PONYTAIL-DEBT.md` returns nothing, so
  git does not track the ledger. A fresh clone starts without it.
  `scripts/gates/ponytail-ledger.sh:22` reads `[ -f PONYTAIL-DEBT.md ] ||
  exit 0`. An absent ledger therefore disables the gate in silence rather than
  failing it. The phrase "behind a push gate" alone overstates what a reader
  gets. The entry says that `.gitignore` excludes the ledger.
- C1's citation for the resolved display name. The report cites
  `src/auth/users.ts:144`, the `UserSummary` interface line. The field and its
  "never null and never empty" contract sit at `:151-152`. The entry cites the
  field.
- SEC-4's third symbol name. The report wrote `saveSession` for the function
  that stores the session. No such name exists. The declaration at
  `packages/web/src/shell/session.ts:64` reads `persistSession`, and
  `git grep saveSession -- packages/web` returns nothing. Four call sites in
  `packages/web/src/shell/App.tsx` call `persistSession`, at `:94`, `:121`,
  `:141` and `:176`. The two other names
  and all three line numbers hold, so the entry changes one word.
- ARCH-1's ranking. The report put `src/schema/definition.ts` (1,428) and
  `src/engine/transition.ts` (1,118) next after `src/runtime/api.ts`. Five
  source files sit in that gap, and the report named one of them. The other
  four are `packages/web/src/areas/studio/canvas/CanvasView.tsx` (1,791),
  `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx` (1,356),
  `src/engine/store.ts` (1,334) and `src/schema/compile.ts` (1,289). The
  report also called `api.ts` the largest file in the repository. Two test
  files run longer: `test/runtime-api.test.ts` at 3,128 lines and
  `test/http.test.ts` at 2,562. The word at `docs/CODE_REVIEW.md:435` is the
  accurate one, largest source file. The review finding that caught this
  proposed a ranking over `src/` alone, which misses both `packages/web`
  files.

**Report 10's four open questions, resolved.**

- May a dated review get an id fix? Yes, for an id alone. See the first
  decision above.
- Does the display-name design carry the owner's go-ahead? No. Its source
  document ends "Implementation starts only after the human partner approves
  it". The entry preserves the design and repeats that condition.
- One OpenSpec change per security item, or one covering SEC-2 and SEC-3
  together? Out of scope here. This change records findings and schedules no
  work. The SEC-3 entry repeats the review's own recommendation for the pair,
  marked as the review's.
- Should SEC-5's entry name the single-process assumption in the deployment
  runbook? The question names `docs/deployment*.md`, and no such path exists.
  The file is `docs/runbooks/deployment.md`. A `git grep -l "single-process"`
  shows that file silent on the assumption. The `deployment-runbook`
  capability governs it, so a sentence there needs a delta spec and its own
  change. The SEC-5 entry records the gap instead, with the review's own
  citation.

**The id fix leaves the top list without a SEC-4 row.** That is correct. The
list then runs SEC-1, SEC-2, SEC-3, SEC-5, SEC-6, TEST-1 and ARCH-1. SEC-4 is
the session-token decision. It appears in the detailed
findings, in the status table and in the action list. The review's author left
it out of the top seven.

A new row would rewrite an editorial choice. A later reader who spots the gap
should read this paragraph first.

**`skip_specs: true`.** See `proposal.md` under Capabilities.

**Prose gate, measured rather than argued.** `scripts/gates/prose.sh` reads
the linter's exit code. rc 0 makes the count 0, whatever the linter printed.
Measured on 2026-09-09 on a scratch copy: `docs/decisions.md` prints 25
findings and exits 0 at the base. With this change's whole block appended it
prints the same 25 and exits 0. The gate compares 0 against 0. The added block
contributes no finding of its own.

## Corrections, per document

### `docs/decisions.md`

Report 10 carries the byte-exact anchor and the replacement for every row
below. The facts are here so the archived change stays readable once `tmp/` is
gone.

| Site | Today | After this change | Evidence |
|---|---|---|---|
| Tail of `## Decided, not yet built` | No entry | The display-name design. Its three files, its one catalog key, its out-of-scope list, its browser check. Building waits for the owner. | `src/auth/users.ts:151-152`. `openspec/specs/admin-user-management/spec.md:18`. `packages/web/src/areas/admin/api/types.ts:110`. `UsersScreen.tsx:394-398` and `:606`. `packages/web/src/i18n/catalogs/admin.ts:119` and `:384`. |
| Aggregated data source entry | `queryInstances` cited at `src/runtime/api.ts:1560` | Cited at `:1868` | `src/runtime/api.ts:1868` declares it. Line 1560 sits in a `dataWhere` comment. |
| New `##` section | Three sections after Change A | A fourth. It holds the eleven entries, after the whole unbuilt section. | `docs/CODE_REVIEW.md:599-621` holds the ten items. |
| SEC-1 entry | No entry | No cycle walk at publish. No hop counter at spawn. Risk: spawning until storage fills. | `src/engine/definitions.ts:468` and `:531`. `src/engine/subprocess.ts:53`. |
| SEC-2 entry | No entry | `requireNonBlank` is the whole check. Three writers apply nothing. Risk: a one-character password on a `system:admin` account. | `src/http/admin-routes.ts:242` and `:253`. `src/auth/users.ts:65`, `:139`, `:235`. |
| SEC-3 entry | No entry | `PATCH /account/me` takes two keys. The file exports two handlers. Risk: an operator learns the new password. | `src/http/account-routes.ts:31`, `:62`, `:113`. |
| SEC-4 entry | No entry | The token lives in `localStorage`. The review calls this a decision to record. Two outcomes are defensible. | `packages/web/src/shell/session.ts:39`, `:44`, `:65`. `persistSession` is the writer, declared at `:64`. |
| SEC-5 entry | The gitignored ledger holds it too | Both windows are in-process `Map`s. The ledger sits under `.gitignore`. An absent ledger disables the gate in silence. The runbook stays silent. | `src/auth/login.ts:49`, `:54`, `:61`. `PONYTAIL-DEBT.md:84-87`. `scripts/gates/ponytail-ledger.sh:22`. `docs/CODE_REVIEW.md:591`. |
| SEC-6 entry | No entry | One upload stops at 5 MiB. The insert runs no aggregate. Risk: stored bytes per instance grow without a ceiling. | `src/http/routes.ts:82`, `:99`, `:359`. `src/runtime/api.ts:2583`. |
| TEST-1 entry | No entry | The route table holds 86 entries. No test iterates it. Risk: a route ships without a check. | `src/http/server.ts:554`. |
| DEP-1 entry | No entry | One workflow, with no CodeQL and no `gitleaks` job. Dependabot covers version drift alone. | `.github/workflows/check.yml`. `.github/dependabot.yml`. |
| CQ-1 entry | No entry | 81 dead directives across fifteen files. 53 sit in `src/schema/compile.ts`, where the review counted ten. | `git grep -o "eslint-disable"` over the TypeScript sources. `docs/CODE_REVIEW.md:467`. |
| ARCH-1 entry | No entry | 2,673 lines, against the 1,384 the review measured. Still the largest source file here. | `wc -l` over the tracked sources. The next three are 1,791, 1,428 and 1,356 lines. Two test files run longer, at 3,128 and 2,562. |
| Eleventh entry | No entry | The comment names five duck-typed checks and calls the remainder four. The list returns twelve, so seven remain. The entry names all seven. | `src/schema/compile.ts:1218-1220`. The twelve spreads at `:1226-1237`. The count at `:1247`. |

### `docs/CODE_REVIEW.md`

| Site | Today | After this change | Evidence |
|---|---|---|---|
| `:61` | Item 4 reads `**SEC-4 · Medium · Login rate limiting is per-process and in-memory.**` | The same line reads `SEC-5` | Detailed finding at `:258`. Action list at `:612`. |
| `:64` | Item 5 reads `**SEC-5 · Medium · No rate limit or quota on any route but login.**` | The same line reads `SEC-6` | Detailed finding at `:286`. Action list at `:610`. |
| `:88` | SEC-D's row reads `carried as SEC-6` | The same row reads `carried as SEC-5` | `:258` is the SEC-5 heading. `:612` names SEC-5 as SEC-D's successor. |

### Replacement prose this change owns

Report 10 carries entry text for every correction above. Four of its entries
needed a rewrite, and an eleventh entry has no source in the report at all.
This session wrote all five. Two of the four stated a wrong fact, so this
session also corrected `tmp/doc-audit/10-carryover.md` in place. All five
follow here in full, because `tmp/` does not survive the archive.

The SEC-4 entry, whose third symbol name was wrong in the report:

```
- **SEC-4: the session token lives in `localStorage`.** `browserStorage` reads
  the global at `packages/web/src/shell/session.ts:39`, `loadSession` reads
  the key at `:44`, and `persistSession` writes it at `:65`. Risk: any script
  running on the origin can read the bearer token. The review treats this as a
  decision rather than a defect: keep `localStorage` and record why, or move
  to a `Secure; HttpOnly; SameSite=Strict` cookie and pay a CSRF token on
  every mutating route. Either outcome belongs in an OpenSpec change.
```

The SEC-5 entry:

```
- **SEC-5: login rate limiting is per-process and in-memory.** Both windows
  are `Map`s in process memory (`src/auth/login.ts:54` and `:61`), marked
  `ponytail:` at `:49`. A second record exists: `PONYTAIL-DEBT.md:84-87` holds
  that marker, its ceiling and its upgrade path, behind the
  `ponytail-ledger-fresh` push gate. That ledger is gitignored, so a fresh
  clone starts without it and `scripts/gates/ponytail-ledger.sh:22` then exits
  0. Risk: two replicas double every threshold, and a restart clears both
  windows. The review names the constraint a Postgres replacement must keep:
  one statement doing the check and the increment together. It also asks for
  the single-process assumption in `docs/runbooks/deployment.md` until the fix
  lands (`docs/CODE_REVIEW.md:591`). That runbook stays silent on it, and the
  `deployment-runbook` capability governs the file, so that sentence needs a
  delta of its own.
```

The CQ-1 entry:

```
- **CQ-1: 81 dead `eslint-disable` directives, and no linter.** The repository
  tracks no ESLint, Prettier or Biome configuration, so every directive
  suppresses nothing. `src/schema/compile.ts` holds 53 of the 81 and fourteen
  other files hold the rest; the review counted ten, all of them in that same
  file. Sixty-six name `@typescript-eslint/no-explicit-any`, thirteen name
  `react-hooks/exhaustive-deps`, and two name one rule each. Risk: the
  comments imply a tool that never runs. Delete them, or adopt a linter and
  give `bun run check` the style gate it lacks.
```

The ARCH-1 entry, whose ranking was wrong in the report:

```
- **ARCH-1: `src/runtime/api.ts` has grown to 2,673 lines.** The review
  measured 1,384 on 2026-08-18, itself up from 1,269 the pass before. It is
  still the largest source file in the repository. Next come
  `packages/web/src/areas/studio/canvas/CanvasView.tsx` (1,791),
  `src/schema/definition.ts` (1,428) and
  `packages/web/src/areas/studio/panels/FieldCatalogPanel.tsx` (1,356). Two
  test files run longer: `test/runtime-api.test.ts` holds 3,128 lines and
  `test/http.test.ts` holds 2,562. Risk: a reviewer reading one operation
  carries the whole file, and two agents editing it contend. The review's fix
  is a split into sibling modules re-exported from `api.ts`, so no import site
  changes.
```

The eleventh entry, last in the section:

```
- **Not from that review: `src/schema/compile.ts:1218` miscounts its own
  list.** The doc comment on `structuralIssues` names five checks that read
  the body duck-typed, then calls the remainder four. The list returns twelve
  checks, so seven remain: `checkFieldTree`, `checkViewFieldPatterns`,
  `checkIdResolution`, `checkLengthBounds`, `checkRedactableFields`,
  `checkGroupReference` and `checkActorFromFieldReference`. The comment at
  `:1247`, inside `compileProcessBody`, already says twelve. Risk: a reader
  trusts the smaller number and misses three checks. The 2026-09-09 documentation
  audit found it; the next change inside that file carries the fix.
```

One more line moves. C1's citation reads `src/auth/users.ts:144` in the
report, and it lands as `src/auth/users.ts:151-152`. C1 also spelled the route
`PATCH /admin/users/:id/name`, while `src/http/server.ts:645` registers
`:userId`. This session corrected that spelling in the report itself. The rest
of report 10's C1 block stands as written.

## Risks / Trade-offs

- [The counts date fast] -> Each entry dates its own numbers, the way
  `CLAUDE.md` dates its spec count. The 81 directives, the 86 route entries
  and the 2,673 lines are 2026-09-09 measurements. A later reader re-measures.
- [A reader takes the display-name entry for a green light] -> The heading
  above it says enough. Each item there needs its own OpenSpec change. The
  entry's last sentence names the owner's approval as the condition. The
  proposal, this design and `tasks.md` each repeat that this change builds
  nothing.
- [Change A lands late, or lands in another shape] -> Both `docs/decisions.md`
  anchors then miss. The implementer stops and re-anchors against the file as
  it stands. Task 1.1 checks the anchor before it writes anything.
- [The id fix reads as history rewriting] -> The first decision above states
  the four properties that make it safe. The archived change keeps that
  reasoning after `tmp/` is gone.

## Rejected suggestions

- The review's S5 asks Change B to say "ten" where
  `openspec/changes/contract-doc-sync/design.md` says "beside the nine open
  `docs/CODE_REVIEW.md` items". The count is wrong, and ten is right. That
  file lies outside this change, which edits two documents alone, so the
  controller carries it to Change B.

## Migration Plan

Two tracked Markdown files change. No deploy, no data migration, and no
rollback beyond `git revert`. The comment in `src/schema/compile.ts` stays
wrong on purpose. This change records it, and a later change inside that file
corrects it.

## Open Questions

None. Report 10 raised four. The Decisions section answers all four against
measurements taken on 2026-09-09.
