## 1. Remove data-source registration from the CEL environment

- [x] 1.1 In `src/cel/check.ts::buildEnv`, delete the data-source registration line
      (`if (opts.dataSources) for (const ds of body.dataSources ?? []) env.registerVariable(ds.key, "dyn");`).
- [x] 1.2 Collapse the now-dead `dataSources` scope dimension: drop the `dataSources`
      field from `buildEnv`'s opts, from the `Site` interface, from the `push`
      helper and `collect` in `check.ts`, and remove the deadline site's explicit
      `dataSources = false` argument.
- [x] 1.3 Reduce the `envFor` cache key in `validateProcessBody` from three dimensions
      (`result:child:dataSources`) to two (`result:child`).
- [x] 1.4 Update the module/`buildEnv` comments so the scope model reads as it now
      behaves: data sources are visible at no CEL site (the deadline is no longer a
      data-source exception; its distinguishing withholding is `child` + the
      string-type expectation).
- [x] 1.5 Confirm `validateMigrationSpec` is unaffected (it already builds its env with
      `dataSources: false`); adjust only if the opts shape change requires it.

## 2. Tests

- [x] 2.1 In `test/cel.test.ts`, flip "a data source stays visible to a guard on the
      same step" to assert a rejection: the guard `users.ok == true` now yields one
      issue whose message contains `unknown variable: users`.
- [x] 2.2 Confirm the existing "rejects a deadline referencing a data source" test
      still passes unchanged (same message, now the general rule).
- [x] 2.3 Run the full suite with `DATABASE_URL` set (`bun test`); read the verdict
      off named results, and confirm no unrelated DB suites regressed and the skip
      count is unchanged.
- [x] 2.4 Run `bun run typecheck` (`tsc --noEmit`) clean.

## 3. Documentation

- [x] 3.1 In `CLAUDE.md`, remove the "Data sources are checked but never resolved"
      bullet from "Decided, not yet built".
- [x] 3.2 In `CLAUDE.md`, record the publish-error boundary as a fact where the CEL
      check is described (a CEL reference to a data source is a publish error; the
      `field.dataSource` options-binding and data-source resolution remain the
      separate unbuilt feature). Update the "Extensibility" note if it implies CEL can
      read a data source.
- [x] 3.3 Update `NEXT_STEPS.md`: check off item #1.
