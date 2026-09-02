## 1. The narrowed data read

- [x] 1.1 Add the optional `visibleTo` field to `InstanceQueryFilter` in `src/runtime/api.ts`, the shape `InstanceListFilter` already carries. Rewrite the type's docstring, which says the type holds the spec's ten members and nothing else
- [x] 1.2 In `queryInstances`, join against `buildVisibleRowSet` when the filter carries it. Keep today's plain `WHERE` when it does not. Widen `buildVisibleRowSet`'s first argument to the type `buildInstanceWhere` already takes, so `listInstances` and `test/instance-visibility.test.ts` keep compiling
- [x] 1.3 Confirm the bound and the truncation flag apply after the join, the way `listInstances` orders them
- [x] 1.4 Remove `visibleTo` from `QUERY_FILTER_DENYLIST` in `src/runtime/api.ts` and reword its docstring. A caller states `visibleTo` outright, the way it states `claimedBy`. `scope`, `assignedTo`, `assignedToRoles` and `includeDegraded` stay rejected

## 2. The report

- [x] 2.1 `runReportQuery` takes the actor and sets `visibleTo` from `actorPrincipals`, unless the actor holds `ADMIN_ROLE`
- [x] 2.2 `executeReport` and `previewReportDraft` pass the actor through
- [x] 2.3 Rewrite the doc comment on `executeReport`. It names three gates now, and says why the operator skips the third

## 3. Tests

- [x] 3.1 A viewer with a process read grant sees only the rows they may see. Another matching instance is absent
- [x] 3.2 A revoked viewer loses one row and keeps the rest
- [x] 3.3 A revoked viewer holding the current claim keeps that row
- [x] 3.4 An `ADMIN_ROLE` caller gets every row
- [x] 3.5 The CSV export holds exactly the rows the table holds
- [x] 3.6 The preview narrows the same way a saved execution does
- [x] 3.7 The `instance.query` data source keeps today's rows. It offers an option for an instance the reading actor could not see
- [x] 3.8 Truncation over the narrowed set: 51 visible rows among 60 matching reports `truncated`, and 50 visible among 60 does not
- [x] 3.9 `queryInstances` with `visibleTo` narrows and bounds after the join. The same call without it returns every match

## 4. Documentation

- [x] 4.1 `docs/decisions.md`: the per-instance visibility entry names the report as the third consumer, replacing the line that leaves `executeReport` alone. It states that `scope=all&processId` stays wider for a grant holder
- [x] 4.2 `docs/current-state.md`: the report execution passage states the per-row rule
- [x] 4.3 `ROADMAP.md`: stage 59 row, `report-row-visibility`
- [x] 4.4 `tmp/offene-items.md` (untracked, the owner's tracker): item 30 moves through the status column

## 5. Verification

- [x] 5.1 `bun run typecheck`, `bun run build`, full `bun test` with `DATABASE_URL`, piped through `scripts/gates/silent-green.sh`
- [x] 5.2 Prose and whitespace gates over the pushed range
