## Context

The repo already has an explicit, written placement rule for validation
(`compile.ts:54-67`, restated in `CLAUDE.md`): checks that may tighten over
time live on the **write** path, never as Zod refinements, because
`definition.ts` is also the deserializer for stored immutable bodies — a
tightened refinement would make an already-published definition throw on READ
and its pinned instances unrehydratable. `validateDurations`, CEL checking and
plugin-config validation all follow it.

The rule is right and the six defects here are what happens where it was not
applied, or where it was applied to a code path that turned out to be
skippable:

- `validateDurations` runs *before* `compileProcessBody`'s idempotent early
  return, and is therefore unbypassable. The reserved-prefix ban lives in
  `authoredProcessBody`, *after* that return, and is therefore bypassable by
  any body that satisfies `publishedProcessBody` — which checks only the
  cancel-sink count.
- Unknown-key rejection, pattern compilation, key format and length bounds
  were never written at all, so Zod's default `strip` and JavaScript's
  permissiveness are the current policy.
- The two unresolved id positions have a sibling check (`Action.output`
  targets) that lives in the base `processBody` superRefine — i.e. on the read
  schema, predating the placement rule.

## Goals / Non-Goals

**Goals:**

- One placement that cannot be bypassed by either compile branch, used by
  every check this change adds.
- A body that says something the author did not mean — a misspelled key, an
  unresolvable target, an uncompilable pattern — is a publish error with a
  located issue, not a silently different process.
- Engine-internal action dispatch stays out of an author's reach even when the
  author writes the JSON by hand.
- No already-published body becomes unreadable.

**Non-Goals:**

- Making the base `processBody` schema strict. It is the read path; strictness
  there is exactly the failure mode the placement rule exists to prevent.
- Bounding the *instance data* payload a participant submits on a `file`- or
  plugin-typed field. `JS_TYPE.file` is `"any"` and `typeMatches` returns
  early for it by design; giving those a size policy is a data-model decision
  (what is a file field, where does its content live) rather than a validation
  gap, and it is not resolved by a `.max()` on an authored string.
- Regex complexity analysis (ReDoS detection). Compiling the pattern and
  bounding the *input* it runs against is the part that is decidable; deciding
  whether an arbitrary regex backtracks is not.
- Rate limiting or quota-ing the draft table by process count. The row bound
  this change adds is per-payload; a per-tenant quota is a different
  capability.
- Changing what `saveDraft` validates about a draft *body*. A draft under
  construction legitimately violates authoring invariants, which is why it
  stores as authored — only the envelope grows a size check.

## Decisions

**Every new check runs in `compileProcessBody` before the idempotent early
return.** This is the spine of the change. It gives one answer to five
otherwise separate placement questions, and it is the only position that is
simultaneously (a) on the write path, so stored bodies never re-validate
against a tightened rule, and (b) ahead of the branch that SEC-3 shows is
reachable with authored input. The alternative the review suggests for the
reserved prefix — moving it into the base `processBody` superRefine — is
rejected below.

**The reserved-prefix ban moves; the cancel-sink identity checks do not.**
A *compiled* body legitimately contains a step with `id: step_cancel_sink`,
`key` the reserved key, and (for a contracted process) `outcome: "cancelled"`.
Moving those three checks into `processBody` would reject every compiled body
on read — the review's parenthetical "ideally the whole reserved-identity
check" is wrong for that reason. Only the action-prefix ban generalizes,
because the compile pass injects no `core.*` action into any authored
position: the two internal actions are synthesized at runtime
(`transition.ts:251` and `:276`) and never stored in a body. So the prefix ban
is safe to apply to *any* body reaching the compile pass, on either branch,
which is exactly what the compile-pass placement gives it.

**The two id-resolution checks go in the compile pass too, not beside their
sibling in the superRefine.** Their sibling — "action output targets unknown
field" — lives in the base `processBody` superRefine and predates the
placement rule. Following it would tighten the *read* schema: a body already
published with an unresolvable `outputMapping` key currently runs fine (the
patch simply lands under an id nothing declares), and making it unreadable
would take its running instances down. Consistency with a sibling is worth
less than not breaking a live instance, and `CLAUDE.md`'s rule is explicit
about which way to resolve that. The cost is that id resolution now lives in
two places; the compile pass's issue list is where new ones go from here.

**An unknown-key walk, not a deep-`.strict()` schema variant.** Building a
parallel deep-strict variant of every object schema means a second schema tree
that must stay in lockstep with the first — a drift surface in the one file
`CLAUDE.md` says to change deliberately. A walk over the authored value
against the known key set produces the same rejection with one traversal, in
the same located-issue shape as `validateDurations`, and it works identically
on both compile branches. It also reports *all* unknown keys at once, which
`.strict()` does per-object but with Zod's own path shape rather than the
repo's.

**Reject unknown keys rather than preserving them.** The alternative — keep
them and hash them — is worse: `definitionHash` would cover content the read
schema strips back out, so a pin would be unreproducible, which is the reason
`compile.ts:111-114` stores the parse output in the first place. Rejection is
the only option that keeps the hash honest and the author informed.

**`pattern` is compiled at publish and cached per body at runtime.** Compiling
at publish turns a permanently-bricked step into a 422 the author can fix
before it exists. The runtime cache is keyed by the immutable published body,
which is a legitimate cache key precisely because the body cannot change —
the same property that makes `definitionHash` meaningful. Bounding the pattern
*source* length is a blunt instrument, but it is the decidable half of the
ReDoS problem; the other half is bounding the subject string, which is the
next decision.

**The pattern test runs only if the length constraints passed.** Today
`maxLength` records a violation and falls through, so an oversized value is
still fed to the regex — the submission is going to be rejected anyway, so
running a potentially catastrophic backtrack on it is pure downside. Ordering
the checks costs nothing and removes the unbounded-input half of the hazard
for any field whose author declared a `maxLength`. A field without one is
still bounded by `maxRequestBodySize`, several orders of magnitude worse but
no longer 128 MiB.

**`/^[a-z_][a-z0-9_]*$/` for `FieldDef.key`.** It is the intersection of a CEL
identifier and this repo's existing slug style, it is what
`data.<key>` requires to be referenceable at all, and it is checkable in one
line. Uppercase is excluded deliberately: the catalog already treats keys as
lowercase slugs, and allowing `myField` and `myfield` to coexist adds a
collision class the uniqueness check would then have to reason about.
`Step.key`/`Path.key` are *not* constrained here — they are display/reference
slugs that no interpreter reads, and constraining them would be scope creep
with a migration cost for existing bodies.

**Bounds are generous and named, not tuned.** `key` and `Plugin.type` in the
low hundreds, `duration` small, `Expression.src` and `pattern` in the low
thousands, `maxRequestBodySize` a few megabytes — sized to the largest
plausible legitimate definition, not to the smallest thing that works. A bound
that a real author trips is a bug report; a bound that stops a 128 MiB request
is the entire point. Exact values are set in the tasks so they live in one
place.

**Drop `checkActionRegistry`'s reserved-prefix filter and give the internal
handlers config schemas — as defense in depth.** With the compile-pass ban in
place, no body reaching the registry check can carry a `core.*` action, so the
filter is dead code either way. Removing it means that if some future path
does produce one, it is validated instead of waved through; adding
`configSchema`s to the spawn and return handlers (`{subprocessStepId,
parentSeq}` and `{parentInstanceId, childOutcome}`) means a forged config is
rejected on shape even then. Neither is load-bearing on its own, and the
change should not be described as if either were the fix.

## Risks / Trade-offs

- **Existing example and fixture bodies may fail to publish** after the
  unknown-key and key-format checks land → Intended and bounded: they are in
  the repo, they are validated by the suite, and a fixture that only worked
  because of stripping is a fixture that documents the wrong contract. Fixing
  them is part of this change, not follow-up work.
- **The unknown-key walk must know the full schema shape**, and can drift from
  `definition.ts` when a key is added → Real. Mitigated by deriving the
  accepted key set from the Zod schemas where Zod exposes it (`.shape`),
  rather than transcribing key lists by hand; where a schema is a `z.lazy`
  recursion or a union, the walk follows the same `collectFieldsDeep`-style
  traversal the repo already uses. A test that adds a key to a schema and
  expects the walk to accept it is what pins this.
- **Studio's live validation runs the engine's publish-time validators against
  the compiled body** — every new check will therefore surface in the editor
  as a validation issue → Desired, and the reason the located-issue shape
  matters. Studio's issue rendering must be checked against the new issue
  types before this lands.
- **A published body that today carries an unresolvable `outputMapping` key
  keeps working**, since the check is write-path only → Accepted, and the
  deliberate consequence of the placement rule. Such a body is diagnosable
  from the admin record (the patch lands under an undeclared id) and fixable
  by publishing a corrected version.
- **`maxRequestBodySize` applies to every route, including publish and draft
  save**, so an unusually large legitimate definition would be rejected at the
  transport edge with a Bun-level error rather than a typed 4xx → Sized with
  headroom, and the failure is loud and immediate rather than silent. If a
  real definition ever approaches it, the bound moves in a reviewed commit.
- **Six checks in one change is a wide diff** → They share one placement, one
  issue shape, one test convention and one failure surface (422 with located
  issues). Splitting them would mean writing that placement decision six
  times and re-validating the examples six times.

## Migration Plan

No data or schema migration; no stored body is re-parsed under a new rule.

1. Land the compile-pass checks together with the corrected examples and
   fixtures, so the suite is green in one commit.
2. Authors with drafts in flight see new validation issues in Studio the first
   time they validate after deployment. Drafts themselves are unaffected —
   they store as authored and are only checked at publish.
3. `maxRequestBodySize` and the draft envelope bound take effect on restart;
   no client change is required, since no client sends anything near them.
4. Rollback is reverting the commit. Bodies published while the change was
   live remain valid under the looser rules, since every new check is strictly
   narrower than what came before.

## Open Questions

- Should the unknown-key walk also run on a *draft* save, as a warning rather
  than an error? It would catch `gaurd` at the moment it is typed rather than
  at publish. Deliberately out of scope: drafts are explicitly allowed to be
  invalid, and Studio already runs the publish validators on demand.
- Should `Step.key` and `Path.key` eventually take the same identifier
  constraint as `FieldDef.key`? Only if something starts reading them as
  identifiers. Recorded here so the asymmetry is visibly intentional.
