## Why

The shared header shows an "Account" button. It does not name the actor who
signed in. An actor might hold multiple sessions. An operator reading a
screenshot cannot tell which actor is active without opening the menu. The
account response already carries a print-ready identity
(`AccountView.displayName`, resolved server-side to the stored name or the
account's email). The header never surfaces it.

## What Changes

- Render the signed-in actor's identity as plain text immediately to the
  left of the account button, inside the shared header (`Chrome.tsx`). The
  button itself keeps its existing "Account" / "Konto" label unchanged.
- Source the text from `session.displayName`. Two cases leave it unset. A
  federated actor never receives one. The other is the brief window right
  after login before `GET /account/me` hydrates. In both, fall back to
  `session.actorId`.
- Render the two cases in different faces, per the design language. The
  actor's name is prose and takes the body face. The `actorId` fallback is a
  machine value and takes the mono face.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `unified-shell`: the header requirement gains a sub-requirement. The
  signed-in actor's identity renders to the left of the account button,
  with the `displayName`-or-`actorId` fallback behavior above.

## Impact

- `packages/web/src/shell/Chrome.tsx`: new elements in the header, new prop
  carrying the identity value.
- `packages/web/src/shell/App.tsx`: pass the session through at both of its
  two `<Chrome>` call sites (the profile-page render and the
  forbidden-area render).
- `packages/web/src/areas/{app,admin,studio,reporting}/root.tsx`: pass the
  session through at each area's own `<Chrome>` call site. `Chrome` renders
  from six places, not two. Every area root already holds `session` in
  scope.
- `packages/web/src/shell/shell.css`: new classes for the element and its
  wrapping group, aligned flush left of `.shell-account`.
- No backend change. `AccountView.displayName` and `session.actorId` already
  carry everything needed. No i18n catalog change: the rendered value is
  data, not a translated string.
