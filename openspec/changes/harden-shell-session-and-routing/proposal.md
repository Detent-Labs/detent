# Proposal

## Why

The 2026-10-10 audit found three small gaps in the shell. Tabs do not share the session, so a stale tab can write a logged-out session back to storage (F-12). The first render waits on `GET /ui-strings` with no time limit, so a hung request leaves a white page (F-13). A malformed percent escape in the address makes an area router throw during render (E1-11).

## What Changes

- A tab that holds a session ends it when another tab changes the stored session. A logout in tab A, or a login as someone else, signs tab B out at once. Tab B shows the line "Your session ended in another tab." on its login screen. A rewrite that keeps the same token, such as hydration or a locale change, is ignored.
- The `GET /ui-strings` read before the first render stops after 5000 ms. On a timeout the login screen renders from the built-in catalog, as a failed read already does.
- Each area router (`studio`, `admin`, `app`) resolves an address with a malformed percent escape to its default route, the way it already resolves an unknown path.
- The comment in `main.tsx` that names the build targets `es2020` and `chrome87` states the real targets from `vite.config.ts`.

Logout stays client-side. No logout route is added, and the token in `localStorage` (SEC-4, an accepted risk) is not revisited.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unified-shell`: adds the cross-tab session rule, the login notice, and the malformed-address rule.
- `ui-string-overrides`: adds the time limit on the override read.

## Impact

- `packages/web/src/shell/App.tsx`, `shell/session.ts`, `shell/LoginScreen.tsx`, `i18n/catalogs/shell.ts` (EN and DE).
- `packages/web/src/main.tsx`, `i18n/overrides.ts`.
- `packages/web/src/areas/{studio,admin,app}/routing.ts`.
- Tests for each, `docs/browser-checks.md`, and the audit index entry in `docs/decisions.md`.
- No engine, HTTP or definition-contract change.
