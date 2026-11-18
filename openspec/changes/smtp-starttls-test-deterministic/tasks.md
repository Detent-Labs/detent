# Tasks

## 1. A deterministic fake after STARTTLS

- [ ] 1.1 Give `fakeSmtp` its `STARTTLS` branch, the `bytesAfterStartTls` count and the `afterStartTls` modes, per D1. Add the `bytesAfterStartTls` assertion to the STARTTLS test, per D4. Pass: the STARTTLS test passes and reads more than 0 bytes after `STARTTLS`.
- [ ] 1.2 Add the `"close"` and `"plaintext"` tests, per D4. Pass: before task 2.1, both fail on the missing "TLS handshake".

## 2. The wire names the session step

- [ ] 2.1 Move the step into `SmtpWire`, name it in the `close` and `error` messages, and start the handshake step before `upgradeTLS`, per D2 and D3. Pass: the tests from 1.2 pass, and every other test in the file stays green.
- [ ] 2.2 Add the direct `SmtpWire` test, per D4. Pass: it fails when either callback drops the step.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck`, `bun run build` and `bun run lint`. Pass: each exits 0.
- [ ] 3.2 Run the full `bun test` with `DATABASE_URL` set, in the foreground, through the gated script. Pass: 0 fail.
- [ ] 3.3 On the host, run the prose and whitespace gates over `range.sh < /dev/null`. Pass: both exit 0.
