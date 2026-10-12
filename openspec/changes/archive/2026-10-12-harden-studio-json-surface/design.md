# Design

## Context

`checkDraftShape` in `packages/web/src/areas/studio/draft/load-guard.ts` is
the only guard between a typed JSON text and `replace()`. Its one caller is
`parseDraftText`, which `JsonView.apply` runs. It checks that the root is an
object. It flags any top-level key outside `KNOWN_KEYS`. It checks the type of
eight top-level keys, `key` plus seven containers. It checks nothing below the
top level.

`processBody` declares eleven top-level keys and `KNOWN_KEYS` lists ten.
`collaboration` is the missing one. The studio also reads containers below the
top level with no type check. `railOrder.findIndex` and
`collectChainingActionSites` assume `workflow.steps` is an array. Other panels
read each step's `paths`, `timers`, `onEntry` and `view.fields` the same way.

`Draft` is a deep partial of the authored body (`DraftOf`). A draft may omit
any key, so the guard cannot demand a key. It can only check the type of a
key that exists. `draft/validation.ts` (`runValidation`) already parses a
draft through `authoredProcessBody` and reports invariant violations on the
Checks tab. The guard stays out of that job.

`proposal.md` holds the motivation. The owner ruled on 2026-10-12 for the
table approach below.

## Goals / Non-Goals

**Goals:**

- Apply accepts every body whose keys the definition contract declares.
- Apply refuses every body in which the studio would iterate or index a
  container of the wrong type.
- A new schema key that the guard misses fails a test before it fails a user.

**Non-Goals:**

- Business validation. A step with no path still applies and appears on Checks.
- Leaf types, such as a `label` entry that is a number or a `priority` that is
  a string. The guard checks containers only, and React renders some leaves
  directly. An object typed where a string belongs still passes the guard and
  can unmount the studio on the next paint. Examples are a `contract.outcomes`
  element that `ContractPanel` draws in `<span>{o}</span>`, a `fields[0].key`
  that is an object, and a `LocalizedText` value that is an object.
- A change to `src/schema/definition.ts` or to the layout of the JSON surface.
- A check below a union. The children of a view entry, such as its
  `validation` object, stay unchecked.

## Decisions

**1. One table describes the containers, and one walker applies it.**
`load-guard.ts` gains a `Shape` type and a constant `DRAFT_SHAPE`.

```ts
type Shape = {
  objects?: Record<string, Shape>;
  arrays?: Record<string, Shape | "strings">;
};
```

An `objects` entry names a key that holds a plain object. Its value describes
that object's own keys. An `arrays` entry names a key that holds an array. A
`Shape` value says each element is a plain object with those children. The
value `"strings"` says the guard skips the elements. The field shape refers to
itself through `fields`, so the guard checks a nested group at any depth.

The walker visits a key only when it exists and is not `undefined`. A key of
the wrong type, `null` included, yields a `{ path, message }` pair. The path
reads like `workflow.steps[2].paths`. The message keeps today's wording:
`'workflow.steps' must be an array if present`. A non-object element yields
`'workflow.steps[2]' must be an object`. The walker descends into a container
only after its type check passes.

The existing top-level checks fold into the same table. The `key` string check
stays beside it, since the table holds containers only. Every existing message
and path stays byte-identical, so `studio-load-guard.test.ts` keeps passing.

Alternative rejected: run `authoredProcessBody.safeParse` before `replace()`.
A draft is a deep partial, so each omitted key reports as `invalid_type`. The
code would filter those out and then rule on which Zod codes count as
structural. That second rule goes stale as easily as a list. It also
contradicts the spec's statement that the guard checks known keys.

**2. The guard refuses `null`.** The top-level checks already refuse `null`
for a container. The schema admits none. The studio reads `?? []` in places,
so `null` does not crash everywhere today. One rule at every depth beats a
rule per site. The comment above the `null` tests in
`studio-fieldRemoval.test.ts` says the JSON surface can load a `null`
container. That stops being true, so the comment changes. The tests stay,
since the functions should still tolerate a `null` container.

**3. A schema-walking test ties the table to the schema.** The test walks
`processBody` with the Zod 4 definition API. It unwraps `optional`,
`nullable`, `pipe` and `lazy`. It follows `array` elements and `object`
shapes. It lists every path whose node is an array, an object or a record,
and it skips leaves. A union counts as an object only as an array element
whose options are all objects. That is the `viewEntry` case, so
`view.fields[]` gets a row and nothing below it does. Every other union is a
leaf. A lazy node seen twice ends the walk with a `(recursion)` marker. The
getter builds a fresh schema on each call, so the walk keys on the lazy node.
The test flattens `DRAFT_SHAPE` into the same path strings, with the same
marker where the table refers to itself. The two lists must be equal.

The walk ran in the container during design. It lists about seventy container
paths for the current schema. Suppose the body gains an array or object key
and the table gains no row. The test then fails and names the path.

The walk lives in a test helper, `packages/web/test/zodContainerPaths.ts`. It
exports `containerNodes(schema)`, which returns `{ path, kind, schema }` for
each container. The load-guard test maps the nodes to paths. The changeSet
test reads the object nodes' declared keys.

**4. The guard exports `KNOWN_KEYS`, and a test checks it.** The test compares
the set to `Object.keys(processBody.shape)`. Zod 4 keeps `.shape` on the
refined object, and `studio-changeSet.test.ts` already relies on that. The set
gains `collaboration`. The table gains `objects: { collaboration: {} }`.

**5. The two mirror tests derive their lists.**

- `studio-sectionsFor.test.ts` gains a map from every key of `step.shape` to a
  section name or to `masthead`. The test fails on an unmapped key. It also
  fails on a mapped section that `sectionsFor` never stands for any kind. The
  map sends `outcome` to `howItEnds`, `onCancel` to `exit`, and the identity
  keys to the masthead, as the audit recorded.
- `studio-changeSet.test.ts` keeps its named `shapes` list, because
  `OWNED_LISTS` uses those names. The list stays as it is. Its word-coverage
  test demands a word for every key, and three shapes read without one:
  `collaboration` shows as a JSON object, `assignment` shows by its strategy
  word, and an expression shows as one CEL leaf. A new test uses the container
  walk. It requires that every object schema with declared keys under
  `processBody` has a listed shape with the same key set, or sits in a short
  exemption list in the test. Each exemption carries its reason. A new nested
  object in neither place fails the test.

**6. The layout does not change.** The refusal uses the existing inline error.
Only the message grows a longer path. `/impeccable shape` reduces to a copy
check. The browser check confirms that the message reads well and that the
studio stays mounted.

## Risks / Trade-offs

- [The table is one more hand-kept list] → The totality test fails on any
  container the schema adds. The list cannot go stale silently. That closes
  the E1-1 case.
- [`null` loaded before and now stops Apply] → The schema never admitted it.
  Task 1.4 greps `examples/` and the web tests for a body that relies on it.
- [A wrong leaf type unmounts the studio] → The table stops at leaf types.
  A leaf typed wrong passes Apply and fails on the next paint. A `ponytail:` comment on the table records the ceiling. An open entry in
  `docs/decisions.md` carries the follow-up for a later change.
- [The test reads Zod's internal definition API] → The same
  `_zod.def` access exists in `studio-changeSet.test.ts`. A Zod upgrade that
  renames it fails one named test.
- [The sectionsFor map is hand-kept too] → The test reads `step.shape`, so a
  new step key fails until someone maps it. That is the intended prompt.
- [Many malformed siblings list one line each] → The error region already
  prints one line per entry and wraps. A typo makes one or two lines. A cap
  would add behavior nobody asked for.

## Migration Plan

Nothing deploys. The change edits studio code and tests only. It stores no
new state. `definitionHash` and every published version stay as they are.
Rollback means reverting the commit. A draft held in the browser keeps its
body, because the guard runs only at Apply.

## Open Questions

None.
