## Context

Four modules answer HTTP routes. `routes.ts` serves the participant,
`admin-routes.ts` the operator, `studio-routes.ts` the developer and
`reporting-routes.ts` the process owner. Each arrived after `routes.ts`, and
each copied its plumbing.

The copies are exact. Both `resolveActor` and `errorContext` are one line in
all four. Each `guarded` is a five-line try/catch, and only the one in
`routes.ts` is generic over its success type. Two modules hold a five-line
`parseLimit`.

`routes.ts` already exports 17 handler functions. Four more exports change no
import graph, since `server.ts` imports from all four modules. The three
siblings import from none of them today.

`src/engine/store.ts` holds `newInstanceEventId` and the instance-event write
path. Three call sites build an `assignment.unresolved` event literal by
hand: `transition.ts::commitTransition`, `transition.ts`'s creation path, and
`subprocess.ts`'s child spawn. Six of the seven fields vary per site.

## Goals / Non-Goals

**Goals:**

- One implementation of each of the four route helpers.
- One test bootstrap for the three http suites.
- One place that states the shape of an `assignment.unresolved` event.
- No dead `export` keyword on a function nothing outside its file reads.

**Non-Goals:**

- No new module for the route helpers. `routes.ts` is where they already
  live.
- No change to any handler signature, status code, body or role check.
- No change to the moment an `assignment.unresolved` event lands, or to what
  it carries.
- No wider test-helper library. The fixture holds what the three suites
  already share, nothing more.

## Decisions

### The four helpers stay in `routes.ts` and gain `export`

The audit prescribes this, and it costs no new file.

`errors.ts` is the alternative. It already holds `mapError`, `ErrorContext`
and the error classes that `guarded` and `errorContext` both touch. That
reads better on paper. It costs one more import line per sibling, and it
splits the home of four helpers that arrived together.

The existing spec requirement already names `routes.ts::guarded` as the one
wrapper. Keeping the helpers there keeps that anchor true.

The choice carries a cost. `routes.ts` becomes both a route module and the
plumbing home. The spec delta states that, so the next reader is not
guessing.

### `guarded` stays generic

`routes.ts::guarded<T>` returns `Promise<T | HttpResult>`. The three copies
name `HttpResult` directly. Every caller in the three siblings infers
`T = HttpResult`, so the generic form covers them all. No call site changes.
`handleGetAttachment` is the one caller that needs `T = HttpBinaryResult`,
and it stays in `routes.ts`.

### The event helper takes one object, not six positional arguments

```ts
makeAssignmentUnresolvedEvent({ instanceId, transitionSeq, version, stepId, reason, at })
```

Six positional arguments would put three strings in a row: `instanceId`,
`stepId` and `reason`. The first two carry branded types, so the typecheck
rejects a swap of those two. A swap of `stepId` and `reason` would pass,
since `reason` is a plain union of three strings. The object form removes
that whole class.

The helper mints the `id` and sets `kind`. No call site should restate those
two. That is why the helper earns its place: three hand-built members of a
discriminated union can drift on either field.

It lives in `store.ts`, beside `newInstanceEventId`, which it calls.

### The test fixture holds only what all three suites share

`test/helpers/http-fixture.ts` exports:

- `DB`, the `!!process.env.DATABASE_URL` flag all three read.
- `authHeaders(actor)` and `authedReq(url, method, actor, body?)`. The
  optional `body` comes from studio's version, which subsumes the other two.
  Roughly 200 call sites use `authedReq` across the three files.
- `initDb()` and `truncate(tables)`. Each suite writes its own two-line
  `beforeAll` and `beforeEach` around them.

A `useHttpFixture(tables)` that registered both hooks itself would save 12
more lines. This design rejects it. Bun caches a module across test files in
one process. Module-scope `beforeAll` in the helper would register once,
under whichever file loaded it first. The other two suites would then run
with no truncate. Two explicit hooks per suite cost 18 lines and carry no
such hazard.

The truncate list stays an argument. The three suites truncate different
tables, and studio alone truncates `drafts`. A frozen list would let one
suite wipe another's fixtures.

The registries and the `fetch` handler stay per file. Each suite registers
different plugin types, and only `http.test.ts` spies on the outbox.

### `parseRoles` keeps its order, its bounds and its errors

```ts
const roles = value.map((entry) => { /* the same four checks, unchanged */ });
return [...new Set(roles)];
```

A `Set` keeps first-insertion order. The deduplicated result is therefore the
same array the seen-`Set` loop produced. The four `RequestShapeError`
messages stay word for word, and so do the `MAX_ROLES` and `MAX_ROLE_LENGTH`
bounds.

## Risks / Trade-offs

- **A helper's behavior could differ between copies.** Read each before
  deleting it. Both `resolveActor` and `errorContext` are one-liners with
  identical bodies. Each `guarded` differs only in the generic parameter,
  which widens rather than narrows. The two `parseLimit` copies match
  character for character, error message included.
- **`routes.ts` becomes two things.** It answers participant routes and hosts
  the shared plumbing. The spec records that. `errors.ts` stays the fallback
  home if the plumbing set grows past these four.
- **The test fixture could hide a per-suite difference.** The truncate list
  is the difference that matters. It stays an argument. The suites keep their
  own registries and their own `fetch`.
- **The event helper could hide a real difference between the three sites.**
  They differ in four fields. Those are `instanceId` (parent or child),
  `transitionSeq` (0 or `+1`), `version` and `at`. All four are arguments.
  The helper defaults none of them.

## Migration Plan

None. No stored data, no persisted definition, no HTTP contract and no
environment key changes. Every change stays inside the process.

Rollback is `git revert` of the single commit.

## Open Questions

None.
