## 1. Confirm the audit result

- [x] 1.1 Run `SELECT process_id, version FROM definitions WHERE
      jsonb_path_exists(body, '$.workflow.steps[*].view.renderer')`
      against the devcontainer's `definitions` table and record the
      result (expected: zero rows) in this task's checkbox comment.
      Result: zero rows.

## 2. Delete the field

- [x] 2.1 In `src/schema/definition.ts`, delete
      `renderer: plugin.optional(),` from the `view` object schema.
- [x] 2.2 In `src/schema/compile.ts`, delete
      `collectPluginTypeSites`'s `if (s.view?.renderer)
      pushType(s.view.renderer, \`${sloc}.view.renderer\`);` line.
- [x] 2.3 Update `collectPluginTypeSites`'s doc comment to drop the
      `view.renderer.type` mention from its listed positions.

## 3. Tests

- [x] 3.1 Add a test asserting an authored body that sets
      `steps[0].view.renderer` fails to publish with an unknown-key
      issue at `steps[0].view.renderer`.
- [x] 3.2 Confirm the repo's own example (`example.definition`) still
      compiles clean, since it never set the field.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`.
- [x] 4.2 Run `bun run build`.
- [x] 4.3 Run the full `bun test` suite with `DATABASE_URL` set (not a
      single-file rerun) and confirm no new skips or failures.
