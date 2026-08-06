# Tasks

## 1. The checklist that outlives the archive

- [ ] 1.1 Write `docs/browser-checks.md`. Open it with the two operating
      rules: the address is `http://127.0.0.1:3001`, and no `bun test` run may
      overlap a manual run.
- [ ] 1.2 Record why the address is not `localhost`. Under Windows it resolves
      to `::1` and the connection hangs.
      `.devcontainer/docker-compose.override.yml` publishes `3001:3000`, and
      the engine serves the bundle from `WEB_ROOT`.
- [ ] 1.3 Write the entry for the `iframe` refusal. It needs a second origin,
      so serve the framing page from a second port. Source:
      `2026-08-06-deliver-framing-and-sniffing-headers` task 5.3.
- [ ] 1.4 Write the entry for the attachment download. Confirm the browser
      saves the file rather than rendering it. Source:
      `2026-08-06-harden-http-response-boundary` task 7.3.
- [ ] 1.5 Write the entry for the form editor's pointer work: drag and drop,
      the two-column canvas, and a keyboard-only reorder. Name the Panzoom
      `panzoom-exclude` race as the reason this stays live. Source:
      `2026-08-06-view-layout-and-form-editor` task 8.3.
- [ ] 1.6 Write the entry for the studio modal's remaining points: stacking
      above the top layer, focus return, backdrop behavior, and Close
      discarding nothing. Source: `2026-08-06-studio-edit-shared-modal`
      tasks 6.3 and 6.4.
- [ ] 1.7 Point `CLAUDE.md`'s browser bullet at the file.

## 2. Disposition over the route table

- [ ] 2.1 Read the route table and `src/http/server.ts:162-173`. Name every
      route that returns stored bytes.
- [ ] 2.2 Add `test/http-disposition.test.ts`. Drive `createServer`'s handler
      with no port, the way `test/http-static.test.ts` does.
- [ ] 2.3 Assert `Content-Disposition: attachment` with a percent-encoded
      filename on every such route.
- [ ] 2.4 Assert that a JSON envelope carries no such header.
- [ ] 2.5 Confirm the assertion reads the route table rather than a literal
      list, so a new binary route arrives covered.

## 3. A refused host reaches the dead-letter list

- [ ] 3.1 Add a case to `test/outbox.test.ts`. Drive one `http.request`
      action against a host the allowlist refuses.
- [ ] 3.2 Assert the row reaches the dead-letter status, and that
      `listOutbox` returns it under a dead-letter filter.
- [ ] 3.3 Assert the message names the refused host.
- [ ] 3.4 Assert that a permitted host does not dead-letter on that account.

## 4. A body with no layout keys

- [ ] 4.1 Add `packages/form-ui/test/`, with the package's first test file.
- [ ] 4.2 Assert `effectiveSpan(undefined, 1)` answers 1, and
      `effectiveSpan(2, 1)` answers 1.
- [ ] 4.3 Assert `FieldForm` renders one column for a view that declares no
      `columns`.
- [ ] 4.4 Assert a group's members stack in that one-column form.
- [ ] 4.5 Confirm the file needs no DOM and no browser. The functions are
      pure and exported.

## 5. Authored text routes through the localized-text helper

- [ ] 5.1 Name the localized-text helper and the shape a render site uses.
- [ ] 5.2 Add the rule to `packages/web/test/boundaries.test.ts`, beside the
      import rule that already reads the area sources.
- [ ] 5.3 Confirm the rule finds all six sites the studio modal enumerated:
      the process label, a step's label and description, and a field's label,
      description and option label.
- [ ] 5.4 Ship the rule green. Give any exempt site an inline comment saying
      why.

## 6. Router coverage in every area

- [ ] 6.1 Read `packages/web/test/admin-routing.test.ts` for the shape:
      match, round-trip, and a deeper path that falls back.
- [ ] 6.2 Extend `packages/web/test/studio-routing.test.ts` to that shape.
- [ ] 6.3 Extend `packages/web/test/routing.test.ts` to that shape.
- [ ] 6.4 Assert that two routes sharing a leading segment each reach their
      own route.

## 7. Documentation

- [ ] 7.1 Sync `docs/current-state.md`'s verification entry with the split
      and with the checklist's location.
- [ ] 7.2 Confirm no rule in `docs/authoring-guide.md` changes. This change
      touches no contract rule.

## 8. Verification

- [ ] 8.1 Run `bun run typecheck`.
- [ ] 8.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts. Compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 8.3 Run the antislop linter over every Markdown file this change
      touches, and report the count per file.
- [ ] 8.4 Run `git diff --check`. Then read `git ls-files --eol` for a `w/`
      column showing CRLF.
- [ ] 8.5 Walk `docs/browser-checks.md` end to end against
      `http://127.0.0.1:3001`, with no `bun test` run in flight. This one run
      closes the four manual entries the 2026-08-06 archive left open.
- [ ] 8.6 Confirm every assertion this change adds runs with no listening
      socket.
