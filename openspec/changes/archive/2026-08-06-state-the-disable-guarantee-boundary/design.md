## Context

`harden-local-account-sessions` closed SEC-5. The JWT resolver now asks
`isActiveAccount(actor.id)` on the local branch, so a token issued before a
disable stops authenticating. No spec states the boundary of that guarantee.

The window is not zero. It is the duration of one request already in flight.
A request that already passed the resolver runs to the end under the rights
it resolved. Closing that gap would need a second directory read partway
through a request. That is out of scope here.

## Goals / Non-Goals

Goals:

- State the in-flight-request boundary on the requirement that places the
  check, with a scenario that pins it.
- State the outbox delivery-worker residue. An already-enqueued action from a
  since-disabled account still delivers, because the delivery worker resolves
  no actor.
- Add the two deterministic tests behind those scenarios.

Non-Goals:

- Closing the in-flight window. That needs a second directory read partway
  through a request, and no such read exists.
- Any change to the outbox delivery worker's actor resolution.
- Any change to the rate limiter or `ALLOW_INSECURE_DEV_AUTH` residues; the
  specs already pin those.

## Decisions

### The boundary lands on the existing requirement, not a new one

One existing `jwt-authentication` requirement places the check: the
resolver re-reads the account behind every locally issued token.

The two new paragraphs and two new scenarios extend that requirement. They
do not become a new requirement. A sibling requirement would separate the
rule from the guarantee it bounds. The boundary stays beside the check
instead.

### The outbox residue sits on the same requirement, not on `transactional-outbox`

The already-enqueued-action residue documents a boundary of the account-check
mechanism. The check runs at request resolution, and the delivery worker
never calls it. It does not document a property of outbox delivery itself,
which would belong on `transactional-outbox`. Stating it there would strand
the boundary away from the mechanism it bounds.

## Risks / Trade-offs

None identified. This change adds no schema change, no `ProcessBody`
reshape, and no persisted-state addition. It states an existing, already
shipped runtime behavior in the spec.

A future change that adds an active in-flight kill switch would change this
requirement's SHALL clause. That change is an ordinary one for a spec, not a
one-way door this change forecloses.

## Migration Plan

None. The change states an existing, already-shipped behavior in the spec.
No code changes and no data migrates.

## Open Questions

None.
