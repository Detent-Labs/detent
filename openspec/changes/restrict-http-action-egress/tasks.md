## 1. The egress policy

- [x] 1.1 Add an exported policy helper to `src/handlers/http.ts` that reads
      `HTTP_ACTION_ALLOWED_HOSTS` and `HTTP_ACTION_ALLOW_INSECURE`, and
      answers whether a URL passes. Read the environment per call, so a test
      can set it per case. Strip the space around each list entry and compare
      it without regard to case. Export it so the next outbound caller
      imports the rule (see design.md's Risks) and so a test reaches the
      `https:` branch without a TLS mock.
- [x] 1.2 Call the helper in `httpHandler` before the `fetch`. Throw
      `PermanentError` with the failing host or scheme in the message.
- [x] 1.3 Add `redirect: "manual"` to the `fetch` call. Leave the status
      branch as it stands, since it already treats a 3xx as permanent.
- [x] 1.4 Rewrite the comment above that branch. It says a 3xx is unreachable
      because `fetch()` follows redirects by default, which stops being true.

## 2. Tests

- [x] 2.1 A target outside the list raises `PermanentError` whose message
      names the host, and the mock target records no request.
- [x] 2.2 An unset `HTTP_ACTION_ALLOWED_HOSTS` refuses every target. The
      devcontainer sets that variable (task 3.1), so the case deletes it and
      restores it afterwards rather than assuming it is absent. Restore in a
      `finally`. Bun runs a file's cases in one process, in order, so a
      failing assertion would otherwise leak the deleted variable into every
      later case.
- [x] 2.3 A plain-http target refuses without `HTTP_ACTION_ALLOW_INSECURE`,
      with the scheme in the message, and succeeds with it.
- [x] 2.4 A mock target that answers `302` fails permanently, and the
      redirect target records no request.
- [x] 2.5 Set both variables for every existing case in
      `test/handlers-http.test.ts`, from the port each mock server reports.
      The `withServer` helper covers most of them. Two cases start their own
      `Bun.serve` beside it — the connection-failure case and the
      body-read-hang case — and need the same treatment.
- [x] 2.6 The helper accepts an `https:` URL whose host is in the list, with
      `HTTP_ACTION_ALLOW_INSECURE` unset. Every other case runs over
      `http://localhost:<port>` with the hatch on, so without this one an
      inverted scheme test passes the whole suite while permitting
      everything.
- [x] 2.7 The helper accepts an entry the operator typed with a leading space
      and a capital letter, against a lower-case URL host.

## 3. Environment and documentation

- [x] 3.1 Add both variables to `.devcontainer/docker-compose.yml`, quoted as
      strings the way `ALLOW_INSECURE_DEV_AUTH: "1"` already is. Set the list
      to `example.com`, the host `examples/expense-approval.json` targets.
      Without an entry the devcontainer's engine reaches no `http.request`
      target at all, so nobody can drive the handler by hand. The shipped
      example dead-letters either way: `example.com` answers `405` to a
      `POST`, measured from the container, which the existing non-2xx branch
      already treats as permanent.
- [x] 3.2 Update the `http.request` section of `docs/authoring-guide.md`: an
      author's target must be a host the deployment permits, and a redirect
      fails.
- [x] 3.3 Add both variables to the `README.md` Deploy section, beside the
      `DATABASE_URL` / `AUTH_JWT_SECRET` / `CORS_ALLOWED_ORIGINS` / `PORT`
      list and the `SMTP_*` sentence next to it. That paragraph is the one
      place this repository states what the engine image reads.
- [x] 3.4 Update `docs/current-state.md` where it describes the handler.

## 4. Verification

- [x] 4.1 Run `bun run typecheck`.
- [x] 4.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 4.3 Drive one `http.request` action against a refused host and confirm
      the row reaches the admin dead-letter view with the host in its
      message.
