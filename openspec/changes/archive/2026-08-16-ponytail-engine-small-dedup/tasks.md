## 1. Share the draft and template envelope helpers

- [x] 1.1 Add `export` to `parseJsonb` in `src/engine/drafts.ts`.
- [x] 1.2 Split `checkEnvelope` in `drafts.ts` into a shared half and the rest.
- [x] 1.3 Name the shared half `checkJsonEnvelope(kind, body, layout)` and export it.
- [x] 1.4 Give it the two `isJsonObject` guards and the size bound, nothing else.
- [x] 1.5 Keep the `revision` and `baseVersion` checks in `drafts.ts`, after that call.
- [x] 1.6 Confirm every draft message still reads as it reads today.
- [x] 1.7 Widen the `./drafts.js` import in `templates.ts` to take both symbols.
- [x] 1.8 Replace the shared half of the template `checkEnvelope` with the call.
- [x] 1.9 Delete `parseJsonb` and `isJsonObject` from `src/engine/templates.ts`.
- [x] 1.10 Confirm every template message still reads as it reads today.
- [x] 1.11 Re-grep `src/engine/templates.ts` before editing it. The open
      change `ponytail-cut-unreachable-code` drops the `export` keyword from
      `checkTemplateKey` at :97 in this same file. The two edits sit in
      different regions (:97 against :68-118), so whichever lands second
      needs a fresh read, not a merge decision.

## 2. Inline the site collectors in registry-check

- [x] 2.1 Inline `collectAssignments` into `checkAssignmentRegistry`.
- [x] 2.2 Inline `collectDataSources` into `checkDataSourceRegistry`.
- [x] 2.3 Delete the `AssignmentSite` and `DataSourceSite` interfaces.
- [x] 2.4 Leave both doc comments on the two exported checks in place.

## 3. Record the result in the audit

- [x] 3.1 Mark findings 9 and 21 as resolved in `PONYTAIL-AUDIT.md`.
- [x] 3.2 Move the disqualified half of finding 9 to "Checked, not flagged".
- [x] 3.3 Attach the measurement: `host.ts:115`, six call sites, one test import.
- [x] 3.4 Record that `toTemplate` and `toDraft` map different columns.
- [x] 3.5 Keep the open question filed: the `parseJsonb` string guard.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`. Report what it printed.
- [x] 4.2 Run `bun run build`. Report what it printed.
- [x] 4.3 Run the full `bun test` with `DATABASE_URL` set, never one file.
- [x] 4.4 Report the pass count and the skip count from that run.
- [x] 4.5 Run `git diff --check` over the touched files.
- [x] 4.6 Read the `w/` column of `git ls-files --eol` for CR bytes.
- [x] 4.7 Run the antislop linter on every Markdown file this change touched.
