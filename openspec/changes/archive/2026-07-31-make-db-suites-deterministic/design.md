<!-- antislop: allow-file passive-voice -->
<!-- Test outcomes and DB rows are described by what happens to them, not by
     who acts on them. -->

## Context

See proposal.md, section Why, for the symptom, the twenty runs and the nine
tests.

The failures stay inside the DB-backed worker paths. All nine sit in
`test/outbox.test.ts`, `test/resolution.test.ts`, `test/migration.test.ts`,
`test/subprocess.test.ts` or `test/definitions.test.ts`. None has landed in
schema, CEL, validation or frontend logic, none of which touch a database.

One assertion is captured. In `test/outbox.test.ts:350`, after `MAX_ATTEMPTS`
rounds of `makeDue` plus `drainOutbox`, this held false:

```
r.every((x) => x.status === "dead-letter" && x.attempts === MAX_ATTEMPTS)
```

So at least one of that instance's three rows did not reach the cap. The same
test failed a second time, but only its name survived that run.

## Goals / Non-Goals

**Goals:**

- Name the mechanism that produces a wandering result, with evidence.
- Remove it, so repeated full runs agree.

**Non-Goals:**

- No retry wrapper around the suite, no widened timeout, no skipped test.
  Those leave the gate green over the same defect.
- No rewrite of the worker tests into mocks. They cover real transaction
  behavior, which is why they are worth having and worth fixing.
- No second database for the suite. That would hide a contention cause rather
  than name it.

## Decisions

**Diagnose before touching code**. The repo already recorded one decision on
this defect: do not guess a fix without a captured assertion. That decision
stands. Task group 1 collects runs until a second assertion for the same test
lands. Only then does the fix get designed.

The capture is cheap. A full run takes about 45 seconds and fails about half
the time. Twenty runs with the output kept should produce several captures.
It also yields a rate estimate, in a quarter of an hour.

### Diagnosis: the dev server drives the same database the suite drives

`src/http/server.ts:526` calls `startEngine`. That starts four background
pollers against the database handed to it (`src/engine/host.ts:87`):

- `startOutboxWorker(db, registry, 500, resolveBody)`, ticking every 500 ms
- `startResolutionWorker(db, resolveBody)`
- `startTimerScheduler(db, resolveBody)`
- `startRetentionSweep`, when a retention window is configured

The devcontainer has one database. A `bun run serve` left running therefore
claims outbox rows, resolves parked instances and fires timers. It does so
**while the suite drives the same tables**, taking whatever is due every
500 ms.

Measured on the same tree, twenty runs each:

| Container state | Red runs |
|---|---|
| `bun run serve` plus a Vite dev server up | 3 of 20 |
| Neither running | **0 of 20** |

The four captured assertions all match that mechanism. Three report a state
that has not advanced yet, one reports a row another actor already touched:

| Site | Expected | Received | Reading |
|---|---|---|---|
| `test/resolution.test.ts:227` | `2` | `1` | the worker claimed one of the two rows first |
| `test/subprocess.test.ts:712` | `cancelled` | `running` | the worker consumed the spawn action |
| `test/http.test.ts:1222` | `completed` | `running` | the worker took the delivery the test meant to drain |
| `test/outbox.test.ts:745` | `true` | `false` | `attempts`/`status` moved between the test's own write and its read |

`test/outbox.test.ts:745` is the one that settles it. Its five `UPDATE`
statements are fully awaited, and its rows are instance-scoped after a
`TRUNCATE outbox`. Nothing inside the test can race it. Only an outside writer
can move those rows.

This is the mirror image of a hazard the repo already documents, that
`bun test` wipes the devcontainer's demo state. The other direction was never
written down: a running dev server corrupts test runs.

### Why the earlier hypotheses missed it

**H1**, which tasks 1.4 and 1.5 test, blamed the five files' differing
`beforeEach` cleanup. One of them, `test/subprocess.test.ts`, carries none at
all. Rows therefore pile up down that file, against a claim query bounded at
`LIMIT 100`.

The run data does not support it. The red tests sat at positions 11, 77, 35
and 9 in their files. Accumulation had barely started where H1 needs it to be
large.

**H2**, which task 1.6 tests, blamed a row stuck `claimed` until lease
reclaim. The captured assertion fits that shape. The cause is the outside
claim, not a throwing tx2.

An earlier revision of this document claimed no background loop leaks. That
claim was wrong, and the search behind it was too narrow. It grepped
`src/engine/` and `test/` for `setInterval`. The loops live behind
`pollForever` (`src/engine/poll.ts`), which reschedules with `setTimeout`, and
the caller that starts them sits in `src/http/`.

### Still true: no concurrent execution inside the run

The `--concurrent` flag is opt-in, not a default, per `bun test --help`. The
repo carries no `bunfig.toml`. It carries no `test.concurrent`,
`it.concurrent` or `describe.concurrent` anywhere.

In a captured full run each test file's output block is contiguous. No file
header repeats. Files therefore ran in sequence.

### What rests on measurement rather than on a test

The URL derivation has five tests (`test/preload-db.test.ts`). Two of the
delta's scenarios do not, and cannot easily. Both describe the environment a
run sits in, not a value a function returns.

"The test database is created on demand" was observed once. The first run
after the preload landed created `workflow_engine_test`, and the DB-backed
suites passed against it.

"A test run does not touch the development database" was counted. After the
seed and twenty full runs, the development database still held 43 definitions
and 5 auth users. Before the split, its `beforeEach` truncates would have
emptied both.

Neither is guarded. A later change that breaks them fails no test. Treat the
row counts above as the check to repeat by hand if the preload is touched.

## Risks / Trade-offs

[The diagnosis finds an engine defect, not a test defect] → The fix then
changes engine behavior. It needs its own capability delta. That delta lands
in the proposal's Capabilities section first. It lands before any engine code
changes, per the repo's own change workflow.

[The defect resists capture and stays unreproducible] → Then this change
lands the recorded evidence. It stops there rather than guessing. That outcome
is worth having. The previous try left no assertion text at all, which is why
the defect survived a second encounter.

## Migration Plan

None. No stored data changes and no published behavior changes. If the
diagnosis finds an engine defect, that case gets its own delta first.
