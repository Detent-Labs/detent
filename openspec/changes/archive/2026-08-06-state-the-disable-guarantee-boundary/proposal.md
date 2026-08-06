## Why

`harden-local-account-sessions` closed SEC-5. The JWT resolver now asks
`isActiveAccount(actor.id)` on the local branch, so a token issued before a
disable stops authenticating. A live check confirms it: the same token answers
`200` before the disable and `401` right after, with
`account is disabled or no longer exists`.

No spec states the boundary of that guarantee. It is this: the window is not
zero. It is the duration of one request already in flight. Every request that
starts after the disable commits gets `401`.

A request that already passed the resolver runs to the end under the rights it
resolved. This design cannot close that gap. Closing it would need a second
directory read partway through a request.

The specs pin the other two residues of that same change. The rate limiter is
"per-process and in-memory" in `local-user-accounts`. `jwt-authentication` and
the deployment runbook both name `ALLOW_INSECURE_DEV_AUTH`. This boundary has
no such line.

<!-- antislop: allow synonym-rotation -->
A guarantee stated without its boundary reads as absolute. An operator
answering a compromise will read it that way. "Operator" is this repository's
word for the administrator persona. "User" names the account itself.

A second boundary of the same mechanism is also unstated. The outbox delivery
worker resolves no actor. It claims a due row and calls that row's handler
(`src/engine/outbox.ts`). An action an account enqueued before the disable
therefore still delivers.

## What Changes

- The `jwt-authentication` requirement that states the per-request account
  check gains its boundary. The check runs once per request, ahead of the
  route handler. A request already past it keeps its rights to the end.
- That same requirement states that an already-enqueued outbox action keeps
  delivering, because the delivery worker resolves no actor.
- Two tests, one per new scenario. Both are deterministic and need no timing.

This change leaves two further boundaries of this mechanism alone, because the
specs already record them. An externally issued token reads no directory, and
the same requirement says so in its last paragraph. A role grant waits for the
next login, which `admin-user-management` covers with "A role change does not
reach an already-issued token".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jwt-authentication`: the requirement "The resolver re-reads the account
  behind every locally issued token" gains two boundary paragraphs and two
  scenarios.

The boundary follows from where the check runs. That requirement is the one
that places it.

The `local-user-accounts` capability governs the login path. This mechanism
never touches that path.

The `admin-user-management` capability already defers the mechanism to
`jwt-authentication`. It states the operator-facing half correctly:
"Disabling SHALL take effect on that user's next request". Repeating the
boundary there would put one rule in two places.

## Impact

- No source change. The code already behaves this way. The specs did not say
  so.
- `test/auth-login.test.ts`: an admin disabling its own account still gets
  `200` on that request, and `401` on the next one with the same token.
- `test/outbox.test.ts`: a row enqueued before a disable still delivers.
- `openspec/specs/jwt-authentication/spec.md`: the modified requirement,
  synced in whole per task 1.1.
