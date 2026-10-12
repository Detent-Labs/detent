# Tasks

## 1. Rename the static factory

- [x] 1.1 Rename the `registry.ts` export to `createStaticAssignmentRegistry` and rewrite its comment. Verify with `bun run typecheck` that every importer now fails or follows.
- [x] 1.2 Edit every importer to the new name: the engine default parameters, `src/engine/host.ts`, `src/runtime/instances.ts` and the tests that mean the static set. Verify with `bun run typecheck`.
- [x] 1.3 In `assignment-strategies.ts`, import `createStaticAssignmentRegistry` without an alias. Delete the comment that calls the shared name deliberate. Verify with `git grep -n "createDefaultAssignmentRegistry" -- src`.
- [x] 1.4 Edit the two comments in `packages/web` that name the old factory for `static`. Verify with `git grep -n "createDefaultAssignmentRegistry" -- packages`.

## 2. The context carries the registry

- [x] 2.1 Add the required field `assignmentRegistry` to `HandlerContext`, with a comment that it is the engine's registry and has no fallback. Verify with `bun run typecheck`.
- [x] 2.2 Add the registry as a fourth parameter of `DeliverFn` and `deliver`, and copy it into the context. Add it as a sixth parameter of `drainOutbox` with a static default. Verify with `bun run typecheck`.
- [x] 2.3 Pass the engine's registry from `startEngine` to `drainOutbox`. Verify that the outbox call in `host.ts` names it.
- [x] 2.4 Read the registry from `ctx` in `process-start.ts` and `instance-transition.ts`. Delete their own construction and the import. Verify with `git grep -n "AssignmentRegistry()" -- src/handlers`.
- [x] 2.5 Fix each hand-built `HandlerContext` and each direct `deliver(` call in `test/` that the compiler reports. Pass `createStaticAssignmentRegistry()`. Verify with `bun run typecheck`.

## 3. Tests for the fault

- [x] 3.1 Add a `test/process-chaining.test.ts` case. A `process.start` action targets a process whose start step uses `org.group-members`. Drain with the full registry from `assignment-strategies.ts`. Verify that the started instance holds the two members as candidates and records no `assignment.unresolved` event.
- [x] 3.2 Add an `org.actor-from-field` case beside it. The `inputMapping` writes the person. Verify that the candidates hold that person.
- [x] 3.3 Add a `test/instance-transition.test.ts` case. The action moves a target onto an `org.group-members` step. Verify that the target holds the group's members as candidates.
- [x] 3.4 Add a case where the moved target takes an automatic hop onto an `org.manager-of-starter` step. Verify that the manager is the candidate.
- [x] 3.5 Add a negative control to 3.1 and 3.3. Drain with the static registry. Verify empty candidates and a no-candidates event.
- [x] 3.6 Add a test that `startEngine` hands its registry to the handler context. Verify identity with a sentinel registry.

## 4. Documentation and index

- [x] 4.1 Run `git grep -n "createDefaultAssignmentRegistry\|HandlerContext" -- docs .claude README.md`. Edit each hit that names the wrong factory or lacks the new field. Verify that the grep shows only correct uses.
- [x] 4.2 Delete the `fix-handler-assignment-registry` entry from the audit index in `docs/decisions.md`. Verify with `git grep -n "fix-handler-assignment-registry" -- docs/decisions.md`.

## 5. Verification

- [ ] 5.1 Run `bun run typecheck`, then `bun run build`, inside the devcontainer. Record the printed result in the run report.
- [ ] 5.2 Run `sh scripts/test-gated.sh bun test` in the container with `OPENSPEC_TELEMETRY=0`. The container sets `DATABASE_URL`. Record the pass, fail and skip counts.
- [ ] 5.3 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host. Record the printed result.
- [ ] 5.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host. Record the printed result.
