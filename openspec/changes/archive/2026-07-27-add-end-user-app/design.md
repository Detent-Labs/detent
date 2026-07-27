## Context

`packages/editor` already contains a Player screen that drives one instance
through the HTTP wrapper — a preview inside an authoring tool, not a product.
It holds a single instance at a time, has no task list, no process picker, and
its `FieldInput.tsx` renders step forms for the editor's own benefit only.

The engine's Runtime API Layer (`createProcessInstance`, `getInstanceView`,
`submitAndTransition`, `claimStep`, `releaseClaim`, plus the `instance-query`
reads) already covers everything a participant-facing app needs functionally;
what's missing is the app itself, a place for form rendering to live once two
consumers need it identically, and a handful of small additive read/auth
surfaces.

## Goals / Non-Goals

**Goals:**
- Ship a standalone participant-facing app (login, inbox, task, start) that
  reuses the engine's existing Runtime API Layer with no new engine concepts.
- Make step-form rendering WYSIWYG between the editor's Player and the
  end-user app by sharing one package, not one copy per app.
- Keep the four engine-side additions small, additive, and reversible.
- Leave group/role-based assignment and a second data-source type as later,
  additive changes — nothing here forecloses them.

**Non-Goals:**
- Case history view, notifications, attachments, comments, delegation — all
  explicitly deferred past v1.
- The admin/developer area — a separate product, separate design.
- Any routing library, state-management library, or CSS framework dependency —
  four screens and one shared form package don't justify one.
- Group-based assignment itself — only the server-side seam (`scope=mine`)
  that keeps it a later additive change instead of a client-visible rewrite.

## Decisions

**Three packages, one dependency direction.** `app → form-ui → workflow-engine`
and `editor → form-ui`; `form-ui` knows neither app. This is the only shape
that makes the WYSIWYG requirement structurally true — if `form-ui` depended on
either app, or the two apps each vendored their own copy, editor preview and
end-user rendering could drift silently. `form-ui` is source-only (an exports
map pointing at `.tsx`, like the engine package does) — no build step, no
version to keep in sync between three workspace packages that always deploy
from the same tree.

**Hand-written routing over a router dependency.** Four routes
(`/`, `/tasks/:instanceId`, `/start`, `/login`) is a ~30-line History-API hook,
not a reason to add `react-router`. Task URLs stay directly shareable
(`/tasks/:instanceId`) either way.

**JWT in `localStorage`, 401 drives logout.** Matches the pattern already
proven in the editor's Player (see `jwt-authentication`, `editor-player`'s
session-persistence requirement). No client-side expiry tracking — a `401` is
the single source of truth for "the session is over," so there is exactly one
code path to get right instead of two (an expiry check that can drift from the
server's clock, and the 401 handler).

**Server-derived `scope=mine`, never a client-supplied `assignedTo`.** The
client must never send `assignedTo=<my-id>` — it asks for `scope=mine` and the
server resolves what "mine" means from the authenticated actor. This is what
keeps a future group-based assignment extension (`Step.assignment.candidates`
gaining an optional `groups` filter matched against `Actor.roles`, which the
JWT resolver already populates) entirely server-side and invisible to the app.
The alternative — the client computing or supplying the actor id — would need
every consumer of the endpoint to change when groups arrive.

**Create-on-click for "Start a process," not a pre-instance preview.** Selecting
a process immediately calls `POST /processes/:id/instances` and navigates to
the resulting task screen, rather than rendering the initial step's form before
an instance exists. The alternative needs a second endpoint duplicating
`getInstanceView`'s visibility/requiredness/data-source resolution — real
implementation cost for a preview nobody asked for, since starting is already
a single click.

**Explicit Claim, not auto-claim on open.** Opening a task must not lock it for
other candidates — a user should be able to check whether a task concerns them
before taking it. Auto-claim trades one click for daily orphaned locks whenever
someone merely looks at a task. Implicit claim-at-submit was also rejected:
two users could fill the same form concurrently and one would silently lose
their input, and the engine already enforces claim-before-submit regardless, so
skipping the explicit step wouldn't remove the constraint, only hide it until
submit fails.

**`field-input-rendering-consolidation` retires in place; its requirements
move to `form-ui`, they don't get invented fresh.** That spec is explicitly
scoped to `packages/editor/src/player/FieldInput.tsx` as a mechanism-level
concern ("not user-visible behavior — the actual contract is `editor-player`'s
'Field rendering covers every BaseFieldType'"). Once the file relocates out of
the editor entirely, the spec's subject no longer exists there. The delta
formally REMOVEs it from `field-input-rendering-consolidation` (reason:
relocation) and ADDs the equivalent structural requirements under `form-ui`,
so the shared-rendering guarantee that was true of the editor's copy is true
of the one real copy, with no gap where the removed code carries no explicit
mechanism requirement anywhere in `openspec/specs/`.

**`editor-player`'s spec is untouched.** Its requirements describe observable
Player behavior ("the Player's field renderer SHALL render a usable input for
every `BaseFieldType`"), not which package the renderer lives in. That contract
holds unchanged once the Player calls into `form-ui` — this is why the
capability isn't listed as modified in the proposal.

**Starter-cancel checks the role first, only loads the instance if the role is
absent — and a role-less rejection stays opaque to instance existence.** The
existing cancel route runs its `system:cancel-any` check before loading the
target instance at all, on purpose: a caller without the role is rejected
regardless of whether the instance exists. Adding `startedBy === actor.id` as
a second, independent path necessarily needs `startedBy`, which only the
loaded instance carries — so that absolute "never loads first" framing narrows
to "never loads first when the role is present." An actor holding
`system:cancel-any` still gets the original fast, load-free path unchanged.
For a role-less caller, the load itself can now fail two ways — the instance
doesn't exist, or it exists but isn't theirs — and an existing test (correctly)
insists both collapse to the identical opaque `403` a role-less caller always
got before this change, rather than the load's failure mode leaking through as
a different status code. The implementation therefore catches *any* load
failure in the role-less branch and rethrows the same `AuthorizationError`,
rather than letting a "not found" propagate as-is.

**Two new engine surfaces are additive fields, not new endpoints.**
`processLabel`/`stepLabel`/`currentStepEnteredAt` join the existing
`InstanceSummary` shape and `scope=mine` joins the existing `GET /instances`
query params — an old caller of either sees no behavior change. Labels resolve
through the existing cached definition store; only the two labels are shipped,
never the whole process body, since that would expose guard/action config
(URLs, headers) to end-user browsers that have no business seeing them.

## Risks / Trade-offs

- **Two workspace packages consuming `form-ui`'s exports map at once** →
  Mitigation: it's source-only (no build, no versioning), so there's no
  publish-lag or version-skew failure mode to guard against; a change to
  `form-ui` is visible to both consumers on the next `bun install`/dev-server
  reload, same as the engine package today.
- **`currentStepEnteredAt` is absent on instances created before this change**
  → Mitigation: the design already specifies a display-only fallback to
  `startedAt`; no backfill migration needed, and the field is monotonically
  populated going forward from the step-entry patch that already exists.
- **A personal inbox in practice needs no cursor handling, but the design
  still exposes one** → Mitigation: `GET /instances?scope=mine&limit=200`
  already supports keyset paging (`instance-query`); if a "load more" ever
  fires in practice, the client states plainly that client-side sort applies
  only to what's loaded, rather than silently sorting a partial page as if it
  were complete.
- **Retiring `field-input-rendering-consolidation` outright, rather than
  leaving a stub** → Mitigation: OpenSpec's REMOVED-Requirements delta format
  exists precisely for this; a stub capability with no live subject would be
  the kind of dead flexibility the project's ponytail conventions call out to
  delete, not preserve.

## Migration Plan

No data migration. Deploy order follows the design's stated implementation
order, each a separable, working state:

1. The four engine additions (`instance-query` + `http-wrapper` deltas) —
   purely additive fields/params/authorization, safe to deploy alone; no
   existing caller's behavior changes.
2. `packages/form-ui` extraction, with the editor's Player repointed at it.
   The editor must still work end-to-end at this checkpoint — this is the
   point at which `field-input-rendering-consolidation` is retired and
   `form-ui`'s equivalent requirements go live.
3. `packages/app` (routing, login, inbox, task, start), consuming both the
   engine additions from step 1 and `form-ui` from step 2.

Rollback at any step is a revert of that step's commits; no step depends on
irreversible state (no schema migration, no data backfill).

## Open Questions

None blocking — the source design document
(`docs/superpowers/specs/2026-07-27-end-user-app-design.md`) was already
reviewed and approved; this design translates it into OpenSpec deltas without
introducing new unresolved decisions. Two deferred, non-blocking items are
carried forward as documented future work, not open questions for this change:
group-based assignment (`Step.assignment` gaining an optional `groups` filter)
and a second, I/O-backed `DataSourceRegistry` type.
