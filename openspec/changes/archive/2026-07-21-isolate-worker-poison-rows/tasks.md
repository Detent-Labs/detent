## 1. resolution.ts

- [x] 1.1 In `drainResolutions`, move `parseInstance(row.body)` and `await resolveBody(...)` inside the
  per-instance try; on any throw, `requeue(row.instance_id)` and continue (the catch already does this).

## 2. timers.ts

- [x] 2.1 In `drainTimers`, widen the per-row try to cover `parseInstance`, `resolveBody`, and due-timer
  selection; on any throw, skip the row and continue (leave `next_timer_at` due). Keep the `!body` /
  `!dueTimer` early-outs inside the try.

## 3. outbox.ts

- [x] 3.1 In `drainOutbox`, wrap the per-row body (`parseAction` + the tx2 `db.begin(...)` mark) in a
  try/catch; on an unexpected throw, leave the row `claimed` (do not mark it) and continue to sibling rows.

## 4. Specs

- [x] 4.1 Sync the three ADDED requirements into `openspec/specs/{writeback-reresolution,timers,transactional-outbox}/spec.md`.

## 5. Tests

- [x] 5.1 resolution: seed one instance flagged `pending` with an unparseable body among good `pending`
  instances; assert `drainResolutions` processes the good ones and leaves the poison `pending`.
- [x] 5.2 timers: seed one running instance with an unparseable body and an early `next_timer_at` ahead of
  instances with due timers; assert those due timers fire in the same pass.
- [x] 5.3 outbox: inject a `deliverFn` that returns a tx2-breaking patch (malformed fieldId path) for one
  claimed row and `{}` for a good row; assert the good row is `delivered` and the poison row stays `claimed`.

## 6. Verify

- [x] 6.1 `bun run typecheck` passes.
- [x] 6.2 `bun test` with `DATABASE_URL` set passes (migration/outbox/timers/resolution suites run, not skip).
