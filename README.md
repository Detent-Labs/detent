# SummitBPS

A headless, API-first workflow / BPM engine in TypeScript. It executes
structured, form- and approval-driven business processes with explicit states.

The paradigm is a **state-based finite-state machine**: Steps (states) connected
by explicit Paths (transitions). This is *not* BPMN token flow.

## The contract

A serialized JSON process definition is the one artifact three roles share:

- **Engine** — executes definitions.
- **Editor** — produces them graphically (later).
- **Hand-authoring** — definitions written directly as JSON (rare).

`src/schema/definition.ts` is that contract, expressed as Zod schemas with TS
types derived via `z.infer` so validation and types cannot drift. Ids are opaque
(`step_<uuid>`) and are the sole reference anchor; `key`/`label` reference
nothing. Bodies are hashed with JCS (canonical JSON); published versions are
immutable and instances pin `{ processId, version, definitionHash }`.

All conditions are CEL (`{ lang: "cel", src }`) — pure, total, no `now()`.

## Status

Schema, validation, and a working engine. No editor yet.

| Piece | State |
|-------|-------|
| `src/schema/definition.ts` | Full definition + runtime model as Zod; structural invariants as refinements / `superRefine`. |
| `src/cel/check.ts` | Authoring-time CEL parse/type-check against the field catalog (`@marcbachmann/cel-js`). |
| `src/cel/eval.ts` | Runtime CEL: guards (total — a runtime error is `false`) and Action.output writeback. |
| `src/schema/compile.ts` | Publish-time pass: injects the cancel-sink (+ reserved outcome for a contracted process) before hashing, deterministic and idempotent. |
| `src/engine/` | Instance store, transactional outbox (delivery + writeback + retry/dead-letter + reclaim), transition executor (manual/automatic/timer), async wait-state re-resolution, timer arming + scheduler, crash recovery, runtime cancellation, subprocess execution (`subprocess.ts`: spawn + return + downward cancel cascade), definition/version store (`definitions.ts`) + `startEngine` host. PostgreSQL via `Bun.sql`. |
| `examples/expense-approval.json` | Complete Capture → Review → Book example. |
| `examples/subprocess-*.json` | A loan-application parent calling a credit-check subprocess (child) — spawn, `child.outcome` routing, return writeback. |
| `test/` | `bun:test` suites; each invariant ships a test that rejects a violating definition. |

Roadmap: validation (done) → CEL wiring (done) → engine skeleton (mostly done) →
editor. The definition/version store is done — `startEngine` wires its
`resolveBody` into the workers, so re-resolution, timers, and delivery run live.
Runtime cancellation, subprocess execution (spawn/return + downward cancel
propagation), and both timer kinds (`duration` and `deadline`) are done. Remaining
engine work: migration.

## Develop

Bun is the runtime, package manager, and test runner. Everything runs inside the
dev container (`.devcontainer/`), never on the host.

```bash
bun install
bun test              # bun:test suites
bun run typecheck     # tsc --noEmit (Bun does not typecheck)
```

Changes go through OpenSpec (`openspec/`) — propose → specs/tasks → implement →
verify → archive. See `CLAUDE.md` for the full contract rules and invariants.
