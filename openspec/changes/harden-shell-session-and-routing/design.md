# Design

## Context

Tab A and tab B both read `web.session` once, at mount, into React state. Nothing listens for the `storage` event. Tab B's `changeLocale` and its hydration effect call `persistSession`. A stale tab then writes its copy over a logout or a newer login. See proposal.md for the audit findings.

The first render waits on `loadUiStringOverrides` (`main.tsx`). Its `fetch` has no signal. The area routers call `decodeURIComponent` inside `matchRoute`, and `useAreaRoute` calls `matchRoute` during render.

## Goals / Non-Goals

**Goals:**

- A stale tab never restores a session another tab ended or replaced.
- The login screen renders within 5000 ms of load, whatever `/ui-strings` does.
- No address makes an area router throw.

**Non-Goals:**

- A server-side logout. The token stays valid until it expires (SEC-4 stands).
- A tab that shows a login screen adopts no session from another tab. The owner ruled that only a tab holding a session reacts.
- Any change to the engine, the HTTP layer or the definition contract.

## Decisions

**Cross-tab rule: sign out, never adopt.** A `storage` listener in `App` reads `loadSession()` when the event's key is `web.session` or `null` (`localStorage.clear()`). It compares the stored token with the token in state. A different token, or no stored session, calls `setSession(undefined)`, sets the notice flag and navigates to `/login`. The same token does nothing, so hydration and locale rewrites from another tab do not loop. The owner ruled this on 2026-10-12.

The comparison is a pure function in `session.ts`, `endedByStorageChange(held, stored)`, so a test covers it without a DOM. The listener is thin and calls it.

Alternatives: adopting the new session silently would switch the actor under unsaved studio work. A reload would drop that work as well and add a flash. Signing out is the same outcome a logout already has.

**No write after sign-out.** Once `session` is `undefined`, the hydration effect returns early and its cleanup sets `live = false`. A late `fetchAccount` result therefore cannot persist. The login screen has no locale picker bound to `changeLocale`, so no other path writes the old session.

**The notice is state in `App`, shown by `LoginScreen`.** `App` holds `endedElsewhere`. The storage handler sets it. `onLoggedIn` and `logout` clear it. `LoginScreen` takes an optional `notice` string. It renders a `<p role="status">` between the title and the first field. The wording is one catalog key, `login.sessionEndedElsewhere`, in EN and DE.

Shape, from `DESIGN.md`: the line borrows the warning callout. That means a 3px rule in the advisory role, 8px of padding before the text, and text in ink. It sits in place, above the form, so it is not a toast. It has no icon and no color beyond the rule, since a session end is information, not a refusal. A `role="status"` region reaches a screen reader without moving focus.

**Time limit: `AbortSignal.timeout(5000)` on the fetch.** The signal also covers the body read. A response that sends headers and then stalls ends too. The existing `catch` already swallows an abort. The map stays empty, and the login screen renders from the builtin catalog. The value is a named constant beside the function. All build targets (`chrome114`, `safari17`, `firefox125`) support `AbortSignal.timeout`.

The comment in `main.tsx` names the real targets from `vite.config.ts`. Those targets support top-level await. The IIFE stays anyway, because it keeps the override read out of module evaluation. The comment gives that reason only.

**Malformed address: one pure wrapper, used by all three routers.** `shell/safeMatch.ts` exports `safeMatch(match, fallback)`. It returns a matcher that calls `match(path)` and, on a `URIError`, returns `fallback`. Any other error rethrows. Each area exports `matchRoute = safeMatch(matchRouteRaw, DEFAULT)`. This keeps `matchRoute` total. Tests and `useAreaRoute` do not change, and the decode sites stay as they are.

Alternatives: a `safeDecode` at each of about twenty decode sites changes far more lines. It also needs a half-match decision at each one. A try/catch inside `useAreaRoute` leaves `matchRoute` partial for direct callers. The brief's `safeDecode` named the effect, and the owner confirmed it: fall back to the area default route.

The address bar keeps the malformed URL. The area shows its default screen. Whether a browser leaves `%E0%A4%A` unchanged in `location.pathname` is not known from the code. The browser check settles it before and after the fix.

## Risks / Trade-offs

[A tab on a long form loses unsaved edits when another tab logs in] → The same loss follows a 401 today. The studio's restore notice offers a stored copy after a session ended.

[The `storage` event fires only in other tabs of the same origin] → That is the case to cover. The tab that changes the session already holds the right state.

[Private windows or blocked storage] → `browserStorage()` can be `undefined`. The listener then never fires, which equals today's behavior.
