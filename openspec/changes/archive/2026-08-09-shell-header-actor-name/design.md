## Context

`Chrome.tsx` renders the one header shared by all four areas and the
profile page. Separately, `App.tsx` mounts it at two call sites: the
profile-page render and the forbidden-area render. Both already receive `roles`,
`locale` and callbacks. Neither passes the session's identity fields. See
proposal.md for why the header should name the actor.

`session.displayName` is already the print-ready value. `AccountView`
documents it as the stored name, or the email where the account set none.
The engine resolves that fallback server-side. `session.actorId` comes from
the login response and stays defined always.

## Goals / Non-Goals

**Goals:**
- Render the signed-in actor's identity in the header, sourced from data
  the session already carries.
- Keep the account button's own label untouched.

**Non-Goals:**
- No change to `AccountView`, `Session`, or any backend route. Both
  fields this design reads already exist.
- No i18n catalog entry. The rendered value is data, not a translated
  string.
- No change to the account menu's contents.

## Decisions

**Pass the whole session to `Chrome`, not two loose props.** `Chrome`
already takes `roles` and `locale`, both pulled off `session`. Two more
loose props would grow that list to five for one object. A `session` prop
typed `Pick<Session, "displayName" | "actorId">` keeps the field list
stable. A later change that reads another session field for the header
needs no new prop.

`Chrome` renders from six places, not two: both `App.tsx` call sites, plus
one direct call inside each of the four area roots (`app`, `admin`,
`studio`, `reporting`). Every one of the six already holds `session` in
scope, from `AreaRootProps` or from `App.tsx`'s own state. This prop needs
no new plumbing beyond passing it through at each site.

**A wrapped span, two classes.** A single `<span>` sits inside a new
`.shell-account-group` wrapper, alongside the existing `.shell-account`
div. It always renders `displayName ?? actorId`, so its class alone
decides the face.

`.shell-account-group` takes the `margin-left: auto` that `.shell-account`
carries today. Two of the six render sites, both in `App.tsx`, pass
`nav={undefined}`. Without the wrapper, `.shell-nav`'s `flex: 1` is absent
on those two screens, and only `.shell-account`'s own auto margin would
push right. The span would strand at the header's left edge, away from
the button. That happens on exactly the two screens this change first
wires up. `.shell-account` keeps `position: relative`, so `.shell-menu`'s `right: 0`
still resolves against it.

`.shell-account-name` is the default: body face, inherited like the rest
of the header. `.shell-account-name-id` applies when the span falls back
to `actorId`. It adds `font-family: var(--font-mono)`, matching how ids
appear elsewhere in this package.

`shell.css`, `admin/`, and `studio/` already set that font-family locally
per component, rather than through one shared `.mono` class. This design
keeps that pattern instead of adding a new primitive.

**No loading state for the pre-hydration window.** Between login and `GET
/account/me` resolving, `displayName` is `undefined`. The span renders
`actorId` in that window. `App.tsx`'s existing hydration effect already
re-renders once hydration completes. The span's content and class follow
`session.displayName` becoming defined then. This design adds no
independent hook.

## Risks / Trade-offs

- **Header text length.** A long `displayName` sits beside a fixed-width
  button. The header is `display: flex`. The name span needs no
  max-width: a flex row wraps to its content, and the button itself never
  shrinks. Verify in a real browser per `CLAUDE.md`'s verification gate.
  Include a German locale, where surrounding labels run longer.
- **`actorId` as a fallback reads as an odd label to a federated actor.**
  Accepted per the proposal. No email exists for a federated actor to fall
  back to instead. The opaque id still beats an empty span, for the
  screenshot and multi-session cases this change targets.

## Migration Plan

None. Both fields this design reads, `session.displayName` and
`session.actorId`, already exist in every stored session. This is a
render-only addition. It deploys with the ordinary release.

## Open Questions

None.
