## Context

See `proposal.md` for motivation. `ROADMAP.md` stage 40 is the design of
record, and this change builds one paragraph of it.

Four facts shape the approach.

The module `src/auth/authorize.ts` is 55 lines long. It declares eight role
constants, one error class, and `requireRole`. It imports one type. That
minimalism is a stated property of the `authorization` capability, and the seam
must not spend it.

Two of the six call sites do not hold the process id where they check the role.
The publish route gates before it parses the request body, and that body
carries the target `processId`. The cancel path gates before it loads the
instance, and that instance carries the `processId`. The other four take the id
as a function parameter. Each of those four swaps one call for another.

The file `tsconfig.json` sets `noUnusedParameters: true`. The `processId`
argument reaches no branch today, so the compiler will report it.

The live spec `openspec/specs/http-wrapper/spec.md` states the publish gate's
placement as a SHALL. It says the check runs before the body parse. Moving the
gate is a spec change, not a silent reordering.

## Goals / Non-Goals

**Goals:**

- One module answers every process-scoped permission question.
- A later change to grant storage edits `src/auth/authorize.ts` alone.
- No actor gains or loses access.

**Non-Goals:**

- No grant storage, no scope value, no scope registry.
- No change to `requireRole`, and none to the eight role constants.
- No change to the routes that hold no process. See `proposal.md` for the list.
- No UI. Three areas each read a role string, and none of those reads moves.

## Decisions

### Two functions, not one

The function `can` returns a boolean. The function `requirePermission` throws.

The five HTTP gates want the throwing shape. They already had one in
`requireRole`, and `guarded` maps `AuthorizationError` to 403. The cancel path
wants the predicate instead. Its loaded branch combines the answer with a
second test.

The alternative was one function named `can` that throws. Stage 40 names the
function `can(actor, permission, processId)`, and that name reads as a
question. A question that throws is a trap for the next reader. The pair costs
four lines.

### A permission, not a role string

The first argument after the actor is `"publish"`, `"cancel"` or `"migrate"`.
It is not `PUBLISH_ROLE`.

The alternative was `can(actor, role, processId)`. That form needs no new type
and no map, and it fails the change's one goal. A role is how the engine
answers the question today. A permission is what the call site asks. Passing
the role freezes today's answer into all six call sites. That coupling is what
the seam exists to break.

Three permissions cover six sites, so `PERMISSION_ROLE` is a three-entry
`Record<Permission, string>`.

### The publish gate moves behind the body parse

The publish route reads `processId` out of the parsed body. Its gate therefore
cannot run before the parse.

The alternative was to keep the pre-parse `requireRole` as a cheap floor, and
to add the scoped call after the parse. That floor is wrong under the model
this seam prepares for. A holder of a scoped publish grant carries no global
`system:publish` role. The floor would refuse the exact caller a scoped grant
exists to admit. So the floor is what a later change has to delete, which puts
this file back on the list. It goes now.

The cost is one response code. An unauthorized caller who sends a malformed
body reads 400 rather than 403. That answer names the caller's own body. It
discloses nothing about the installation. The property the old ordering
protected survives. The definition store, the registry and the CEL check all
stay out of reach.

The id the gate reads is not yet a validated one. The shape check proves only
that `parsed.processId` is a string, and the cast to `ProcessId` follows. The
publish chain checks the `proc_` prefix later. Today `can` ignores the
argument, so nothing turns on it. A scoped reader must not treat that string as
an id it can trust.

### The cancel gate keeps its fast path and gains a second test

The cancel path keeps `requireRole(actor, CANCEL_ANY_ROLE)` ahead of the load.
That question is global and needs no process id. Its loaded branch gains one
term:

```
if (!can(actor, "cancel", instance.processId) && instance.startedBy !== actor.id)
```

The call to `can` always answers false there today. The fast path already put
the same question and lost. That is the seam rather than dead code. A scoped
grant can only get its answer where the process id is in hand. That id arrives
with the instance.

Two alternatives lost. The first drops the fast path and tests only after the
load. It would break the rule that a role-holder passes before any lookup. The
second leaves the cancel path out of the change. It would cover five sites of
six, and a later change would have to find the sixth.

The non-disclosure property does not move. Both refusals still throw one
`AuthorizationError` carrying one message, and the unresolvable instance throws
the same one.

### A void statement over a leading underscore

The body of `can` references its third argument once, to satisfy
`noUnusedParameters`:

```
void processId; // no grant carries a scope yet; stage 40's storage half reads this
```

The alternative was `_processId`. This repository uses that prefix for callback
arguments, in `src/handlers/notification-email.ts` and `src/http/server.ts`.
The case here is different. The delta spec names the argument `processId`, and
a leading underscore would show in every editor hint as its real name. One
statement with one comment says more.

### The scenario this change could not rename

The `authorization` delta keeps the scenario name "Each studio route calls
requireRole directly". Its body now names `requirePermission` too.

The command `openspec validate` rejects a MODIFIED block that drops a scenario
the live spec carries, and it matches on the name. A rename reads to it as a
drop. The body carries the accurate statement instead.

## Risks / Trade-offs

**Risk.** A publish caller who lacks the role, and who sends a malformed body,
now reads 400 where it read 403.

**Mitigation.** The delta spec states the change and adds a scenario for it.
Nothing in this repository branches on that pair. The browser package reads
`error.type`, and a caller who can publish never meets the case.

**Risk.** A test asserts the old ordering, and the apply finds it late.

**Mitigation.** Task 2 greps the publish suites for a 403 assertion over a
malformed body, before any code moves. This repository has produced that class
twice. Both cases are on record, in `test/config-descriptor.test.ts` and in
`test/http-data-lists.test.ts`.

**Risk.** The third argument to `can` answers nothing today, so a later reader
deletes it as dead.

**Mitigation.** The delta spec makes that argument a requirement. One scenario
asserts that two process ids agree. The comment in the body names stage 40.

**Risk.** The seam reads as the extension point the `authorization` capability
forbids.

**Mitigation.** The MODIFIED requirement states the difference in full. There
is no registry, nothing a deployment sets, and no caller-supplied entry. Three
fixed permissions sit in a module constant.

**Risk.** A scoped grant names one existing process id. The publish route mints
a new process where that id is fresh. So a scoped grant cannot cover a first
publish, and stage 40 meets that gap.

**Mitigation.** This change does not close it, and it does not have to. A first
publish stays a global question under any storage stage 40 picks. The seam
carries the id either way, so stage 40 undoes nothing here. It adds a branch
for the fresh-id case in one module.

**Risk.** The exports canary in `test/auth-authorize.test.ts` asserts an exact
key list, and two new exports turn it red.

**Mitigation.** Task 2.7 extends that list in the same group that adds the
exports. The canary guards the requirement this change modifies, so it stays a
canary rather than becoming a chore.

## Migration Plan

None. No schema, no table, no data, and no stored grant. The change ships in
one commit and reverts in one.

## Open Questions

None. Stage 40 settled the model on 2026-08-15. This change builds the one
piece that carries no storage question.
