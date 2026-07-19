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

Schema + validation only. No engine or editor yet.

| Piece | State |
|-------|-------|
| `src/schema/definition.ts` | Full definition + runtime model as Zod; structural invariants as refinements / `superRefine`. |
| `src/cel/check.ts` | Authoring-time CEL parse/type-check against the field catalog (`@marcbachmann/cel-js`). |
| `src/schema/compile.ts` | Publish-time pass: injects the cancel-sink (+ reserved outcome for a contracted process) before hashing, deterministic and idempotent. |
| `examples/expense-approval.json` | Complete Capture → Review → Book example. |
| `test/` | `bun:test` suites; each invariant ships a test that rejects a violating definition. |

Roadmap: validation (done) → CEL wiring (authoring-time done) → engine skeleton
(instance store, transactional outbox, transition executor, timers, crash
recovery; PostgreSQL via `Bun.sql`) → editor.

## Develop

Bun is the runtime, package manager, and test runner. Everything runs inside the
dev container (`.devcontainer/`), never on the host.

```bash
bun install
bun test              # vitest-style suites
bun run typecheck     # tsc --noEmit (Bun does not typecheck)
```

Changes go through OpenSpec (`openspec/`) — propose → specs/tasks → implement →
verify → archive. See `CLAUDE.md` for the full contract rules and invariants.
