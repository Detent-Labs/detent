## 1. Chrome header

- [x] 1.1 Add a `session: Pick<Session, "displayName" | "actorId">` prop to
      `ChromeProps` in `packages/web/src/shell/Chrome.tsx`.
- [x] 1.2 Add a `<span>` inside a new `.shell-account-group` wrapper,
      alongside the existing `.shell-account` div, showing
      `session.displayName ?? session.actorId`.
- [x] 1.3 Apply `.shell-account-name` when the session carries a
      `displayName`, and `.shell-account-name-id` when the span falls back
      to `actorId`.

## 2. Wiring at every `<Chrome>` call site

`Chrome` renders from six places. Wire every one, not only the two in
`App.tsx`.

- [x] 2.1 Pass `session={session}` at the profile-page `<Chrome>` call site
      in `packages/web/src/shell/App.tsx`.
- [x] 2.2 Pass `session={session}` at the forbidden-area `<Chrome>` call
      site in the same file.
- [x] 2.3 Pass `session={session}` at the `<Chrome>` call site in
      `packages/web/src/areas/admin/root.tsx`.
- [x] 2.4 Pass `session={session}` at the `<Chrome>` call site in
      `packages/web/src/areas/app/root.tsx`.
- [x] 2.5 Pass `session={session}` at the `<Chrome>` call site in
      `packages/web/src/areas/studio/root.tsx`.
- [x] 2.6 Pass `session={session}` at the `<Chrome>` call site in
      `packages/web/src/areas/reporting/root.tsx`.

## 3. Styling

- [x] 3.1 Run the `frontend-design` skill for direction on the identity
      span's exact spacing and its overflow treatment beside the button.
- [x] 3.2 Add `.shell-account-group`, `.shell-account-name` and
      `.shell-account-name-id` to `packages/web/src/shell/shell.css`, per
      `.claude/rules/design-language.md` (body face default, mono face for
      the `actorId` fallback via `font-family: var(--font-mono)`).
      `.shell-account-group` takes the `margin-left: auto` that
      `.shell-account` carries today, so the span stays adjacent to the
      button on the two `App.tsx` screens that render no `nav`.

## 4. Tests

- [x] 4.1 Extract the display text and face decision (`displayName ??
      actorId`, and which class it takes) into a pure function.
- [x] 4.2 Add `packages/web/test/chrome-accountName.test.ts`, flat under
      `test/` like every other file there, testing that function directly:
      a hydrated `displayName` takes the body face, a federated actor's
      `actorId` takes the mono face, and the pre-hydration window takes the
      mono face until `session.displayName` resolves.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it passes.
- [x] 5.2 Run `bun run build` and confirm it passes.
- [x] 5.3 Run the full `bun test` suite with `DATABASE_URL` set and confirm
      it passes, checking the skip count as well as the pass count.
- [x] 5.4 Check the change in a real browser: log in as a local account
      (name shows, body face) and, if a federated account is reachable in
      the dev setup, confirm the `actorId` fallback (mono face). Check both
      `en` and `de` locales for header overflow.
