# Audit record, 2026-10-10

This entry holds the full-project audit of commit `5f41cd8a`, the HEAD of
`main` on 2026-10-10. The audit only read the tree and changed no file. Nine
review agents checked the areas A to H, with the studio split into E1 and E2.
The coordinator then re-checked every high finding and every reproducible
medium finding. This directory holds a record and no archived change. The change
`record-2026-10-10-audit` placed it here, and the directory name takes the
audit date.

## Result

The audit reports 0 critical, 7 high, 43 medium and 79 low findings. That
makes 129 findings under 131 ids, because C-4 merges D-2 and C-6 merges F-6.
The coordinator downgraded four findings. E1-1, E1-3 and E2-1 fell from high
to medium, and G-4 fell from medium to low. The file `verify-ledger.md` gives
the reason for each downgrade.

## Files

| File | Content |
|---|---|
| `README.md` | This overview |
| `AUDIT.md` | The English report: summary, every finding by severity, checks, "Not checked" and sources |
| `verify-ledger.md` | The coordinator's cross-check: check output, quoted repro output and the reason for each downgrade |
| `reports/A.md` | Area A: definition contract |
| `reports/B.md` | Area B: engine (`src/engine/`) |
| `reports/C.md` | Area C: Runtime API and tenants |
| `reports/D.md` | Area D: HTTP, auth, handlers |
| `reports/E1.md` | Area E1: studio without panels |
| `reports/E2.md` | Area E2: studio panels |
| `reports/F.md` | Area F: other web areas and the renderer |
| `reports/G.md` | Area G: tests, examples, infrastructure |
| `reports/H.md` | Area H: docs against code |

Each area report keeps every finding of its area under the same id. It holds
the case narrative, the mechanism, the counter-evidence and the repro
proposal.

## Method and evidence

Most findings carry one of three evidence tags. The dead-export findings D-10
and F-15 name their search method instead. Reproduced means the finding quotes
program output. Confirmed means a reader checked the code and confirmed the
finding. Assumed means a guess, and the finding names the missing proof.

The coordinator ran these checks in the devcontainer `workflow-engine-app-1`,
with bun 1.3.11 and no server running:

| Command | Result | Quoted line |
|---|---|---|
| `bun run typecheck` | Exit 0 | `form-ui typecheck: Exited with code 0` / `web typecheck: Exited with code 0` |
| `bun run lint` | Exit 0 | `Found 0 warnings and 0 errors.` (584 files, 96 rules) |
| `bun run build` | Exit 0, one warning | `✓ built in 45.80s`; `Some chunks are larger than 500 kB` (K-1) |
| `sh scripts/test-gated.sh bun test` | Exit 0, gate passed | `4999 pass / 1 skip / 0 fail`, `Ran 5000 tests across 259 files. [82.09s]`, DB `workflow_engine_test` |
| `bun run test:tz` | Exit 0 | `20 pass / 0 fail`, `Ran 20 tests across 1 file.` |
| `bun audit` | Exit 0 | `No vulnerabilities found` |

The skip count was 1, which equals the floor in
`scripts/gates/skip-floor.txt`. The one skip sits in
`packages/web/test/reporting-reportingLogic.test.ts:84`
(`skipIf(!ZURICH)`), and `test:tz` runs that test.

The headless boundary held. A `git grep` found no import from React or from
`packages/` in `src/`. No file in `packages/` reaches into `src/` past the
exports map.

The audit left four things unchecked:

- No stack ran, so the browser checks stayed manual and `e2e/` did not run.
  Code reading alone backs most UI findings.
- Repros that write to the database did not run. Code reading backs C-1, C-3,
  B-1 to B-5, D-3 and H-4.
- No EXPLAIN and no profiler ran, so the scale of six findings stays assumed.
- The LSP tool did not start, so dead exports rest on `git grep -w` and the
  knowledge graph. These two do not rule out re-exports and dynamic access.
  Some files got only a partial read.

The section "Not checked" in `AUDIT.md` gives the full list. Each area report
adds its own.

## Line numbers

Every line number in the record is a historical anchor of `5f41cd8a`. No line
number in it serves as a live pointer into the current tree.

## Where the live findings are

Every open finding sits in
[`docs/decisions.md`](../../../../docs/decisions.md), in the section "Open
from the 2026-10-10 audit (one OpenSpec change each)". That section held 36
entries when this record landed. Each fix change deletes its own entries in
the commit that archives it. The change `sweep-docs-drift-2026-10` re-points
the line citations of other entries.

## Rulings that shaped the work

Thirteen rulings shaped the work.

### Owner rulings of 2026-10-10

1. On B-2: a commit that leaves a subprocess step other than through the
   return cancels the running child.
2. On B-1: publish gets no new rule. The engine fix alone applies: the engine
   always waits for the child at a subprocess step. An else path without a
   guard stays allowed.
3. On A-4: guards, visibility and required conditions, and `validation.rule`
   must type to `bool` at publish. The type `dyn` stays allowed. The fix
   reverses the rule in `cel-expressions:381-385`.
4. On G-5: a secret becomes a reference to an environment variable,
   `{ "env": "NAME" }`. The deployment sets an allowlist of names, per tenant
   in SaaS mode. A secret store can follow later, if needed.
5. On E2-1: conditional buttons stay allowed, and the studio makes their guard
   editable. The spec `studio-app` holds, and `studio-condition-builder`
   follows it.
6. On E2-7: once a field has CEL readers or a published version, the label
   stops setting its key. A deliberate rename of the key stays
   possible. It shows how many expressions read the key.
7. On F-3: cleared means removed. The form sends `null`, and the engine removes
   the key. A required field counts `""` and `null` as missing.
8. On D-5: the Developer access list applies to both publish routes. It binds
   non-admins, on top of the publish permission. The first publish of a new
   process stays possible.
9. On the audit in the repository: this directory holds a full review record.
   Its report and agent reports are in English. An index in
   `docs/decisions.md` joins it. The change `record-2026-10-10-audit` carries
   both. The ruling left one question open: how the translation passes the
   prose gate. Ruling 12 answers it.

### Owner ruling of 2026-10-11, on security

10. Nine findings concern security: C-1, C-2, C-3, C-8, D-1, D-3, D-8, G-5 and
    G-12. The record keeps their case narrative, mechanism, locations and
    quoted check output. It drops the literal attack payloads. The index
    states each of the nine in one factual risk sentence with no trigger
    recipe.

### Coordinator ruling of 2026-10-11, on payloads

11. The cut of ruling 10 extends to four more unfixed findings: B-5, C-4
    (with D-2), C-7 and D-6. The record keeps their case narrative, mechanism,
    locations and quoted check output. It drops the literal values and the
    step-by-step sequences.

### Coordinator rulings of 2026-10-11

12. On the prose gate: each translator wrote clean English first and repaired
    what the linter reported. A targeted `antislop` directive needs a reason.
    It covers only a quote, a table, a fixed glossary term or a finding id
    that the linter flags. No
    file in the record carries a file-wide directive.
13. On the originals: the record holds English only. The German originals are
    not part of the record.

## What the record leaves out

- The German originals.
- The fix plan and the per-change briefs. They steer the fix run, and the
  index keeps the map from finding to change.
- The attack payloads of the nine security findings and of the four findings
  in ruling 11.
- The raw check logs. The checks table above quotes the lines that matter.
