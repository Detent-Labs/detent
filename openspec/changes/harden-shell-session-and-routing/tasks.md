# Tasks

## 1. Cross-tab session

- [ ] 1.1 Add `endedByStorageChange` to `shell/session.ts`. Test it in `test/shell-session.test.ts`: logout, foreign login, same token, no held session.
- [ ] 1.2 Add the `login.sessionEndedElsewhere` key to the EN and DE shell catalogs. The catalog parity test passes.
- [ ] 1.3 Add an optional `notice` prop to `LoginScreen`. Render it as a `role="status"` line with the callout rule. A render test covers it.
- [ ] 1.4 Add the `storage` listener and the notice state to `App`. Verify with the two-tab browser check in group 4.

## 2. Override read limit

- [ ] 2.1 Add `AbortSignal.timeout(5000)` to `loadUiStringOverrides`. A test with a never-answering fetch resolves with an empty map.
- [ ] 2.2 Correct the build-target comment in `main.tsx`. `grep` finds no `es2020` or `chrome87` in it.

## 3. Malformed address

- [ ] 3.1 Add `shell/safeMatch.ts` and wrap the studio, admin and app `matchRoute`. Each router's test file asserts a malformed escape falls back to its default.
- [ ] 3.2 Assert that a valid escape still decodes, in the same three test files.

## 4. Verification

- [ ] 4.1 Add the two-tab check and the malformed-address check to `docs/browser-checks.md`.
- [ ] 4.2 Run the browser check on the production build: two tabs, a hung `/ui-strings`, and `/studio/processes/%E0%A4%A/edit`.
- [ ] 4.3 Run `/impeccable critique` and `/impeccable audit` against `/login`.
- [ ] 4.4 Run `bun run typecheck` and `bun run build` in the container.
- [ ] 4.5 Run the full gated suite with `OPENSPEC_TELEMETRY=0`. The command is `sh scripts/test-gated.sh bun test`.
- [ ] 4.6 Run the prose and whitespace gates over the pushed range on the host.
- [ ] 4.7 Strike the `harden-shell-session-and-routing` entry in the audit index of `docs/decisions.md`.
