# Tasks

## 1. Cross-tab session

- [ ] 1.1 Add `endedByStorageChange` to `shell/session.ts`. Extend `test/session.test.ts`: logout, foreign login, same token, no held session.
- [ ] 1.2 Add the `login.sessionEndedElsewhere` key to the EN and DE shell catalogs. The catalog parity test passes.
- [ ] 1.3 Add an optional `notice` prop to `LoginScreen`. Render it as a `role="status"` line with the callout rule. A render test covers it.
- [ ] 1.4 Add the `storage` listener and the notice state to `App`. Clear the state on login and on a chosen logout.
- [ ] 1.5 Add `e2e/session-tabs.e2e.ts`: two pages, a logout in one, the other at `/login` with the notice. `bun run e2e` passes in the container.

## 2. Override read limit

- [ ] 2.1 Add `UI_STRINGS_TIMEOUT_MS` and `AbortSignal.timeout` to `loadUiStringOverrides`. Extend `test/i18n-overrides.test.ts`: a never-answering fetch resolves with an empty map, and the constant is 5000.
- [ ] 2.2 Correct the build-target comment in `main.tsx`. `grep` finds no `es2020` or `chrome87` in it.

## 3. Malformed address

- [ ] 3.1 Add `shell/safeMatch.ts`. Wrap the studio, admin, app and reporting `matchRoute` with it.
- [ ] 3.2 Extend `studio-routing`, `admin-routing`, `reporting-routing` and `routing` tests. A malformed escape falls back to the default, and a valid escape still decodes.

## 4. Verification

- [ ] 4.1 Add the malformed-address, hung `/ui-strings` and notice-look checks to `docs/browser-checks.md`.
- [ ] 4.2 Run the browser check on the production build: a hung `/ui-strings` and `/studio/processes/%E0%A4%A/edit`.
- [ ] 4.3 Run `/impeccable critique` and `/impeccable audit` against `/login`.
- [ ] 4.4 Run `bun run typecheck` and `bun run build` in the container.
- [ ] 4.5 Run the full gated suite with `OPENSPEC_TELEMETRY=0`. The command is `sh scripts/test-gated.sh bun test`.
- [ ] 4.6 Run the prose and whitespace gates over the pushed range on the host.
- [ ] 4.7 Strike the `harden-shell-session-and-routing` entry in the audit index of `docs/decisions.md`.
