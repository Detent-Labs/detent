## 1. The egress policy

- [ ] 1.1 Add a policy helper to `src/handlers/http.ts` that reads
      `HTTP_ACTION_ALLOWED_HOSTS` and `HTTP_ACTION_ALLOW_INSECURE`, and
      answers whether a parsed URL passes. Read the environment per call, so
      a test can set it per case.
- [ ] 1.2 Call the helper in `httpHandler` before the `fetch`. Throw
      `PermanentError` with the failing host or scheme in the message.
- [ ] 1.3 Add `redirect: "manual"` to the `fetch` call. Leave the status
      branch as it stands, since it already treats a 3xx as permanent.
- [ ] 1.4 Rewrite the comment above that branch. It says a 3xx is unreachable
      because `fetch()` follows redirects by default, which stops being true.

## 2. Tests

- [ ] 2.1 A target outside the list raises `PermanentError`, and the mock
      target records no request.
- [ ] 2.2 An unset `HTTP_ACTION_ALLOWED_HOSTS` refuses every target.
- [ ] 2.3 A plain-http target refuses without `HTTP_ACTION_ALLOW_INSECURE`,
      and succeeds with it.
- [ ] 2.4 A mock target that answers `302` fails permanently, and the
      redirect target records no request.
- [ ] 2.5 Set both variables in every existing case in
      `test/handlers-http.test.ts`, from the port each mock server reports.

## 3. Environment and documentation

- [ ] 3.1 Add both variables to `.devcontainer/docker-compose.yml`, so the
      dev server and the seeded demo reach a local target. Include
      `example.com`, the host `examples/expense-approval.json` targets, or
      `scripts/demo-expense-approval.ts` dead-letters its escalation.
- [ ] 3.2 Update the `http.request` section of `docs/authoring-guide.md`: an
      author's target must be a host the deployment permits, and a redirect
      fails.
- [ ] 3.3 Record both variables wherever this repository lists deployment
      configuration.
- [ ] 3.4 Update `docs/current-state.md` where it describes the handler.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck`.
- [ ] 4.2 Run the full `bun test` suite with `DATABASE_URL` set. Report the
      pass, fail and skip counts, and compare the skip count against
      `scripts/gates/skip-floor.txt`.
- [ ] 4.3 Drive one `http.request` action against a refused host and confirm
      the row reaches the admin dead-letter view with the host in its
      message.
