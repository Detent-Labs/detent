## Context

`instance-audit-log-chain` (archived) built `instance_audit`, its two
triggers, `instance_audit_append`, `verify_instance_chain`, and
`redact_instance_fields(instance_id, actor, reason, transition_seq)`. That
last function currently redacts every distinct `field_id` the instance's
own audit entries hold, covering every change. Its design.md already
named the gap this change closes: *"The field-id argument arrives in
change 2, once `FieldDef.redactable` narrows the set."*

`redact_instance_fields` is `SECURITY DEFINER`, owned by
`detent_audit_owner`. It reads only its own arguments. It has no access
to `definitions`, a table the engine's connecting role owns, not the
audit owner. It could not resolve `FieldDef.redactable` itself even if it
wanted to. TypeScript has to resolve the set of field ids to clear before
the call, and pass it in.

`redactInstance` (`src/engine/retention.ts`) today parses `instances.body`
into an `Instance` and never touches a process definition. It knows
`inst.processId` and `inst.version`: the instance's *currently pinned*
version. That is the latest version a migration moved it to, or its
original version if it was never migrated. See proposal.md for why this
change exists.

## Goals / Non-Goals

**Goals:**
- Resolve a redactable field-id set from the instance's currently pinned
  definition and pass it into `redact_instance_fields`.
- Narrow the SQL function to clear only that set, leaving every other
  field's history untouched.
- Cover the interaction between `redactable` and a migrated instance. Use
  an explicit, testable rule, not an implicit default.

**Non-Goals:**
- No admin-facing read view for the audit log (separate change against
  `admin-app`; `verifyInstanceChain` already has no caller and stays that
  way here).
- No Field Catalog builder toggle for `redactable`. `technical` has one
  (`FieldCatalogPanel.tsx`'s `technicalChecked`/`toggleTechnical`). This
  change deliberately skips the equivalent for `redactable` in the same
  pass. For now, an author sets it through the JSON view. That is the
  same escape hatch the root `CLAUDE.md` names for "what no builder
  expresses." A no-code toggle is a `packages/web`-only follow-up against
  the studio's field-catalog capability. It carries no schema or engine
  dependency on this change beyond the flag existing.
- No mechanism to redact a field id that no longer exists in the
  instance's currently pinned version's catalog. See "Risks / Trade-offs".
- No change to `instance_audit_diff()`, `instance_audit_append()`, the
  hash chain, or the salting scheme. Every row is already salted
  regardless of `redactable` (`instance-audit-log-chain` design.md, "The
  trigger salts every row's value_hash").
- No change to the existing `instances.body.data` wipe or the
  `instance_comments`/`instance_attachments`/`instance_drafts` deletes
  `redactInstance` already performs. Those are unconditional today and
  stay unconditional; `redactable` scopes only the audit-log entries.

## Decisions

### The currently pinned version's catalog is the sole source of truth for `redactable`

`redactInstance` resolves `FieldDef.redactable` from
`createDefinitionStore(db).resolveBody(inst.processId, inst.version)`.
That is the instance's version *right now*, at redaction time. It never
resolves from the version active when a given `instance_audit` row first
recorded its entry.

Alternative considered: resolve each row's own version via its
`transition_seq` (joining to `history_entries.version`), and apply that
row's own catalog. Rejected, for three reasons:

- It requires a per-row join against a table this function does not
  otherwise touch. That join would serve one case: a field's `redactable`
  flag flipping between an instance's versions. Nobody has asked for that.
- It still needs a decision for `transition_seq = 0` rows written at
  creation. Those do not reliably resolve to a `history_entries` row
  today.
- The simpler rule is one flag, from one version, decided once at
  redaction time. It needs an operator to check only the current field
  catalog, not history. It matches what the field catalog says *today*,
  not what it said when someone wrote a particular value.

`checkTechnicalFields`-style precedent (a publish-time rule) does not
transfer here. This is a read-time resolution over already-published,
immutable bodies, not a new publish check.

### A field id absent from the current catalog stays uncleared

An author may later remove a field from the catalog entirely. A new id
might supersede it, or the process owner might drop the field outright.
When that happens, the instance's audit log may still hold entries under
the old field id.

The currently pinned version's catalog then has no entry to check
`redactable` against. `redact_instance_fields` leaves that field alone.
It treats an untracked field id the same as an explicit `redactable:
false`, never as `redactable: true`.

Alternative considered: default an unresolvable field id to redactable.
That is a fail-safe: a value then never becomes permanently unerasable
through no fault of the author. Rejected for this change.

`redactable` is deliberately an opt-in flag. `docs/decisions.md` frames
Change 2 as narrowing `redact_instance_fields()`'s field selection to the
fields a process author marks redactable. It is not "redact everything
except what's marked safe."

Defaulting a deleted field to redactable inverts that model instead of
extending it. It would make the one case where the author's own intent
is least knowable. That same case is also where the engine erases
history most aggressively.

An author who anticipates deleting a field can keep it in the catalog
instead, unused by any step's view. That keeps its history erasable.

This is a named, accepted limitation, not a silent gap. See "Risks /
Trade-offs". `docs/decisions.md` carries an entry for it, so it stays
visible and revisitable.

### `redactable` and `technical` are orthogonal; only `group` restricts `redactable`

A `technical` field's value is engine-written, not participant-written.
But engine-written is not the same as "never personal data." A
`columnMapping` attribute can copy a name or an address in from another
process's instance. No rule links the two flags.

A `group` field carries no value of its own. `technical`'s existing
restriction on `group` reasons the same way. Publish therefore rejects
`redactable: true` on a `group` field, mirroring `checkTechnicalFields`.

This lands as its own small structural check in `src/schema/compile.ts`.
It runs alongside `checkTechnicalFields`, in the same pre-Zod-parse pass
(`structuralIssues`). `checkTechnicalFields` runs there rather than as a
`fieldDef` Zod refinement, for the same reason. It walks the field tree
with located-issue reporting shared by all publish-time structural
checks. It also runs on the raw duck-typed body. A hand-authored body
therefore cannot bypass it by merely satisfying `authoredProcessBody`'s
own `safeParse`.

### Redaction resolves the field-id set once per call, not from a cache

`redactInstance` already runs inside one transaction and already holds
`inst.processId`/`inst.version`.

`createDefinitionStore`'s own `resolveBody` is process-local-cache-backed
and keyed on `(processId, version)`. Published versions are immutable,
so a cache hit is never stale.

`redactInstance` constructs a fresh store per call today. It has no store
parameter. This change adds one, matching the pattern `admin-routes.ts`
and other call sites already use when they need `resolveBody`.

## Risks / Trade-offs

- **A deleted redactable field stays unredactable.** See "Decisions"
  above. This change builds no mitigation. The spec
  (`instance-audit-log`, "A field removed from the catalog keeps its
  history") and `docs/decisions.md` both name the limitation. A future
  change can revisit it if it becomes a concrete ask, per this repo's own
  do-not-build-ahead-of-an-ask convention.
- **Migrating an instance mid-request creates no new race exposure.**
  `redactInstance` already takes `FOR UPDATE` on the instance row before
  resolving anything. Migration and redaction both run under that lock.
  The version this change reads is the same version the rest of the
  function already treats as authoritative.
- **`resolveBody` returning `undefined`.** This can only happen if
  `inst.processId`/`inst.version` do not resolve to a row in
  `definitions`. That is not reachable for a real instance, since
  instance creation requires a published body at that exact pin. This
  change treats it as a fault (it throws), not a redaction no-op. That
  stays consistent with how the rest of the engine treats a missing
  pinned definition.

## Migration Plan

No data migration runs. `redactable` is a new optional key. Every
already-published body reads as if every field declared `redactable:
false` (absent). No already-redacted instance's audit log changes
retroactively. No already-published, non-redacted instance changes
either. The new behavior only takes effect the next time
`redact_instance_fields` runs.

`examples/` gets at least one field marked `redactable: true`, so the
flag has a live demonstration. This is additive to an example body. It
does not change any existing instance created from it. Examples are
templates, not live data.

Rollback: revert the `redact_instance_fields` signature and body to the
Change 1 shape (select every distinct `field_id`, no argument). Drop
`FieldDef.redactable` from the schema. No stored data depends on the flag
existing. A `redact` entry produced under the narrowed rule is
indistinguishable in shape from one produced under the old rule.

## Open Questions

- **A deleted redactable field stays unredactable.** Named in "Risks /
  Trade-offs" above, and in `docs/decisions.md`. This is a deliberate
  opt-in-flag consequence, not an oversight. Revisit only if a concrete
  request for a fail-safe default (redact-on-delete) surfaces, per this
  repo's do-not-build-ahead-of-an-ask convention.
- **Row-level, per-version `redactable` resolution.** "Decisions" above
  rejects joining each audit row to the version active when someone wrote
  it. It favors one flag from the currently pinned version, decided once
  at redaction time. Revisit only if an author asks for a field's
  `redactable` flag to bind per-value rather than per-instance.
