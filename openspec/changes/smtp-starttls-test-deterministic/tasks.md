# Tasks

## 1. A deterministic STARTTLS test

- [ ] 1.1 Make `fakeSmtp` drop every byte after it answers `STARTTLS`, per D1. Pass: the STARTTLS test passes 200 times in a row with `--rerun-each 200`, filtered to that test.
- [ ] 1.2 Add the `closeAfterStartTls` option and the new fast-path test, per D3. Pass: before task 2.1 the new test fails on the missing "TLS handshake".

## 2. The session step in every wire failure

- [ ] 2.1 Pass the `phase` object into `SmtpWire`, and name the step in the wire's `close` and `error` failures, per D2. Pass: the new test from 1.2 passes, and every other test in the file stays green.

## 3. Verification

- [ ] 3.1 Run `bun run typecheck`, `bun run build` and `bun run lint`. Pass: each exits 0.
- [ ] 3.2 Run the full `bun test` with `DATABASE_URL` set, in the foreground, through the gated script. Pass: 0 fail.
- [ ] 3.3 On the host, run the prose and whitespace gates over `range.sh < /dev/null`. Pass: both exit 0.
