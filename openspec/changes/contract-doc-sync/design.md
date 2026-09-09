## Context

See `proposal.md` for motivation. Five facts fix the shape of this change.

**The report outranks the audit.** `tmp/doc-audit/08-rules-contract.md` checked
every audit claim at the code in the working tree. Four audit claims failed that
check. The report's "Rejected findings" section records each one. The
completeness critic then re-verified the report against the tree. Where the
audit and the report disagree, the report governs.

The four rejected claims matter, because a reader working from the audit would
write the wrong text:

- The audit says the rule file names eight of the twelve structural checks. It
  names **ten**. Only `checkFieldTree` and `checkRedactableFields` go unnamed.
- The audit says four checks are missing from `structuralIssues`.
  `checkFieldFormatControl` and `checkColumnMapping` are **not**
  `structuralIssues` entries at all. They run per field, inside `checkFieldTree`
  (`src/schema/compile.ts:701-705`). The rule file states none of the four
  rules, so the corrections stand. The framing does not.
- The audit says the last two checks carry code comments citing this rule file.
  Neither does. Two other comments name it: `src/schema/compile.ts:652`, inside
  `checkFieldFormatControl`, which cites the placement rule rather than the
  invariant, and `packages/web/src/areas/studio/draft/checksRail.ts:4`, about
  group display order.
- The audit says two subprocess step refinements sit at `definition.ts:840-843`.
  There are **three**, at `:838-841`.

**The "fourth DB check" claim was wrong twice.** The total was wrong, and so was
the ordinal. The engine awaits **six** DB-resolving checks in `publishBody`
(`src/engine/definitions.ts:680-687`). Of those six, `validateGroupScope` is the
**third**. The audit called it the fourth.

**All three target files exit 0 at the linter today**, so the prose gate's base
count is 0 for each. This session measured all three.

**No test asserts anything about the two rule files.** `bun test` cannot catch a
wrong replacement here. The prose gate and the whitespace gate are the only
gates this change can trip.

**The three files change together.** The `order` correction is one fact stated
in two files. Shipping either alone leaves the contradiction the audit found.

## Goals / Non-Goals

**Goals:**

- Correct the two rule files against the code. Scope stays at the sixteen
  corrections the report verified.
- Keep the byte-exact anchors in `tmp/doc-audit/08-rules-contract.md`, which the
  implementer reads. Record the facts here, so the archived change stays
  readable once `tmp/` is gone.
- Resolve the report's three open questions here, rather than leaving them for
  the implementer.

**Non-Goals:**

- No delta spec. See the decision below: every rule this change documents
  already stands as a `SHALL` requirement in a living capability spec.
- No repair of the wrong source comment at `src/schema/compile.ts:1218-1220`.
  It is code, not documentation. See the decision below.
- No prose rewrite of either rule file beyond the sixteen corrections. The
  ratchet blocks a rising count, not a non-zero one.
- No second copy of the `ALLOWED_BY_TYPE` table. See the decision below.

## Decisions

### `.claude/rules/process-contract.md`, seven corrections

| ID | What the file says now | What it will say | Evidence |
|---|---|---|---|
| C1 | Overrides `visible / required / readonly / order / group` | Overrides `visible / required / readonly / span / group / validation / validationMode`. No `order` key exists. Array position is the order | `definition.ts:650-681`, `:687-695`; `FieldForm.tsx:252` |
| C2 | `FieldDef.redactable` unmentioned | A "Redaction marker" paragraph. It covers erasure eligibility, the group ban, independence from `technical`, and the `redactable: false` hash rule | `definition.ts:324-335`, `:354`; `compile.ts:929-953` |
| C3 | `format`, `control`, `columnMapping` unmentioned | A "Field semantics" paragraph. `ALLOWED_BY_TYPE` is the one pair table. The `columnMapping` bounds follow | `definition.ts:421-427`, `:283-310`; `compile.ts:643-685`, `:575-611` |
| C4 | `View.columns`, `ViewField.span`, the validation override unmentioned | Two paragraphs. Layout keys are `1` or `2` and reach no guard. `validationMode` merges or replaces | `definition.ts:711-723`, `:657-679` |
| C5 | `org.manager-of-starter` and `org.group-members` also ship | `org.actor-from-field` ships too, a fourth strategy beside `static` | `assignment-strategies.ts:127-133`, `:84` |
| C6 | One of the **two** org-aware strategies, adding a **fourth** DB check | One of the **three**, adding a **third** | `definitions.ts:183-187`, `:680-682` |
| C7 | Silent on the total | `publishBody` awaits six DB-resolving checks, named in call order | `definitions.ts:680-687`, `:449` |

**C3 carries a correction.** An earlier copy ended its third sentence with "and
so do the studio's two pickers". The studio reads no such table.
`grep -rn "ALLOWED_BY_TYPE" packages/` returns nothing. The only read in `src/`
sits at `compile.ts:660`.

The studio has no format picker and no control picker. Its kind picker is
`KindPicker` (`FieldCatalogPanel.tsx:419`). That picker writes whole
`{type, format, control}` triples from `definition.ts::FIELD_KINDS` (`:367`,
`:393`). Those sixteen entries are a curated subset of the twenty-five
combinations `ALLOWED_BY_TYPE` admits (`definition.ts:441-444`, `:464-481`). C3
now states that, and the report at `tmp/doc-audit/08-rules-contract.md` carries
the corrected bytes.

### `.claude/rules/authoring-invariants.md`, eight corrections

| ID | What the file says now | What it will say | Evidence |
|---|---|---|---|
| C9 | `checkFieldTree` unmentioned | Five per-field checks share one `walkFieldsIndexed` pass. `structuralIssues` lists twelve checks. `checkFieldTree` is one entry, and those five carry none | `compile.ts:687-711`, `:1224-1239` |
| C10 | The `format`/`control` pair rule missing | A bullet. The pair rule reads `ALLOWED_BY_TYPE`. A plugin-typed field has no row | `compile.ts:644-683`; `definition.ts:421-427` |
| C11 | The `columnMapping` bounds missing | A bullet. It names `dataSource`, `type: "string"`, key grammar and length, target resolution, the group ban, the self ban, the duplicate ban. It reads no data list | `compile.ts:575-611`, `:566-568` |
| C12 | The `redactable` group rule missing | A bullet. A `redactable` field is never `type: "group"`. It places no restriction on `technical` | `compile.ts:929-953`; `definition.ts:326-335` |
| C13 | Two subprocess step refinements implied | **Three** refinements. Spec presence both ways, and all-automatic paths on a wait-state | `definition.ts:838-841`, `:825` |
| C14 | Key uniqueness missing | A bullet. Field keys unique across the tree. Data source keys unique, and clear of the reserved CEL namespaces | `definition.ts:930`, `:951-956`, `:911` |
| C15 | `migrationSpec.fieldMap` injectivity missing | A bullet. Two sources targeting one field collapse under the snapshot remap, so registration fails | `definition.ts:1068-1071`, `:1050-1054` |
| C16 | `checkLengthBounds` owns the bounds, plus `checkPatterns` for the pattern | `checkLengthBounds` owns `Plugin.type`, `duration`, non-field-tree `Expression.src`. The field-key bound and a field's own expression length sit in `checkFieldTree` | `compile.ts:846-851`, `:854-871`, `:632-641`, `:706-708` |

C16 came from the report, not the audit. The reader found it while verifying
another item.

**C9-C16 all append inside an existing group.** `checksRail.ts:4` ties the
studio's check-group display order to this file's order. That order runs over
the six `IssueSource` values `CHECK_SOURCES` lists (`checksRail.ts:8`). A new
group here, or a reordering of the existing ones, would make that comment
stale. The report's replacements append within a group, so the constraint costs
no rework.

### `docs/authoring-guide.md`, one correction

| ID | What the file says now | What it will say | Evidence |
|---|---|---|---|
| C8 | `visible, required, readonly, its span, its order, its group.` | `visible, required, readonly, its span, its group.` | Same as C1. Line `:833` already states it correctly, so `:482` is the only wrong site |

### This change owes no delta spec

The report's research question asked whether the four undocumented checks are a
spec gap. They are not. Every rule this change documents already stands as a
`SHALL` requirement in a living capability spec. This session re-read each row:

| Rule this change documents | Living spec requirement |
|---|---|
| `checkFieldTree`, the shared walk | `field-tree-check-consolidation/spec.md:15`, naming all five sub-checks |
| The `format`/`control` pair rule | `definition-contract/spec.md:827`, table at `:832-839`, literal default at `:884` |
| The `columnMapping` bounds | `definition-contract/spec.md:960`, seven bounds at `:969-979` |
| The `redactable` group rule | `definition-contract/spec.md:1119`, group rule at `:1127-1129` |
| Subprocess spec presence | `definition-contract/spec.md:14` |
| Subprocess all-automatic paths | `definition-contract/spec.md:33` |
| Field key and data source key uniqueness | `definition-contract/spec.md:90` |
| `migrationSpec.fieldMap` injectivity | `instance-migration/spec.md:380`, scenario at `:411` |

`.openspec.yaml` therefore sets `skip_specs: true`. A requirement written here
would exist only to satisfy `openspec validate`, which the artifact rules
forbid.

One dependency to respect. `studio-column-mapping-form/spec.md:53` and `:120`
name `checkColumnMapping` by function, and forbid the editor re-implementing its
rules. C11 must not contradict that spec.

### The `allow-file` directive narrows from six rules to four

`process-contract.md:14` carries a six-rule blanket directive:
`synonym-rotation em-dash passive-voice sentence-length run-ons` and
`paragraph-length`. `CLAUDE.md` calls that pattern "the one to avoid, not the
one to copy". C1 through C7 add roughly 30 lines under it.

This session measured every option rather than guessing. Findings printed, and
the process exit code beside each:

| Directive | Printed | Exit | Gate count |
|---|---|---|---|
| Six rules, as today | 5 | 0 | 0 |
| No directive | 82 | 1 | 82 |
| Six rules minus `synonym-rotation` | 7 | 0 | 0 |
| Six rules minus `passive-voice` | 37 | 0 | 0 |
| Six rules minus `paragraph-length` | 6 | 0 | 0 |
| Six rules minus `em-dash` | 22 | **1** | 22 |
| Six rules minus `sentence-length` | 27 | **1** | 27 |
| Six rules minus `run-ons` | 8 | **1** | 8 |

Three of the six rules are load-bearing: `em-dash`, `sentence-length` and
`run-ons`. Dropping any one of them flips the exit code and blocks the push. The
other three cost nothing at the gate.

**Chosen: narrow to `em-dash passive-voice sentence-length run-ons`.** Dropping
`synonym-rotation` and `paragraph-length` costs 3 printed lines. The exit code
holds at 0. This session simulated the narrowed directive with C2, C3, C4 and
C7's new prose appended. Result: 10 printed lines, exit 0, gate count 0.

`passive-voice` stays silenced on measurement, not on principle. Thirty-two live
findings there would bury any future report in noise. Removing the directive
outright stays a non-goal. That costs 82 findings and a red gate, for a
whole-file rewrite of prose this change did not author.

This design records the residual debt rather than leaving it silent. Two rules
stay silenced across a 240-line file, for reasons nobody re-examines. A later
change that rewrites this file's prose can retire them.

### The wrong source comment routes to Change E

`src/schema/compile.ts:1218-1220` says "the remaining four operate on the
`ProcessBody`-typed parameter". Seven of the twelve do. The claim is wrong.

It is a code comment, not documentation. This change edits no file under `src/`,
and `proposal.md` states that boundary. A repair here would extend a
documentation change into the engine. The four gates would then need a real code
review, not a prose check.

**Chosen: record it on Change E's carry-over list**, beside the ten open
`docs/CODE_REVIEW.md` items that wave already collects. It is a one-line fix for
whoever next edits `compile.ts`.

### The rule file states the pair rule in prose, without the table

C3 and C10 both describe `ALLOWED_BY_TYPE`.
`definition-contract/spec.md:832-839` already carries the full
`type`/`format`/`control` table, six rows.

**Chosen: prose only, no second table.** Two copies of one table diverge. The
rule files state load-bearing rules. They do not mirror a spec. The prose names
`definition.ts::ALLOWED_BY_TYPE` as the one table both halves read, which sends
a reader to the code. The spec keeps the enumeration.

This matches how both rule files already work. Each states a rule and names the
function or the spec that owns it.

### Apply C2 before C3

C3's anchor is the last sentence C2 introduces. Every other anchor in the report
matches text already in the tree, and no two anchors overlap. The report's
"Notes for the implementer" section carries this caution and seven more. One
names the U+2014 em dash in both rule files.

## Risks / Trade-offs

- [An anchor drifts between this proposal and the apply phase] -> The anchors
  are byte-exact against `55f36abb`. The implementer reads each file immediately
  before editing it, per `CLAUDE.md`. A `grep` for the anchor that returns
  nothing means the tree moved. The reader then re-derives from the cited
  `file:line` rather than guessing.
- [The narrowed directive lets a future error-class finding print 10 lines
  instead of 6] -> The repair stays the same. Remove the error-class finding,
  and the exit code returns to 0. The gate counts 0 at exit 0, whatever the
  printed count.
- [C11 contradicts `studio-column-mapping-form`] -> That spec forbids the editor
  re-implementing the engine's rules. C11 states the engine's rules, and names
  `compile.ts::checkColumnMapping` as their home. That is what the spec depends
  on.
- [`bun test` reports green and proves nothing here] -> True, and stated in
  `proposal.md`. The gate still demands the run. The prose and whitespace gates
  carry the real signal for this change.

## Migration Plan

Edits to three already-tracked documentation files. No deploy, no data
migration, no rollback beyond `git revert`.

The gates read committed content, not the worktree. A run over a tree with
uncommitted edits checks nothing and reports green.

## Open Questions

None. The report raised three, and the decisions above resolve all three.
