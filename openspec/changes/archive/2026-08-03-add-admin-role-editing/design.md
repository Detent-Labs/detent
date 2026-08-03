## Context

See `proposal.md` for motivation.

Three facts shape the approach.

`src/auth/users.ts` holds two writers with different keys. `setRoles(email,
...)` and `setPassword(email, ...)` key on the email. The CLI takes an email.
`setDisabled(userId, ...)` keys on `user_id`, because the Users screen holds
ids. `GET /admin/users` returns `userId`. The browser therefore never holds an
email it could key on safely.

`auth_users` carries no `revision` column. None of the three existing writers
does optimistic concurrency.

`src/auth/authorize.ts` records a decision this change must respect. The six
`system:*` roles are flat, and no role implies another. A role string is
otherwise free. A process body names whatever role it wants, and the auth layer
never reads a body.

## Goals / Non-Goals

**Goals:**

- One route that replaces a user's role set. It keys the way the screen already
  keys the other two write routes.
- The admin area can no longer lock itself out of `/admin/*`.
- The existing CLI path keeps working, with no change to `setRoles`.

**Non-Goals:**

- Creating a user or changing a password over HTTP. Both stay CLI-only.
- A role catalog, a role registry, or any list of which roles exist. No table
  records a role, and this change adds none.
- Self-service. Only a holder of `system:admin` acts here.
- The manager field. Stage 25c owns it, so that this change ships no column
  that nothing reads.

## Decisions

**A full replacement, not an add/remove pair.** `PATCH
/admin/users/:userId/roles` takes `{ roles: string[] }`. It writes exactly that
set. The alternative was `{ add: [...], remove: [...] }`. That form survives two
people editing at once. It loses on two other counts.

`setRoles` already replaces, so the write path needs no new SQL. A replacement
also matches what the screen shows: the current set, then a change to it. Two
people editing one user in the same second is a case a handful of admins do not
produce. There is also no `revision` column to hang optimistic concurrency on.

**Keyed by `userId`, over a new `setRolesById`.** The route mirrors
`setDisabled`. It keys on `user_id`. It returns the updated `{ userId, email,
roles, disabled }`, or `undefined` when no such row exists. The handler maps
that `undefined` to 404.

The alternative was to reuse `setRoles(email, ...)` and take the email in the
path. Two reasons rule it out. Every other `/admin/users*` route keys on the
id. An email in a URL path also needs encoding, for no gain. `setRoles` stays
as it is, so `src/auth/cli.ts` needs no change.

This departs from the approved design. Both
`docs/superpowers/specs/2026-08-02-pluggable-step-assignment-design.md` and
`ROADMAP.md`'s stage 25a say the route runs "over the existing `setRoles`".
Neither weighed the key. This change corrects both records rather than leaving
them to contradict the code.

**The handler returns the 409 and the 404 inline, and raises neither.** It
returns `{ status, body: { error: { type, message } } }` directly, the way
`handleSetUserDisabled` already returns its 404. It adds no class to
`src/http/errors.ts` and no entry to that file's mapping table.
`admin-operations-api` requires this. No `/admin/*` route brings a new error
type or a new response envelope with it.

The two checks run in a fixed order, and the order shows. The self-strip guard
goes first, against the resolved actor's own id, before any read. The 404 comes
afterwards, from `setRolesById` returning `undefined`.

One case makes the order visible. An actor authenticated by an external issuer
may hold `system:admin` from a `sub` that matches no `auth_users` row, which
`jwt-authentication` allows. A self-strip from that actor answers 409, not 404.
That is the intended reading. The rule governs the actor, who demonstrably
exists, not the row. The other order would let an actor with no local row talk
the server out of its own guard.

**The route refuses to strip `system:admin` from the calling actor.** The
condition is narrow. `actor.id` equals the path's `userId`. The submitted set
omits `system:admin`. The route then returns 409 and writes nothing.

The alternative was a browser confirmation dialog. That matches the precedent
`DISABLE_CONFIRM` sets on the same screen. It loses here because the recovery
paths differ. Any other admin re-enables a wrongly disabled user over the same
screen. An admin area with no `system:admin` holder left is reachable only from
`bun run src/auth/cli.ts set-roles`. That is the shell nobody has, which is why
this work exists at all.

The guard covers the calling actor only. One admin may still strip another
admin's role, including the last other one. Catching that needs a count query
plus a rule about which admin is last. Whoever does it is also looking at the
roles column while they do it.

**Input validation, but no charset rule.** The route rejects four shapes. Each
one returns 400 and writes nothing.

- `roles` is not an array of strings.
- An entry is empty after trimming.
- An entry is longer than 64 characters.
- The set holds more than 64 entries.

Before the write it trims each entry and drops duplicates. It enforces no
character set.

A pattern such as `^[a-z0-9:_-]+$` reads well. The CLI has written unvalidated
role strings since stage 7, though. A pattern would make an existing row
unsavable through the screen this work adds. The bounds are the trust-boundary
check. The charset is not.

**The roles cell becomes a text input in place.** A per-row button swaps the
cell for that input. It holds the current roles, comma-separated, with Save and
Cancel beside it. A hint names the six reserved `system:*` roles. Those are the
only role names anything in the repo fixes.

The alternative was a dialog with a checkbox per known role. Nothing knows
which roles exist. The union of the roles already assigned is a proxy. It is
empty for the first business role anyone assigns. A picker becomes worth
building once stage 25c gives roles a source. Until then it would hide the one
operation that must work.

## Risks / Trade-offs

- Two people save one user's roles at once, and the second write discards the
  first → Accepted. The screen refreshes after a save, so the loser sees it.
  Optimistic concurrency needs a column `auth_users` does not have.
- Someone strips the last remaining `system:admin` from another user. The admin
  area then becomes unreachable → Mitigated only by what the screen shows.
  Recovery is `src/auth/cli.ts`, unchanged.
- A typo assigns a role no process names. Nothing fails, and the user sees no
  task → Accepted. A free role string carries this, and the CLI carries it
  today.
- A newly granted role does not reach an already-issued JWT. That token carries
  the roles from login → Accepted and pre-existing. `admin-user-management`
  records the same property for disable. The spec delta states it for roles too.
- Stage 25c adds a manager field to the same row → Nothing here needs undoing.
  The route `:id/roles` is a per-attribute sub-resource, so 25c adds
  `:id/manager` beside it. The last-write-wins property does widen. Two
  attributes on one row then share one screen. Revisit optimistic concurrency
  then, not now.

## Migration Plan

None. No table changes, no data changes, and no published body in scope. The
route is additive. A deployment that never calls it behaves as it does today.

## Open Questions

One, and it does not change the specs, the approach or the tasks.

**Where the reserved-role hint gets its list.** The screen names the six
`system:*` roles beside the input. This change hardcodes them in the admin
area. They sit next to the area gate, which names two of them already. The
engine side holds them as exported constants in `authorization`.

A route could serve that list to the browser instead. Ask once a second screen
needs the same list. Today no other screen does.
