# Tasks

## 1. A deterministic fake after STARTTLS

- [x] 1.1 Give `fakeSmtp` its `STARTTLS` branch, the `bytesAfterStartTls` count and the `afterStartTls` modes, per D1. Add the `bytesAfterStartTls` assertion to the STARTTLS test, per D4. Pass: the STARTTLS test passes and reads more than 0 bytes after `STARTTLS`.
- [x] 1.2 Add the `"close"` and `"plaintext"` tests, per D4. Pass: before task 2.1, both fail on the missing "TLS handshake".

## 2. The wire names the session step

- [x] 2.1 Move the step into `SmtpWire`, name it in the `close` and `error` messages. Start the handshake step before `upgradeTLS`, per D2 and D3. Pass: the `"close"` test from 1.2 passes, and every other test but `"plaintext"` stays green.
- [x] 2.2 Add the direct `SmtpWire` test, per D4. Pass: it fails when either callback drops the step.

## 3. No reading before the handshake completes

- [x] 3.1 Discard the plain socket's buffered bytes on `STARTTLS`, per D5. Await the `handshake` callback before the second `EHLO`, and read only the attached TLS socket. Pass: the `"plaintext"` test passes, with no `AUTH` at the fake.
- [x] 3.2 Add a direct `SmtpWire` case for a byte before the handshake and one for a failed handshake, per D5. Pass: each case fails once you disable its check.
- [x] 3.3 Read `STARTTLS` from the `EHLO` reply's extension lines alone, per D6. Pass: a fake whose greeting line holds "starttls" draws no `STARTTLS`, and the real-message test passes in this pod.

## 4. Verification

- [ ] 4.1 Run `bun run typecheck`, `bun run build` and `bun run lint`. Pass: each exits 0.
- [ ] 4.2 Run the full `bun test` with `DATABASE_URL` set, in the foreground, through the gated script. Pass: 0 fail.
- [ ] 4.3 On the host, run the prose and whitespace gates over `range.sh < /dev/null`. Pass: both exit 0.
