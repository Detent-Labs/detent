## Context

See `proposal.md` for motivation. Four facts fix the shape of this change.

**The reports outrank the audit.** The audit opened this effort. Ten readers
then checked every claim at the code, and wrote `tmp/doc-audit/01` through
`10`. Twenty-five audit claims failed that check. The plan repeats several of
them.

A completeness critic reviewed all ten reports. It wrote
`tmp/doc-audit/00-critique.md`. Where a report and the audit disagree, the
report wins. Where the critique and a report disagree, the critique wins. The
exception is a report the reader repaired afterwards. Reports 03, 04, 05 and
10 carry such a repair.

**Wave 0 already landed.** Two commits on this branch correct
`openspec/config.yaml` and `CLAUDE.md`. Two superseded design drafts left
`docs/superpowers/specs/`. Line 324 of `CLAUDE.md` already names the command
`bun run scripts/thirdparty.ts --write`. That command names a file this change
creates. The two must therefore agree word for word.

**The prose gate reads an exit code.** It does not read a line count. The
function `lint_at` in `scripts/gates/prose.sh` returns 0 whenever the linter
exits 0. A count of `grep -c .` applies only at exit 1. Advisory rules such as
`trailing-negation` leave the exit code at 0. An error-class rule such as
`sentence-length` raises it to 1. Then every printed line counts. Four of the
ten reports reasoned from the printed line count instead. The critique
corrected them.

**Four files here carry an armed ratchet.** Each one exits 1 today, so every
printed line counts against its base. The bases, measured 2026-09-09:

| File | Base |
|---|---|
| `docs/current-state.md` | 619 |
| `README.md` | 23 |
| `openspec/specs/authored-content-localization/spec.md` | 9 |
| `openspec/specs/studio-canvas/spec.md` | 107 |

Only `README.md` carries an `allow-file` directive. Its single rule silences
`synonym-rotation` alone, so `em-dash` and `sentence-length` stay armed there.
The other six Markdown files here exit 0. Each one's gate count is 0 whatever
the linter prints.

Report 04's first draft measured 628 at the tip for `docs/current-state.md`.
That draft would have blocked the push. The critique named the nine risers, and
the reader repaired the report. The repaired replacements measure **619 at the
base and 619 at the tip**. The 2026-09-09 review simulated the other three
armed files too, and each one stays level at 23, 9 and 107. Task 11.6
re-measures all four before the commit.

## Goals / Non-Goals

**Goals:**

- Correct every verified drift in the ten documents this change owns. Work
  from the reports, never from the audit's wording.
- Replace the hand-maintained dependency table with a generator, so the same
  drift cannot return with the next `bun install`.
- Keep each of the four armed files at or below its base antislop count.
- Leave each document's own voice, wrap width and section conventions intact.

**Non-Goals:**

- **Report 07's C11.** It rewrites a note in
  `openspec/specs/spa-accessibility/spec.md:66-69`, about a step card that no
  longer exists. The two scenarios below it at `:71-81` still test that card's
  header. C11 alone leaves the requirement's note contradicting its own
  scenarios. That is worse than the stale component name it replaces. A full
  fix rewrites the note and both scenarios together. That is a requirement
  change. It needs a delta, and it goes to change C.
- **Report 04's two deferred items.** Lines 467-469 of `docs/current-state.md`
  say the Runtime API Layer has no assignment or claim enforcement. The
  predicate `requireSubmitAuthority` contradicts that today. Correcting it
  needs a ruling first. Does an entry there state a current fact, or record a
  dated stage? Separately, the live
  `openspec/specs/web-styling/spec.md` lacks the phase-5 paragraph the
  archived delta carries. Syncing a live spec is a capability delta. It needs
  its own change.
- **Report 10's corrections to `docs/decisions.md`.** They are change E. They
  land after this one. See the ordering decision below.
- **The audit's Phase 3 deletions.** Nothing here owns `PONYTAIL-AUDIT.md`,
  `PONYTAIL-DEBT.md`, or the two gitignored drafts under
  `docs/superpowers/specs/`. The critique's item 4 records why two of those
  four verdicts are unsafe as the audit states them.
- No new push gate for documentation staleness. `CLAUDE.md` records that
  defect class as deliberately ungated. This change does not reopen it.

## Decisions

**`skip_specs: true` covers the two spec files too.** Ten of the twelve files
sit outside `openspec/specs/`. Each restates behavior that some archived
change's spec already commits the code to.

The two exceptions take one word each. The name `StepsPanel` becomes
`StepsRail`. One of the two sits in narrative prose
(`authored-content-localization/spec.md:127`). The other sits inside a `SHALL`
sentence, and that sentence keeps its condition
(`studio-canvas/spec.md:102`). No `SHALL` clause gains or loses a condition. No
scenario changes, and no requirement arrives or leaves.

A reviewer who disagrees has a clean test to apply. This change already applies
it, and the test cuts both ways. Report 07's C11 fails it. Renaming there
leaves the requirement's own scenarios contradicting its note, so C11 needs a
real delta.

Report 04's `web-styling` deferral fails the same test from the other side. The
live spec lacks a whole normative paragraph the archived delta carries.
Restoring one is a capability delta. A stale component name inside an unchanged
condition is neither case. The alternative is a delta file for each one-word
rename. That produces two spec files whose whole content is text the tree
already made true.

**The dependency table comes from the script, never from a keyboard.** Report
02's C7 carries the generator verbatim, at 59 lines. Its output matches C1's
replacement table byte for byte. The implementer runs the script rather than
retyping the table. A hand-edited table is what produced five stale rows in
the first place.

The script reads names and versions from `bun.lock`. It then reads each
license from the resolved package's own `package.json`. It throws on a missing
installed copy rather than guessing a license. It must therefore run in the
devcontainer, after `bun install`.

**The root `package.json` registers the script.** It goes beside `seed`, as
`"thirdparty": "bun run scripts/thirdparty.ts"`. That makes this part of the
change three files rather than two. Report 02 raised the question and left it
open. Four of the six existing scripts carry an entry, so registration follows
the majority convention.
Both spellings then work. Line 324 of `CLAUDE.md` names the direct path form,
which stays correct.

**The generator stays outside the typecheck, on purpose.** The `tsconfig.json`
includes `src` and `test` alone. Every file under `scripts/` therefore sits
outside `bun run typecheck`. This change does not widen that include. Widening
it would pull six existing scripts into the typecheck at once. That is its own
change. The script's verification is its output: run it, then compare against
the committed table.

**The StyleX stage takes number 63 and stays open.** Both `ROADMAP.md:313` and
`:397` claim 45 today. The union of both files covers 1 through 62 without a
gap. Auto-derive `key` from `label` keeps 45. Two of three sources already
agree on that, and it owns the history entry at `docs/roadmap-history.md:1585`.
Moving StyleX costs one line.

The stage stays under Open stages. It does not move to the Done table. Its own
text carries a `Reopen triggers:` paragraph at `ROADMAP.md:343-345`, and a Done
row has no such paragraph. This change took that decision on 2026-09-09, to
answer report 06's open question and the critique's first ordering item. No
earlier record holds it, so this paragraph is its record. No Done row and no
history entry arrive for stage 63.

**Stage 44 moves into the Done table.** The stage shipped. Line 323 of
`src/schema/definition.ts` declares `technical?: boolean`. Line 1232 of
`src/schema/compile.ts` wires `checkTechnicalFields` into `structuralIssues`.
Its two named deferrals are out-of-scope notes in the archived change's own
`design.md:28-30`. They are not unbuilt halves.

That is what separates 44 from stages 40 and 43. Those two carry `NOT BUILT`
in their titles, for scope that genuinely does not exist. One archived
proposal says 44 stays reserved for open work. It is a passing aside, in a
change that touched no line of stage 44. The code outranks it.

**The new heading goes above the old one.** Seven built entries move under a
new `## Decided and built` heading. Its full line reads
`## Decided and built (kept for the reasoning, not for the work)`. The heading
stands directly above `## Decided, not yet built`. Six directional references
inside those entries depend on the order.

Lines 876-877 read "pulled forward by the instance-data-tables entry above,
which depends on it". That entry moves while its reader stays. A built section
placed after the unbuilt one would falsify the word "above". The moved entries
also keep their original relative order. Four of the six references are
internal to the moved set.

**The lede names four sections.** One arrives with change E. The reader
repaired report 05's C4 after the critique. It now names the code-review
section that report 10 adds.

The alternative is a three-clause lede here, and a fourth clause in change E.
Report 10 has no lede correction of its own. That split would leave the lede
naming three of four sections. The forward reference lasts one change, and it
is one clause.

**On `docs/decisions.md` this change goes first.** Change E follows it.
Report 10's C1 anchors on the StyleX entry's last line. That is also the
file's last line today. This change's structural move lifts that entry into
the built section. Report 10 must therefore re-anchor.

Its new anchor is the last line of the "Unsaved changes" entry. That entry
stays the tail of the unbuilt section. The line reads `  result.` with two
leading spaces. Report 05's implementer note says four, and the critique
measured two with `cat -A`.

**Every correction comes from its report's byte-exact anchor.** The tables
below carry the facts. The archived change therefore stays readable once
`tmp/` is gone. They do not carry the anchors. An implementer reads the anchor
and the replacement text from the named report. Match on text, never on a line
number.

### `THIRDPARTY.md` (report 02, C1 through C6)

| # | Said | Says now | Evidence |
|---|---|---|---|
| C1 | `typescript` 5.6.2 | 7.0.2 | `bun.lock:310` |
| C1 | `zod` 4.4.3 | 4.5.4 | `bun.lock:328` |
| C1 | `lucide-react` 1.29.0 | 1.40.0 | `bun.lock:278` |
| C1 | `@types/react` at two versions | 19.2.18 alone | `bun.lock:162` |
| C1 | `@types/react-dom` at two versions | 19.2.4 alone | `bun.lock:164` |
| C1 | a row for `immer` | no such row | `grep -c immer bun.lock` prints 0 |
| C1 | no StyleX row | `@stylexjs/stylex` and `@stylexjs/unplugin`, 0.19.0, MIT | `bun.lock:154`, `:156` |
| C2 | the type packages "resolve twice" | they resolve once, at `^19` | `bun.lock:162`, `:164` |
| C3 | transitives are Vite plus React helpers | Babel too, from `@stylexjs/unplugin` | `packages/web/vite.config.ts:6` |
| C4 | build-time tooling omits the plugin | it names `@stylexjs/unplugin` | `packages/web/package.json:24` |
| C5 | the runtime list names `immer` | it names `@stylexjs/stylex` | `areas/admin/root.tsx:2`, `:58` |
| C6 | the notice "cross-checks every workspace" | `scripts/thirdparty.ts` builds the Direct dependencies table | `scripts/gates/lockfile.sh` |

C6 also names the `frozen-lockfile` gate, which keeps the lockfile's
`workspaces` block true to the manifests. The old sentence promised a
cross-check that no script performed. Today `ls scripts/*.ts` names six files,
and none of them is this one.

### `docs/current-state.md` (report 04, C1 through C16)

| # | Said | Says now | Evidence |
|---|---|---|---|
| C1 | grid snapping cites `areas/studio/app.css` | `form-ui/tokens.stylex` | `canvas/CanvasView.tsx:3` |
| C2 | "The stylesheet reads all three" | the `wrap` style reads all three | `CanvasView.tsx:70`, `:76` |
| C3 | multi-select cites the same sheet | `form-ui/tokens.stylex` | as C1, at `:1816` |
| C4 | edge routing cites the same sheet | `form-ui/tokens.stylex` | as C1, at `:1857` |
| C5 | keyboard traversal cites the same sheet | `form-ui/tokens.stylex` | as C1 |
| C6 | the `:focus-visible` outline sits in `tokens.css` | in `global.css` | `shell/global.css:37-40` |
| C7 | `boundaries.test.ts` scans 153 classes for collisions | that test went with the sheets | its seven tests read no `.css` file |
| C8 | "`shell.css` styles no `:invalid` state" | `global.css` does not | `shell/global.css:105-119` |
| C9 | "`app.css` gained three stamp tones" | four compiled tones in `StartedScreen.tsx` | `StartedScreen.tsx:41-53` |
| C10 | "never styles another area's prefix" | "never reads another area's style object" | `design-language.md:150` |
| C11 | `PublishMenuItem` holds Publish in the menu | `PublishNavControl` and `PublishReasonLine` | `ProcessHeaderBar.tsx:317`, `:369` |
| C12 | the third data-source type has no named handler | `src/engine/instance-query-source.ts` | `host.ts:226` |
| C13 | nothing describes `src/schema/step-graph.ts` | two paragraphs on the dominator pass | `step-graph.ts:43`, `:100` |
| C14 | nothing describes `src/engine/instance-drafts.ts` | a new section on the draft table | `instance-drafts.ts:15`, `:48` |
| C15 | nothing describes the styling model | a new `## The styling model` section | `openspec/specs/web-styling/spec.md` |
| C16 | "It has three operations" | "It has no HTTP transport of its own" | 33 exported functions |

C1 and C3 through C5 are the four `areas/studio/app.css` citations. With C8
and C9 they make the six deleted stylesheets the audit found. C2, C6, C7 and
C16 are the four it missed. C11's rewrite also binds the button to its reason
through `PUBLISH_REASON_ID`, and keeps `aria-disabled` on the button.

C13, C14 and C15 add the three passages this file lacks. C13 covers the
exports-map entry `./schema/step-graph`, its iterative fixpoint and its two
consumers. C14 covers the `instance_drafts` table, its 8 MiB envelope, its
single writer and its `stepId`-matched read. C15 covers the compile step, the
token module, phases 0 through 5, and the class names that stay literal.

Report 04's replacements already carry the nine prose repairs from the
critique's item 1. That is why the tip measures 619 rather than 628.

### `docs/decisions.md` (report 05, C1 through C8b)

| # | Said | Says now | Evidence |
|---|---|---|---|
| C1 | "Two types now ship" | three ship, with `"instance.query"` | `src/engine/host.ts:226` |
| C2 | ribbon, panels screen, index rail, `EditorArea` | process surface, tab row, tab, `ProcessSurface` | `ui-glossary.md:97`, `:103` |
| C3 | the prompt sits at `root.tsx:66`, twice | `root.tsx:86`, twice | `areas/studio/root.tsx:86` |
| C4 | the lede names two things | it names four | change E adds the fourth |
| C5 | sixteen entries stand under one heading | seven move to a new heading above | report 05's classification table |
| C6 | "a dirty-state failure in `EditorArea`" | "in `ProcessSurface`" | `EditScreen.tsx:316` |
| C7 | Change 3 "measured out as worth building" | it shipped on 2026-09-01 | `src/engine/store.ts:330-332` |
| C8 | the `scope=all` gate sits at `routes.ts:449` | at `:481` | the sole `requireRole` call |
| C8b | a second `routes.ts:449` in the history | at `:481` | `docs/decisions.md:628` |

The seven entries that move are the audit log, the aggregated data source, and
instance data tables. The other four are the promotion of standardized
instance keys, the long text control, `FieldDef.default` and StyleX.

Process-scoped permissions stays under the unbuilt heading, against the
audit's claim. Line 79 of `src/auth/authorize.ts` declares no `"author"`
member, and the entry keeps that piece open. C7 is what lets the promotion
entry move, so it applies before C5.

### `ROADMAP.md` and `docs/roadmap-history.md` (report 06, C1 through C6)

| # | Said | Says now | Evidence |
|---|---|---|---|
| C1 | the open StyleX stage is 45 | it is 63 | `ROADMAP.md:313` against `:397` |
| C2 | the Done table jumps 42 to 45 | a row for 44 stands between | `compile.ts:887`, `:1232` |
| C3 | stage 44 stands in full under Open stages | that block is gone | `ROADMAP.md:10-12` |
| C4 | no history entry 44 exists | one stands between 42 and 45 | `ROADMAP.md:307-308` points at it |
| C5 | the history ends at stage 60 | entry 61 covers the publish gate | `studio-routes.ts:88-89` |
| C6 | the history has no entry 62 | entry 62 covers the process surface | `areas/studio/routing.ts:25-36` |

Two cautions from report 06 carry into the new entries. Stage 62 did not ship
the way its proposal planned. The area nav stands empty of draft controls, and
Save, Discard draft and Publish stand on the header row. Stage 61's proposal
promises a source test that no tree holds. C5 omits that claim.

### `README.md`, `PRODUCT.md`, `design-language.md` (report 07, C1 to C8)

| # | Said | Says now | Evidence |
|---|---|---|---|
| C1 | a route file per surface, UI strings included | UI strings sit in `admin-routes.ts` | `admin-routes.ts:846` |
| C1 | health and readiness sit beside them | `server.ts` answers both itself | `server.ts:513`, `:517` |
| C2 | the status grid has no `src/tenancy/` row | a row covers the tenant mode | `src/tenancy/store.ts:11-13` |
| C3 | `docker run -p 8080:8080 app` | the tag is `web` | `README.md:173` |
| C4 | "The written face is Archivo" | it is the system stack | `shell/tokens.css:72`, `:74` |
| C5 | seven example definitions | nine of them | nine files in `examples/` |
| C6 | 99 capability specifications | no number, one directory each | 111 directories today |
| C7 | studio's index rail, from `PanelsScreen.tsx` | the entity rail, from `EntityTabs.tsx` | `EntityTabs.tsx:72-78` |
| C8 | three exception classes, no rule named | only `.studio-dialog::backdrop` has a rule | `shell/global.css:131` |

C7 also drops the claim that the kind word is mono and right-aligned. Line 147
of `EntityTabs.tsx` says the opposite. The replacement adds one sentence on
the steps rail, whose row does lead with a mono number.

### The two live specs (report 07, C9 and C10)

| # | Said | Says now | Evidence |
|---|---|---|---|
| C9 | `authored-content-localization/spec.md:127` names `StepsPanel` | `StepsRail` | `StepsRail.tsx:221` |
| C10 | `studio-canvas/spec.md:102` names `StepsPanel` | `StepsRail` | `StepsRail.tsx:160-165` |

## Risks / Trade-offs

- [An armed file rises above its base count] -> Task 11.6 re-measures all four.
  It reads the exit code before the line count. In `docs/current-state.md` the
  four largest additions are C11, C13, C14 and C15. A further change to any of
  them needs a fresh measurement.
- [The committed dependency table drifts from `bun.lock` again] -> The script
  is the source. Task 2 diffs its output against the committed table. Line 324
  of `CLAUDE.md` tells the next author to rerun it.
- [The script throws `no installed copy of ...`] -> It reads licenses off
  disk. It needs the devcontainer and a fresh `bun install`. A stale
  `node_modules` on this host still holds `immer@11.1.15`, which no lockfile
  entry claims.
- [Line numbers shift as `docs/decisions.md` changes] -> Apply C5's
  structural move first, on the current-tree numbers. The other eight
  replacements are byte-exact, so their position does not matter.
- [Stage 44's text disappears before its row exists] -> C2 runs before C3.
  C4 lands in the same commit. `ROADMAP.md:10-12` binds the two files.
- [Change E never lands, so the lede names an absent section] -> One clause,
  one change apart. Report 10 exists. Its corrections carry evidence.
- [Another change renames a symbol this sweep writes by hand] -> The file
  `docs/current-state.md` names symbols by hand, with no gate behind it.
  Report 04 lists the twenty-two names it confirmed on 2026-09-09. Re-confirm
  them if other work lands first.
- [The version column misorders a future release] -> The generator sorts
  versions as text, then reverses. That is right for `react` today. It would
  put `4.5.4` above `4.10.0`. A semver parse is not worth it yet.

## Migration Plan

Ten tracked documents change. One new script arrives, and `package.json` gains
one line. No deploy, no data migration, no database change. Rollback is
`git revert`. The generator can rerun at any time, and its output is
deterministic for a given `bun.lock`.

## Open Questions

Nothing here blocks implementation. Four questions are on the record, so the
next reader finds them.

- The container table in `THIRDPARTY.md` names `postgres:16`. No tracked file
  carries that number. The devcontainer compose pins `postgres:latest`, and
  the deploy stack lives in untracked `tmp/`. Somebody who can read that stack
  must confirm the number, or reword the row. This change leaves the row
  alone.
- Entries 29, 37, 38 and 39 of `docs/roadmap-history.md` lack the bold title
  the other 53 carry. Cosmetic, four lines, and no factual change.
- Lines 467-469 of `docs/current-state.md` say the Runtime API Layer enforces
  no assignment or claim. The predicate `requireSubmitAuthority`
  (`src/runtime/api.ts:1294`, called at `:1354`) says otherwise. C16 rewrites
  `:465`, two lines above, and stops there. The ruling needed first: does an
  entry in that file state a current fact, or record a dated stage? Report 04
  defers the line for that reason.
- Twenty-two exports of `src/runtime/api.ts` go unnamed in
  `docs/current-state.md`. Report 04 recommends naming four, and leaving the
  rest. That document describes subsystems rather than listing an API. C14
  covers one of the four.
