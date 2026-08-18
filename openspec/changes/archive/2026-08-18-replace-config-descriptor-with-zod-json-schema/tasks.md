## 1. Rewrite `config-descriptor.ts` on `z.toJSONSchema`

- [x] 1.1 Replace `nodeType`, `checkDefs`, and `stringFormat` with a single
      per-invocation `z.toJSONSchema(schema)` call, read once and passed to
      the leaf classifiers below. Delete all four `_zod.def` reaches and
      their `no-explicit-any` escapes. Wrap the `z.toJSONSchema(schema)` call
      in a `try`/`catch`: `z.toJSONSchema` throws on some Zod constructs
      (`z.date()`, `z.bigint()`, `.transform()`, `z.void()`, `z.symbol()`,
      `z.nan()`, `z.map()`, verified against zod 4.4.3), and
      `describeConfigSchema` runs in a loop over every registered type, so an
      uncaught throw from one type would crash the whole `GET /registry`
      response. On a caught throw, log through the same `log.debug` call the
      other bail paths use and return `undefined`, per design.md's
      "`z.toJSONSchema` can throw, so `describeConfigSchema` catches it"
      section.
- [x] 1.2 Rewrite `describeString` to classify from
      `jsonSchema.properties[key]`: `type === "string"`, `format` (bail
      unless `"email"` or absent), `minLength`/`maxLength`, per the mapping
      table in design.md. Bail (drop the whole type) when the node carries a
      `pattern` keyword, unless the same node's `format` is `"email"` —
      `.regex()`, `.startsWith()`, and `.endsWith()` all produce a bare
      `pattern` keyword with no `format` key, which none of the other reads
      in this function would otherwise catch.
- [x] 1.3 Rewrite `describeNumber` to classify from the same node:
      `type === "number"`, `minimum`/`maximum` (bail if
      `exclusiveMinimum`/`exclusiveMaximum` is present instead). Bail (drop
      the whole type) when the node carries a `multipleOf` keyword —
      `.multipleOf()` produces a `multipleOf` keyword with no accompanying
      `exclusiveMinimum`/`exclusiveMaximum`, which the bound checks above
      would not otherwise catch.
- [x] 1.4 Rewrite `describeStringArray` to classify `type === "array"`,
      `items.enum` (string-array + `enumValues`) or `items.type ===
      "string"` (plain string-array), `minItems`/`maxItems`. Bail for any
      other `items` shape. For a plain string-array, also read
      `items.format` the same way `describeString` reads a scalar string's
      `format`: propagate `"email"` into `descriptor.format`, and bail
      (dropping the whole type) on any other declared `items.format`. This
      is what keeps `notificationEmailConfigSchema`'s `to` property
      `format: "email"`, per design.md's classification table. Also bail
      when `items` carries a `pattern` keyword, unless `items.format` is
      `"email"` — the same fail-closed check task 1.2 adds to
      `describeString`, applied to the array's element node.
- [x] 1.5 Rewrite `describeLeaf` to dispatch on the JSON Schema node's
      `type`/`enum` instead of Zod `instanceof` checks, keeping the
      `boolean` and scalar `enum` branches. Check for the `enum` keyword
      BEFORE checking `type === "string"`: a scalar `z.enum()` node carries
      both keywords on the same property node (design.md's classification
      table), so a `type`-first check would misclassify it as
      `kind: "string"` and discard `enumValues`.
- [x] 1.6 Rewrite `describeConfigSchema`'s per-property loop: keep
      `schema instanceof z.ZodObject` and `schema.shape` for the top-level
      gate and iteration order. Compute `required` as `jsonSchema.required
      ?.includes(key) && !("default" in propertyNode)`, per design.md's
      required/default section, and carry `propertyNode.default` through
      unchanged when present.
- [x] 1.7 Delete the file-header comment block's Zod v3/v4 internals
      explanation and the refine/`ZodEffects` distinction. Replace it with
      a comment describing the `z.toJSONSchema`-based approach and citing
      this change.

## 2. Extend the test suite

- [x] 2.1 Run the existing `test/config-descriptor.test.ts` (all 14 cases)
      against the rewritten implementation. Every expected value stays
      byte-identical; do not edit the assertions.
- [x] 2.2 Confirm the test suite covers the required/default interaction: a schema
      with a `.optional()` field (no default) beside a `.default()` field,
      asserting the former is `required: false` with no `default` key and
      the latter is `required: false` with its `default` value attached.
      This already exists as "a synthetic schema exercises enum, number,
      boolean, optional and default" — confirm it still passes unchanged
      against the rewritten implementation; add a dedicated case only if
      that test's coverage of this interaction is not already sufficient.
- [x] 2.3 Add a case for refine transparency: a `.refine()`-wrapped object
      whose properties are all in the supported subset, asserting it still
      produces a full descriptor (this already exists as "a refined schema
      whose properties are all supported now produces a descriptor" —
      confirm it still passes unchanged, and extend it if needed to also
      cover a `.superRefine()`-wrapped schema if that case is not already
      present).
- [x] 2.4 Add a case asserting a numeric property with an exclusive minimum
      (or maximum) sends the whole type to raw JSON (`describeConfigSchema`
      returns `undefined`), matching the delta spec's "An exclusive numeric
      bound sends the whole type to raw JSON" scenario. No existing config
      schema the engine registers today declares an exclusive numeric
      bound, so this is net-new coverage, unlike 2.2 and 2.3.
- [x] 2.5 Add a case asserting a string property constrained by `.regex()`
      (or `.startsWith()`/`.endsWith()`) sends the whole type to raw JSON,
      matching the delta spec's "A pattern-constrained string property sends
      the whole type to raw JSON" scenario. Cover both a scalar string
      property and a string-array property, since task 1.2 and task 1.4 add
      the check separately in `describeString` and `describeStringArray`. No
      existing config schema the engine registers today declares a pattern
      constraint, so this is net-new coverage.
- [x] 2.6 Add a case asserting a numeric property constrained by
      `.multipleOf()` sends the whole type to raw JSON, matching the delta
      spec's "A multiple-of-constrained numeric property sends the whole
      type to raw JSON" scenario. No existing config schema the engine
      registers today declares a `multipleOf` constraint, so this is
      net-new coverage.
- [x] 2.7 Add a case asserting `describeConfigSchema` returns `undefined`,
      rather than throwing, for a property whose Zod type makes
      `z.toJSONSchema` itself throw (for example a `z.date()` or
      `z.bigint()` property), matching design.md's "`z.toJSONSchema` can
      throw, so `describeConfigSchema` catches it" section. No existing
      config schema the engine registers today declares such a property, so
      this is net-new coverage.
- [x] 2.8 Add a case asserting a property whose value is an array of
      elements that are neither strings nor a fixed string enum (for
      example `z.array(z.number())`, `z.array(z.boolean())`, or an array of
      nested objects) sends the whole type to raw JSON, matching the delta
      spec's "A non-string array property sends the whole type to raw JSON"
      scenario. This is distinct from `staticDataSourceConfigSchema`'s
      existing case: that schema already asserts `undefined` for other
      reasons, and design.md's classification table's catch-all row is
      where `describeStringArray` bails on `items.type !== "string"` with
      no `items.enum`. No existing config schema the engine registers today
      isolates this construct on its own, so this is net-new coverage.
- [x] 2.9 Add a case asserting a scalar property whose value is itself a
      nested object (`z.object({...})`, not wrapped in an array) sends the
      whole type to raw JSON, matching the delta spec's "A nested object
      property sends the whole type to raw JSON" scenario. This is
      distinct from 2.8's array-of-nested-objects case: `describeConfigSchema`
      bails on this shape at the top-level property loop, before
      `describeStringArray` is ever reached. No existing config schema the
      engine registers today isolates this construct on its own, so this
      is net-new coverage.

## 3. Confirm the studio consumer needs no edit

- [x] 3.1 Re-run the grep sweep from design.md's Context section
      (`describeConfigSchema`, `ConfigFieldDescriptor`, `ConfigFieldKind`)
      against the finished rewrite. Confirm `src/http/studio-routes.ts` and
      `packages/web/src/areas/studio/api/types.ts` need no change.
- [x] 3.2 Capture the "before" response by running the dev server from a
      separate git worktree checked out at this change's base commit (per
      CLAUDE.md's rule against mutating the shared working tree for
      testing), for a request that exercises every schema in
      `test/config-descriptor.test.ts`. Save it to a scratch file. Run the
      same request against the rewritten dev server and diff the two.
      Confirm byte-identical `actionSchemas`/`dataSourceSchemas`/
      `assignmentStrategySchemas`.

## 4. Real-browser verification

- [x] 4.1 In a running studio session, open an action editor and select
      `notification.email`. Confirm the generated form still renders: the
      `toActors` checkbox group, the `to`/`subject`/`body` fields, and
      inline validation on an invalid `to` entry.
- [x] 4.2 Select the built-in `static` assignment strategy on a step.
      Confirm the generated form still renders the `candidates` field and
      the same validation behavior.
- [x] 4.3 Select `http.request` and `process.start` in turn. Confirm both
      still fall back to the raw JSON textarea, with no generated form.
- [x] 4.4 Switch a schema-backed type (from 4.1 or 4.2) from the generated
      form to raw JSON, and back. Confirm the config value round-trips
      unchanged.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it passes with no new
      errors.
- [x] 5.2 Run `bun run build` and confirm it succeeds.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set. Confirm
      no skipped DB-backed suites and no failing tests, reading the named
      test results rather than the pass count alone.
- [x] 5.4 Run the antislop linter (`scripts/gates/prose.sh` or the
      `antislop` skill directly) over every Markdown file this change
      touches, including this change's own `proposal.md`, `design.md`,
      and spec delta.
- [x] 5.5 Run `git diff --check` for trailing whitespace and blank-line-at-
      EOF issues over the changed files.
