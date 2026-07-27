## 1. Player store request-lifecycle collapse

- [x] 1.1 `store.tsx`: collapse `run`/`runLogin` into one `run(fn, opts?: { isLogin?: boolean })`
      per `design.md`; update `login`'s call site to pass `{ isLogin: true }`.
- [x] 1.2 Confirm every other call site (`createInstance`, `openInstance`,
      `refresh`, `submit`) still calls `run(fn)` with no `isLogin` (default
      401-logout behavior preserved).

## 2. Locale-text helper consolidation

- [x] 2.1 Create `packages/editor/src/player/locale-text.ts` exporting
      `firstLocalizedText(value: LocalizedText | undefined): string` per
      `design.md`.
- [x] 2.2 `FieldInput.tsx`: delete the local `firstLocalizedText`, import
      the shared one.
- [x] 2.3 `PlayerView.tsx`: delete the local `firstText`, import
      `firstLocalizedText` from the shared module, update its one call
      site.

## 3. PlayerClientError simplification

- [x] 3.1 `client.ts`: replace the `super(...)` ternary with
      `super(error.type)`.

## 4. Verification

- [x] 4.1 Run `packages/editor/test/{player-store,player-client,player-field-input-rendering}.test.ts(x)`
      directly and confirm all pass. 37/37 pass — these cover the pure
      helpers and `PlayerClientError`/request-shape behavior, not the
      `run` closure's 401 branch (see design.md Risks: no automated test
      covers that branch, before or after this change).
- [x] 4.2 In the dev server: (a) log in with a wrong password and confirm
      a visible error is shown, NOT a silent return to a blank login
      screen; (b) log in successfully, then trigger a 401 on a
      non-login call and confirm it silently returns to the login screen
      with no error shown. Real end-to-end run: seeded a user via
      `src/auth/cli.ts add-user`, ran `bun run serve` with
      `AUTH_JWT_SECRET` set, drove the editor's Player UI via
      playwright-cli. Wrong password -> "invalid email or password" shown,
      still on login form. Corrupted the stored token in localStorage,
      reloaded, attempted "Open existing" on a bogus instance id -> 401 ->
      silently back on the login form, no error text, confirming the
      `!opts?.isLogin` branch is not inverted. `firstLocalizedText`
      rendering confirmed via the FieldInput component tests (same code,
      same call shape) rather than a full instance flow — reasonable given
      it's a provably identical move, not new logic.
- [x] 4.3 Run `bun run typecheck`. Passed (engine + editor).
- [x] 4.4 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun). 859 pass, 0 fail, 2286 expect() calls. (An
      unrelated first attempt showed 4 failures from a stale Playwright
      Chromium cache after a container recreation done for change 1's
      browser check — fixed via `playwright install --with-deps chromium`,
      confirmed unrelated to this change's files, then reran clean.)
