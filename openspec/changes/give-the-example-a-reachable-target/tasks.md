## 1. The sink

- [ ] 1.1 Add `scripts/dev-webhook-sink.ts`. One `Bun.serve` on port 8080. It
      answers `200` to every method and every path. It parses a JSON request
      body and echoes it back as `application/json`. A body that is not JSON
      gets `{}` back, so a malformed request does not crash the listener.
- [ ] 1.2 Log the method and the path on every request, so
      `docker compose logs webhook-sink` shows what arrived. Log the
      `Idempotency-Key` header too. The engine sets it on every delivery, and
      seeing it is how a contributor confirms the retry contract by hand.
- [ ] 1.3 Answer `GET /healthz` with `200` as well, so the compose healthcheck
      has a path to call. No special case is needed beyond the catch-all, but
      the script names the path in a comment so the healthcheck and the script
      do not drift.
- [ ] 1.4 Add the `webhook-sink` service to `.devcontainer/docker-compose.yml`.
      It repeats the `app` service's `build` block and its `/workspace` volume
      mount. Its `command` runs the script. It declares a healthcheck. It
      declares no `ports` entry, matching `db` and `mailpit`.
- [ ] 1.5 Add `webhook-sink` to the `app` service's `depends_on`, beside `db`
      and `mailpit`.
- [ ] 1.6 Set `HTTP_ACTION_ALLOWED_HOSTS: webhook-sink:8080`. Drop
      `example.com`. Rewrite the comment above it: it currently names
      `example.com` and the escalation step.
- [ ] 1.7 Rewrite the `HTTP_ACTION_ALLOW_INSECURE` comment. It says "a locally
      started target", which was a target a contributor starts by hand. The
      sink is now the shipped reason.

## 2. The example

Every task in this group edits `examples/expense-approval.json`. Keep every id,
key, step, path, timer, field and view exactly as it stands. Only the three
action bodies change.

- [ ] 2.1 `review`'s reminder timer, action
      `action_eeee5555-0001-4a1c-8e2f-000000000001`: change `type` from
      `notify.email` to `notification.email`. Replace the `{ template, toRole }`
      config with the `{ to, subject, body }` that
      `notificationEmailConfigSchema` takes. Address it to a
      `finance-approver@example.com` literal, matching the escalation step's
      own `notification.email` config.
- [ ] 2.2 `book`'s `onEntry` action
      `action_eeee5555-0002-4a1c-8e2f-000000000002`: change `type` from
      `accounting.postInvoice` to `http.request`. Config becomes
      `{ url: "http://webhook-sink:8080/hooks/expense-booked", method: "POST",
      body: { status: "booked" } }`. Drop the `amountField` key, which
      `httpConfigSchema` does not declare.
- [ ] 2.3 Change that action's `output` expression from `result.status` to
      `result.body.status`. Without this the outbox writes the HTTP status
      number into a `select` field, the type check drops it, and the instance
      parks at `book`. The `timeout` of `PT30S` and the retry block stay.
- [ ] 2.4 `escalated_review`'s action
      `action_eeee5555-0003-4a1c-8e2f-000000000003`: change the `url` from
      `https://example.com/hooks/expense-escalated` to
      `http://webhook-sink:8080/hooks/expense-escalated`. Nothing else on that
      action changes.
- [ ] 2.5 Rewrite `book`'s `description`. It says the paths branch on the result
      of the booking action, which stays true, but the reader now needs to know
      the sink echoes what the action sent.
- [ ] 2.6 Recompute the wrapper's own `definitionHash` field from the edited
      body and write it in. The current value,
      `2eec7e1e62950988fc3fd972f50899de04df0cfc4b9ed20e894790396c1ee788`, has
      been stale since before this change. Nothing hashes the wrapper, so this
      edit cannot move the body hash.

## 3. Scripts

- [ ] 3.1 `scripts/seed.ts`: delete the two `register` calls for `notify.email`
      and `accounting.postInvoice`, and the comment above them that cites
      roadmap #5e. `createDefaultRegistry()` now resolves every type the
      example names.
- [ ] 3.2 `scripts/demo-expense-approval.ts`: the same two deletions and the
      same comment. The script builds a bare `createRegistry()` today. Switch
      it to `createDefaultRegistry()` from `src/engine/host.ts`, so the demo
      drives the handlers a deployment runs.
- [ ] 3.3 Confirm the demo script still reaches a terminal step. It drains the
      outbox in-process, so `book`'s `http.request` now makes a real call to
      `webhook-sink:8080` from inside the app container.

## 4. Tests

- [ ] 4.1 `test/view-layout-hash.test.ts`: recompute the
      `expense-approval.json` literal against the edited body and replace
      `b90f7044c52a60a54093c7c92951ea0576ba611403b19420a0042cfeb2f20dd2`.
      Take the new value in the same run that shows the two subprocess
      literals still passing, and record that in the commit message.
- [ ] 4.2 Rewrite that file's header comment. State that the two subprocess
      literals still carry their pre-change provenance and the
      `expense-approval.json` one does not. State what the recomputation
      rests on. Delete the paragraph calling the wrapper's `definitionHash`
      stale, which task 2.6 repairs.
- [ ] 4.3 `test/http.test.ts`, the case at line 1242: its `http.request` stub
      answers `{}`. `book`'s new `Action.output` reads `result.body.status`
      from that, and an entry that cannot read `result` raises. Change the stub
      to answer `{ body: { status: "booked" } }`. Delete the now-unused
      `accounting.postInvoice` and `notify.email` registrations.
- [ ] 4.4 `test/runtime-api.test.ts`, the case at line 1045: the same stub
      change, and the same two deletions. This case expects the instance to
      park at `book`, because its `accounting.postInvoice` stub answered
      `pending`. Keep that behavior by answering
      `{ body: { status: "pending" } }`.
- [ ] 4.5 `test/runtime-api.test.ts`, the escalation case at line 1111: the
      same treatment. Its assertion reads the outbox row for the escalation
      action and expects `pending`, which no stub change affects.
- [ ] 4.6 Run the whole suite. Read the named failures. These files parse
      the example and may assert on its shape: `test/validate.test.ts`,
      `test/compile-validation.test.ts`, `test/cel.test.ts`,
      `test/strip-compiled.test.ts`, `test/cancel.test.ts`,
      `test/reporting.test.ts`, and
      `packages/web/test/studio-promotionRoundTrip.test.ts`. Fix what the
      change actually broke. Change no assertion that was testing something
      else.
- [ ] 4.7 Leave `packages/web/test/studio-publishErrors.test.ts` and
      `test/events.test.ts` alone. Both name `notify.email` and
      `accounting.postInvoice` in hand-built fixtures, not from the example
      file. The same holds for
      `packages/web/src/areas/studio/registry/exampleRegistry.ts`, whose
      `notify.email` entry is the studio's own toggle.
- [ ] 4.8 Add a case that keeps the two claims honest. Every action `type` in
      every file under `examples/` resolves in `createDefaultRegistry()`. This
      is the mechanical form of the new spec requirement, and it is what stops
      the next example from re-introducing an unregistered type.

## 5. Docs

- [ ] 5.1 `docs/authoring-guide.md`, the actions section: it says the example
      posts to accounting with `accounting.postInvoice` on entry to `book`.
      Name the three actions the example now carries. Add the sentence that
      the devcontainer's sink echoes what it receives, so the demo's booking
      always succeeds and a real accounting system decides instead.
- [ ] 5.2 `docs/authoring-guide.md`, the `http.request` section: it tells an
      author to ask an operator for a host. Name the devcontainer's own entry
      so a reader can try the example.
- [ ] 5.3 `docs/current-state.md`: the entry recording
      `HTTP_ACTION_ALLOWED_HOSTS=example.com`, and the entry for the
      devcontainer's services. Add the sink beside `mailpit`.
- [ ] 5.4 `README.md`: the `examples/expense-approval.json` table row, and the
      devcontainer section if it lists services.
- [ ] 5.5 Check `ROADMAP.md` for a stage line this change makes stale. Line 112
      mentions the demo script against this example.

## 6. Verification

- [ ] 6.1 `bun run typecheck` inside the devcontainer. Report what it printed.
- [ ] 6.2 The full `bun test` with `DATABASE_URL` set, inside the devcontainer.
      Report the pass count and the skip count. A single-file rerun is not the
      signal.
- [ ] 6.3 `docker compose up -d`, then drop the `pgdata` volume and run
      `SEED_ALLOW=1 bun run seed`. It publishes all three examples against
      `createDefaultRegistry()` with no placeholder handler.
- [ ] 6.4 `bun run scripts/demo-expense-approval.ts`. It reaches a terminal
      step, and `docker compose logs webhook-sink` shows the booking request.
- [ ] 6.5 The browser check. Start `bun run serve`, log in as the seeded
      participant, and walk one instance from capture to `booked`. Then confirm
      the admin area's dead-letter view is empty.
- [ ] 6.6 The browser check for the escalation branch. Take an instance to
      `review`, fire the escalation timer, and confirm the `escalated_review`
      step's two actions both succeed. The mailpit interface shows the mail.
      The sink log shows the webhook.
- [ ] 6.7 The antislop linter on every Markdown file this change touched.
- [ ] 6.8 `git diff --check`, and `git ls-files --eol` for the `w/` column on
      the changed files.
