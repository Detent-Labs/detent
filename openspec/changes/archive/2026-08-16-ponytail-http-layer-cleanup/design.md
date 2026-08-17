## Context

See proposal.md - Why. Two constraints shape the approach.

`src/http/routes.ts` is already the shared module for this layer. The
2026-08-04 `dedup-server-helpers` change put `resolveActor`, `guarded` and
`parseLimit` there. Three route modules import from it today.

`routes.ts` also holds `parseJsonBody<T>(req, schema)`. That function
decodes JSON. It then parses the result against a zod schema. `readJson`
sits in `admin-routes.ts` instead, private. That is why nine sites outside
that file wrote the block by hand.

`RequestShapeError` maps to 400 (`mapError`). The zod path in
`parseJsonBody` raises `RequestShapeError` rather than a bare `ZodError`,
which `mapError` maps to 422. That distinction must survive.

## Goals / Non-Goals

**Goals:**

- One JSON-decode seam for the whole HTTP layer.
- `parseAuthIssuers` validated by the library the layer already uses.
- The audit document corrected where this change measured it wrong.

**Non-Goals:**

- No change to any status code, error type or error message body. A caller
  sending malformed JSON gets the same 400. It gets the same
  `"request body is not valid JSON"` text.
- No new zod schema for a request body. Sites that cast today keep casting.
  Eleven hand-shaped casts turned into eleven zod schemas is a separate,
  larger change. The Decisions section below states why against the live
  requirement that governs it.
- No touch to `parseJsonBody`'s zod half, to `BINARY_ROUTES`, or to the
  three role helpers.
- No touch to `src/auth/login.ts:125-130`. It carries the same decode block.
  It returns a 400 result rather than throwing, so `readJson` does not fit
  it. The audit missed the site. It stays out of scope on purpose.

## Decisions

**`readJson` moves to `routes.ts` and keeps its signature.** It stays
`(req: Request) => Promise<Record<string, unknown>>`. Its six existing
callers in `admin-routes.ts` then need no change beyond the import.

Widening the return to `unknown` is the more honest type. A JSON body may
be an array, a number or a string, and the current signature says
otherwise. This change declines that. It would force a cast at the six
existing call sites, and nothing reads the truthfulness it buys. Every
caller either casts to its own shape or hands the value to a zod parse.
Both survive the wrong-but-wider type.

**Each collapsed site keeps the cast it writes today.** A site reading

```ts
let body: { roles?: unknown };
try { body = (await req.json()) as typeof body; } catch { ... }
```

becomes `const body = (await readJson(req)) as { roles?: unknown };`.

**The cast half of the spec's rule stays as it is.**

`openspec/specs/http-wrapper/spec.md:1213` is a live requirement. Its title
reads `Request bodies are parsed, never cast`. Its text: every route that
reads a JSON request body SHALL parse it against a schema. No route SHALL
cast a parsed body to a type without checking it.

The eleven casts predate this change. `readJson` implements the
requirement's other half, the "not valid JSON at all" clause. It implements
that half for every route at once. It adds no cast that was not there
before. It does make the cast shorter to write, which is the honest cost of
this decision.

The spec-aligned end state routes all eleven sites onto `parseJsonBody(req,
schema)` with one shallow envelope schema each. That deletes the same
twelve blocks and the casts with them. It also changes eleven routes'
rejection behavior, since a schema rejects a body a cast accepts. That is a
behavior change across eleven routes, and it belongs in its own change with
its own delta against `http-wrapper`. Open Questions carries it.

Dropping the cast is the alternative. It rests on `Record<string, unknown>`
being assignable to the target shape. That depends on how TypeScript
resolves a source index signature against a target's named optional
properties. This change has no reason to lean on that rule. The cast is one
token and the code already has it.

**`parseJsonBody` calls `readJson` too.** Its decode half is the same four
lines. Leaving it would keep a twelfth copy inside the one file that now
exports the seam. Its zod half stays as it is.

**`parseAuthIssuers` uses `safeParse` and keeps both messages.** The schema
is

```ts
z.array(z.object({ iss: z.string(), jwksUrl: z.string(), audience: z.string(), rolesClaim: z.string() }))
```

The `JSON.parse` try/catch stays, and so does its
`"AUTH_ISSUERS is not valid JSON"` throw. Zod parses a value, not a string.
An operator who wrote malformed JSON deserves that message, not a shape
complaint.

On a rejected `safeParse` the throw reads the first error's `path[0]` as
the entry index. So `AUTH_ISSUERS[2] must be { iss, jwksUrl, audience,
rolesClaim } (all strings)` still names the offending entry. A non-array
value fails the same `safeParse` with an empty path. The message therefore
reads correctly with no index too.

This change declines `parse`. It throws a `ZodError`, whose message is a
JSON error dump. `parseAuthIssuers` runs at startup in the composition
root. An operator reads its message off a crashed container's log.

**`parseVersion` takes `unknown` and keeps the studio's name.** The two
bodies are one statement apiece and they agree:

```ts
const n = Number(raw);
if (!Number.isInteger(n)) throw new RequestShapeError(`${label} must be an integer`);
return n;
```

`Number(raw)` accepts `unknown`, so the wider parameter costs nothing at
either caller. `admin-routes.ts` passes a body field typed `unknown`.
`studio-routes.ts` passes a path segment typed `string`.

The shared name is `parseVersion`, the studio's. Seven of the nine call
sites read it today, against two for `parseVersionField`. The `Field`
suffix names the admin caller's argument source. That stops being true
once both callers share it. `admin-routes.ts`'s comment pointing at
`studio-routes.ts::parseVersion` goes with the merge. One function needs
no cross-reference.

**Zod now strips extra keys on an issuer entry.**

`z.object` strips by default. `return entry as IssuerConfig` kept them.
`IssuerConfig` declares exactly four properties. `jwtResolver` reads only
those four. Nothing observes the difference. `z.looseObject` would keep
them and buy nothing.

## Audit corrections

Both corrections belong in `PONYTAIL-AUDIT.md`, not only here. Then the
next scan does not re-file them.

**Finding 26 is not a duplication.** The three helpers agree in shape. They
disagree in every load-bearing respect.

`studio-routes.ts:54-55` carries a comment that names and rejects the
proposed refactor:

```
Not a general `requireAnyRole`: this names one specific pair, so a later
route cannot reach for it and quietly widen itself.
```

That is an authorization boundary, written down at the site. `:68-69` binds
`requireStudioRead` to the same rule by reference. Its own wording reads
"The same rule as `requireAuthoring` above".

The three also raise three different messages. `requireAuthoring` names
`system:author` or `system:developer`. `requireStudioRead` names those two
plus `system:templates`. `requireDataListRead` delegates to
`requireRole(actor, DATALISTS_ROLE)`. So it tells a refused reader to hold
`system:datalists` alone. That is the role a maintainer is meant to have,
and its own comment states the choice. One `requireAnyRole(actor,
...roles)` produces one message shape and loses all three.

**Finding 27 is not dead code.**

`openspec/specs/http-wrapper/spec.md:1491` is a live requirement. It reads
"`BINARY_ROUTES` declares every route that returns stored bytes". Three
scenarios sit under it. `test/http-disposition.test.ts:75,94` drives every
entry. `docs/current-state.md:3396` records the same.

The sibling change `ponytail-cut-unreachable-code` reached this conclusion
on its own. Its design.md:164 carries it. Its tasks.md:116 lands the
correction. This change does not repeat it. Two open changes writing one
paragraph of `PONYTAIL-AUDIT.md` would conflict.

Deleting the ledger would delete a requirement. That is a spec decision,
not a cleanup.

**Finding 16 undercounts.** The audit lists ten sites. `routes.ts:455` is
an eleventh of the same shape. `routes.ts:115` is a twelfth, inside
`parseJsonBody`.

**Finding 39's `requireNonBlank`/`requireString` pair is two rules, not
one.** The audit says they "differ by a length bound". Read side by side
they differ three ways:

| | `requireNonBlank` (:191) | `requireString` (:430) |
|---|---|---|
| rejects | `!value.trim()` | `raw.length === 0` |
| bounds length | no | `MAX_KEY_LENGTH` |
| message | `<label> must not be empty` | `<label> is required` |

A merged helper picks one rejection rule for both. `"   "` passes
`requireString` today. The pick decides whether a data-list key of spaces
still passes. `requireNonBlank`'s comment already records why it returns
the untrimmed value. Trimming a password would store a different secret
than the operator typed. Two rules that agree in shape and disagree in
what they admit are not one helper.

**Finding 39's `resolveActor` inline costs 60 edits.** Its body is
`resolver(req.headers, db)`, three lines with the signature. `grep -c` over
`src` counts 60 call sites. The `dedup-server-helpers` change of 2026-08-04
created this helper by collapsing four copies, and `routes.ts:130-134`
carries the comment saying so. Inlining reverses that change to save three
lines and spreads the resolver-calling convention over 60 sites.

## Risks / Trade-offs

- `parseVersion` takes `unknown`, so the seven studio call sites lose a
  compile-time check → the runtime rule does not move.
  `Number(raw)` was already total. A value that is not an integer still
  raises `RequestShapeError`. What a caller loses is the compiler refusing
  an object at the call site. It gains the same 400 the admin caller has
  always answered with.
- A collapsed site drops its `let`-then-assign for a `const`. The build
  breaks where the original code assigned that variable again →
  `bun run typecheck` catches it at every one of the eleven sites. Convert
  that site back to `let`.
- `readJson` moves out of `admin-routes.ts` while a sibling agent edits the
  same file → the change touches four files in one layer. Land it in one
  commit, not per file.
- The zod rewrite changes one throw message → no test pins that text. The
  throw still names the entry index. An operator reading a log sees the
  same information.
- The zod rewrite stops rejecting an input the hand-written check rejected →
  `test/auth-server.test.ts:77-82` is the net. It pins `.toThrow()` for
  `"not json"`, `"{}"` and `[{ iss: "x" }]`. All three must still throw.
  `"{}"` is the non-array case, so the empty-path message must read
  correctly.
- `readJson` types the body as an object, so a runtime guard on that same
  fact reads as dead → `account-routes.ts:123` runs one:
  `typeof raw !== "object" || raw === null || Array.isArray(raw)`. Today
  `raw` is `unknown` there and the guard is plainly load-bearing. Keep it,
  and comment why. Delete it and an array body reaches
  `parseAccountChanges`.

## Migration Plan

No deploy step and no data step. The change edits five source files, one
delta spec and two documents. It lands in one commit, per the second risk
above.

Rollback is `git revert` of that commit. No published body, no stored row
and no running instance sees any of it.

## Open Questions

- Do the eleven casting sites move onto `parseJsonBody(req, schema)` with
  shallow envelope schemas, and when? `http-wrapper/spec.md:1213` asks for
  it. That change rejects bodies the casts accept today, on eleven routes.
  So it needs its own delta and its own tests. It does not change what this
  change builds. Answer it after this one lands.
