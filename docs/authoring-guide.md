# Process authoring guide

This guide is for the person who builds a process. It explains the vocabulary
SummitBPS uses, and the order in which to assemble a process from it.

Every example comes from `examples/expense-approval.json`, a process that
lives in this repository and that the test suite covers.

## Orientation

SummitBPS runs business processes that involve forms and approvals. A process
is a finite state machine. Steps are the states, and Paths are the transitions
between them. This is not a BPMN token flow, and there is no token.

Exactly one Step is active per running process. That single rule explains most
of what follows.

The browser application has four areas. You build processes in one of them and
watch the result in the other three.

| Area | Role you need | Who works here | What happens here |
|---|---|---|---|
| Tasks | none, a login is enough | participant | complete tasks, start a process |
| Studio | `system:developer` | **author** | build, test and publish processes |
| Operations | `system:admin` | operator | instances, outbox, timers, users, migrations |
| Reports | `system:reports` | process owner | cycle time, bottlenecks, SLA |

After you log in, SummitBPS sends you to the first role-gated area you may
enter. An actor with no reserved role lands in Tasks.

The three areas outside Studio matter to you, because your published process
shows up in all of them. A Step that needs a person becomes a task in Tasks. A
running process becomes a row in Operations. An operator reads its history
there, along with its pending timers and its queued actions. Its duration
becomes a number in Reports.

## Vocabulary

## Building a process

## After publish

## What this guide is not

This guide teaches one thing: how to think about a process, and how to build
one. Three other documents cover the rest.

- `docs/current-state.md` describes each subsystem of the engine.
- `docs/openapi.yaml` documents the HTTP API.
- `src/schema/definition.ts` is the contract itself, as Zod schemas.
