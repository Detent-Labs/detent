## 1. Engine read

- [x] 1.1 Add a paginated audit-entry read to `src/engine/admin-queries.ts`
      beside `verifyInstanceChain`, returning `seq`, `transitionSeq`,
      `fieldId`, `op`, `value` (omitted when the row's `value` is
      `NULL`), `actor`, `source`, `reason`, `at` in ascending `seq`
      order, keyset-paginated on `seq` via the existing
      `decodeCursor`/`encodeCursor` from `../pagination.js` (matching
      `listOutbox`'s and `listPendingTimers`' own paging style in the
      same file). Verify with a new unit test seeding an instance with
      several field changes and a redaction, asserting order, cursor
      paging, and that a redacted entry's value is absent while a
      `set` entry's JSON-null value still reads as `null`.

## 2. HTTP routes

- [x] 2.1 Add `handleAdminListInstanceAudit` and
      `handleAdminVerifyInstanceAudit` to `src/http/admin-routes.ts`,
      each calling the task 1.1 read or `verifyInstanceChain`
      respectively, gated by `ADMIN_ROLE` the same way
      `handleAdminRedactInstance` is. Verify by reading the two new
      handlers alongside `handleAdminRedactInstance` and confirming the
      same role-check and error-mapping shape.
- [x] 2.2 Wire `GET /admin/instances/:instanceId/audit` and `GET
      /admin/instances/:instanceId/audit/verify` into
      `src/http/server.ts`'s route table beside the existing `POST
      /admin/instances/:instanceId/redact` entry. Verify with an HTTP
      integration test per route: 200 with entries/verification result
      for an admin actor, 403 for a non-admin actor, and a cursor-paging
      case for the entries route.

## 3. Web UI

- [x] 3.1 Add the two audit calls to
      `packages/web/src/areas/admin/api/client.ts` (and their response
      types to `types.ts`), following the existing
      `redactInstance`-style call shape.
- [x] 3.2 Invoke `/frontend-design:frontend-design` for the Audit Log
      section's layout before implementing. Then add the section to
      `packages/web/src/areas/admin/screens/InstanceScreen.tsx`: a
      second `usePagedList<AuditEntry>` list (the same hook `recordList`
      already uses, with its own "load more" button) rendering field
      id, op, value or a redaction marker, reason (when carried), actor,
      source and timestamp; plus a verified/failed indicator fetched once
      per screen load from the verify route. Add the needed i18n keys to
      `packages/web/src/areas/admin/catalog.ts` (EN and DE). Verify by running the
      app in a browser (per `docs/browser-checks.md`'s UI-change
      convention): open an instance with audit history, confirm the
      section renders, confirm "load more" pages correctly, confirm the
      verified indicator shows, and confirm a redacted field shows the
      redaction marker rather than a blank value.

## 4. Verification

- [x] 4.1 Run `bun run typecheck` and confirm it exits clean.
- [x] 4.2 Run `bun run build` and confirm it exits clean.
- [x] 4.3 Run the full `bun test` suite with `DATABASE_URL` set (not a
      single-file rerun) and confirm every test passes with no silent
      skips, per `scripts/gates/silent-green.sh`.
- [x] 4.4 Run the antislop prose gate over every Markdown file this
      change touches: `sh scripts/gates/range.sh < /dev/null | sh
      scripts/gates/prose.sh`, and confirm no new findings.
- [x] 4.5 Run `sh scripts/gates/whitespace.sh < /dev/null` and confirm
      it reports no trailing whitespace, blank-at-EOF, or CRLF in the
      changed files.
- [x] 4.6 Confirm task 3.2's browser check ran, and note what it
      observed.
- [x] 4.7 Update `docs/decisions.md`'s "Decided, not yet built > Instance
      audit log" entry: replace the "Open, deliberately" passage naming
      the unbuilt admin view with a record that `instance-audit-log-view`
      closed it, matching the pattern `6618b08` set for the chain and
      redactable-flag pieces. Update `docs/current-state.md`'s Instance
      audit log section, whose "It has no caller in this change" sentence
      goes stale once these routes exist — name the new routes as callers
      instead.
