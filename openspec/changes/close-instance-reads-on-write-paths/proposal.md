# Proposal

## Why

The owner ruled that access to an instance stays revocable. Four write routes
still hand out what a revocation, or a missing read right, withholds.
`POST /instances/:id/cancel` returns the whole `Instance`, `data` included, to
a caller who gets 403 on `GET /instances/:id`. Claim, release and delegate do
the same.

Two read paths ignore a revocation. A revoked starter still sees her case
under `scope=started` and reads its record. The visibility routes accept any
account name. They also answer an unknown instance id differently from a known
one.

## What Changes

- Cancel, claim, release and delegate answer with a write result:
  `{instanceId, status, transitionSeq, assignment}`. They never return `data`
  or `startedBy`. The result carries `assignment` only while the instance runs.
  The Runtime API Layer and the HTTP routes both follow this shape. The change
  is **BREAKING** for a caller that read `data` from these answers. No web
  client does.
- `scope=started` and the starter branch of `GET /instances/:id/record` honor a
  standing revocation. A claim, or a candidacy on an unclaimed step, still
  outranks it. An administrator keeps every row.
- Revoke and grant check the named account against the local account directory
  when the directory knows the acting administrator. An unknown account raises
  a new 422 `unknown-actor`. Restore skips the check.
- Revoke, restore and grant answer an unknown instance id with the opaque 403.
  A known instance gives that same 403 to an actor without standing.
- Submit, form-draft save and the starter path of cancel reveal a finished
  instance's status to readers only. Any other caller gets the opaque 403. That
  includes a starter whom a revocation names. Submit and form-draft save also
  answer an unknown instance id with that 403, except for an administrator.
- `docs/openapi.yaml` documents the new answer shape, the new 422 and the
  changed 403 and 500 texts.
- `docs/decisions.md` loses this change's audit-index entry. It gains two open
  entries. One records the residual write-route existence answer. The other
  records the submit route's answer to a writer who may not read.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-api`: claim, release and delegate return the write result. A new
  requirement states the shape and what it omits. The boundary requirement and
  form-draft save report a non-running instance to readers only.
- `http-wrapper`: claim, release, delegate and cancel answer the write result.
  A visibility change to an unknown account maps to 422 `unknown-actor`. The
  visibility routes refuse an unknown instance with 403.
- `instance-visibility-set`: a revocation holds on `scope=started` and on the
  starter's record read. Revoke and grant name a known account. A visibility
  change discloses nothing about an unknown instance. A write call reveals a
  finished instance's status to readers only.
- `authorization`: the starter's cancel and the starter's record read yield to
  a standing revocation.
- `end-user-app`: the started-cases screen omits a case the participant lost
  sight of.

## Impact

- Code: `src/runtime/instances.ts`, `claims.ts`, `visibility.ts`, `record.ts`,
  `queries.ts`, `internal.ts`, `api.ts`, `src/errors.ts`, `src/http/routes.ts`
  and `src/http/errors.ts`.
- API: four response bodies shrink, one 422 type appears, and the visibility
  routes answer 403 where an unknown instance gave 500.
- Docs: `docs/openapi.yaml`, `docs/decisions.md` and
  `docs/browser-checks.md`.
- Web: no source change. Seven client calls already discard the body. The
  browser check covers the task screen, the admin instance screen and the
  started-cases screen.
- Out of scope by owner ruling: the submit route's body, and CLAIM-1. In
  CLAIM-1 a candidate claims a test instance it cannot open. Claim, release
  and delegate on a non-running or unknown instance also stay as they are.
  Open entries in `docs/decisions.md` record each.
