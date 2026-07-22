## 1. Workspace promotion

- [x] 1.1 Add `workspaces: ["packages/*"]` to the root `package.json`,
      keeping its existing `name`, dependencies, and scripts intact (it
      remains the engine package's manifest).
- [x] 1.2 Add an `exports` map to the root `package.json` exposing exactly
      `./schema` -> `src/schema/definition.ts`, `./cel/check` ->
      `src/cel/check.ts`, `./schema/compile` -> `src/schema/compile.ts`.
- [x] 1.3 Create `packages/editor` with a minimal `package.json` declaring
      the engine as a local dependency (no editor source yet) — not
      `workspace:*`, since the root package is the workspace root, not a
      member matched by the `workspaces` glob (design.md decision 2).
      **Correction found during 1.4**: design.md/this task text say
      `"file:.."`, but that is one level short — `packages/editor/..` is
      `packages`, not the repo root. `bun install` fails outright
      (`Could not find package.json for "file:packages" dependency`)
      until this reads `"file:../.."`. Used the corrected path; design.md
      decision 2 needs the same fix.
- [x] 1.4 Run `bun install` at the repo root; confirm a single `bun.lock`
      resolves both the engine package and `packages/editor`, and that
      the engine dependency in `packages/editor/node_modules` is a
      symlink back to the repo root, not a copy.
      Verified: one `bun.lock` at repo root; `packages/editor/node_modules/workflow-engine`
      is a symlink (via `node_modules/.bun/workflow-engine@root/...`) whose
      target lists the real repo root files (`src/`, `test/`, `CLAUDE.md`, ...).
- [x] 1.5 Rename the root package's own `tsc --noEmit` invocation to a
      package-local script (e.g. `typecheck:engine`) and make the root
      `typecheck` script an orchestrator that runs it plus every
      workspace member's own `typecheck` script (design.md decision 8);
      verify the chosen fan-out mechanism (`bun run --filter`, or an
      explicit `&&` chain if the pinned Bun version lacks `--filter`)
      against the Bun version in `.devcontainer/Dockerfile`.
      Verified: `bun run --filter './packages/*' typecheck` works on Bun
      1.3.14 (host) and matches the 1.3.11 pinned in the Dockerfile
      (`--filter` has been supported since well before 1.3.x). Root
      `typecheck` is `typecheck:engine && bun run --filter './packages/*' typecheck`.
- [x] 1.6 Give `packages/editor` a placeholder `typecheck` script (even
      before it has real source) so the orchestrator from 1.5 has
      something to call; confirm `bun run typecheck` and `bun test` (with
      `DATABASE_URL` set) are still green from the repo root with no path
      changes to the engine's own `src`/`test`.
      Verified: `bun run typecheck` runs both scripts and exits 0; `bun test`
      with `DATABASE_URL` pointed at a local Postgres 16 container: 447 pass,
      0 fail, 0 skipped.
- [x] 1.7 Add a smoke import in `packages/editor` (temporary file, removed
      or superseded in task 2) that imports from the engine package's
      `./schema` specifier and confirm it resolves; confirm an import
      attempt of an unexported path (e.g. `src/engine/...`) fails to
      resolve.
      Verified: `import { authoredProcessBody } from "workflow-engine/schema"`
      resolves and runs; `import "workflow-engine/engine/store"` fails with
      `Cannot find module 'workflow-engine/engine/store'`.

## 2. Editor scaffold and Draft model

- [x] 2.1 Scaffold `packages/editor` as a React + Vite app (per
      design.md decision 5); add its own `tsconfig.json` (strict mode,
      DOM/JSX libs) and replace the task 1.6 placeholder `typecheck`
      script with the real `tsc --noEmit` invocation for this package.
      Verified: `bun run build` (Vite) succeeds; `bun run typecheck` from
      the repo root runs the real `tsc --noEmit` for `packages/editor` and
      exits 0.
- [x] 2.2 Add a lint rule (`no-restricted-imports` or equivalent)
      blocking `packages/editor` from importing any path under
      `src/engine/**` via relative import, closing the gap the `exports`
      map alone leaves open (design.md risk 2).
      Verified: `eslint.config.js`'s `no-restricted-imports` rejects a
      probe file importing `../../src/engine/transition` (error, exit 1)
      and passes on the real scaffold files (exit 0).
- [x] 2.3 Implement the generic `DraftOf<T>` recursive mapped type in
      `packages/editor/src/draft/types.ts` and apply it to the imported
      `AuthoredProcessBody` type (via `./schema`) to get the Draft's
      editing-time type; implement the separate, deliberately minimal
      `load-guard.ts` structural check used only for file-load safety
      (per design.md decision 3 — neither one re-declares the contract's
      business shape).
- [x] 2.4 Implement id-minting: a helper that generates a prefixed
      UUIDv4 id per entity kind at creation time, using the same prefix
      scheme as the contract.
      Implemented in `draft/ids.ts` by parsing `${prefix}_${crypto.randomUUID()}`
      through the contract's own branded id schemas (stepId, pathId, fieldId,
      actionId, timerId, dataSourceId) rather than re-declaring the prefix map.
- [x] 2.5 Implement `packages/editor/src/draft/validate.ts`: assemble the
      current Draft into `AuthoredProcessBody` shape and parse it through
      the real `authoredProcessBody` schema (via `./schema`), collecting
      every Zod issue rather than stopping at the first.
- [x] 2.6 Add a structural round-trip test: load each file in `examples/`
      as a Draft, re-export it, and assert the result is deep-equal to
      the original (design.md risk 1 mitigation).
      Verified, and surfaced a real inconsistency in `examples/`:
      `expense-approval.json` is a published `ProcessVersion` wrapper (body
      under `.definition`), but the two `subprocess-*.json` files are raw,
      unwrapped process bodies. `packages/editor/test/draft-roundtrip.test.ts`
      handles both shapes and passes for all three (4/4 tests).
- [x] 2.7 Add `packages/editor`'s test suite to the repo's CI/test entry
      point so it runs alongside `bun test`.
      No script change needed: Bun's default test discovery is recursive
      from the repo root (no `bunfig.toml` restricts it), so
      `packages/editor/test/*.test.ts` is already picked up. Verified:
      `bun test` from the repo root went from 19 files/447 tests (Group 1
      baseline) to 20 files/451 tests; full run with `DATABASE_URL` set
      against a local Postgres 16 container: 451 pass, 0 fail, 0 skipped.

## 3. Structural panels

- [x] 3.1 Build the field catalog panel: create/edit/delete process-wide
      fields.
      `panels/FieldCatalogPanel.tsx`. Recursive `FieldRow` handles the
      `group` field type's own sub-fields by rendering itself. A field's
      `type: BaseFieldType | Plugin` is a select of the ten base types plus
      a "custom (plugin)" option that reveals `PluginEnvelopeEditor`.
- [x] 3.2 Build the data sources panel: create/edit/delete process-wide
      `dataSources` entries (plugin envelope: `type`, `config`, plus
      `key`); wire the field catalog panel's `dataSource` picker to list
      them, and enforce the `options`/`dataSource` XOR in the field
      catalog panel itself (in addition to it surfacing as a validation
      issue from task 4).
      `panels/DataSourcesPanel.tsx`; the catalog panel's `dataSource` select
      lists `draft.dataSources`. XOR verified live in-browser: adding an
      option row disables the `dataSource` select, and vice versa.
- [x] 3.3 Build the steps panel, including per-step `view` overrides
      (visible/required/readonly/order/group) referencing catalog fields.
      `panels/StepsPanel.tsx` + `panels/ViewEditor.tsx`. **Note**: the
      contract's `ViewField` has no `order` property — order is the
      position within the `view.fields` array itself, so "editing order"
      is move-up/move-down buttons reordering that array, not a field.
      Also added (beyond the literal task wording, but required for a
      `subprocess`-type step to be structurally authorable, and per the
      editor-structural-panels spec's "every authorable entity in the
      Draft" requirement): `SubprocessSpecEditor` (processId,
      versionBinding, pinnedVersion/contractRef, input/output mapping) and
      an `assignment.strategy` plugin-envelope editor.
- [x] 3.4 Build the paths panel: manual vs. automatic trigger, guard CEL
      text entry, automatic-path priority editing, explicit display of
      trigger type per path.
      `panels/PathsPanel.tsx`. Verified live: `priority`/`guard` inputs
      only render once `trigger` is switched to `automatic`; trigger value
      is always visible per path row (never behind a detail view).
- [x] 3.5 Build the timers panel: duration/deadline XOR entry, deadline
      CEL text entry, `onFire` action list.
      `panels/TimersPanel.tsx`. A `kind` select swaps between the two
      exclusive representations (never both set at once), and
      `onFire.targetPath` is restricted to the owning step's own paths.
- [x] 3.6 Build the actions panel/sub-editor (shared across step
      onEntry/onExit/onCancel, path onPath, timer onFire positions):
      `{ type, config }` entry and `output` mapping CEL text entry.
      `panels/ActionListEditor.tsx`, used at all five positions (step
      onEntry/onExit/onCancel, path onPath, timer onFire.actions).
- [x] 3.7 Build the contract panel: input/output fields and outcomes for
      a process authored as a subprocess-callable child.
      `panels/ContractPanel.tsx`. Verified live: enabling "subprocess-
      callable" reveals input/output field checkboxes sourced from the
      flattened catalog and an outcomes list.
- [x] 3.8 Wire every panel to mint ids via the task 2.4 helper on entity
      creation and to write only through the Draft model (no direct
      state mutation bypassing it).
      Every `+ Add ...` handler calls `mintId(kind)`. All mutation goes
      through `draft/store.tsx`'s `useDraft().mutate` (an immer recipe) —
      no panel holds Draft data in local component state; local `useState`
      is used only for transient, non-Draft UI concerns (JSON-textarea edit
      buffers, which step card is expanded).

      **Group-level verification** (per the goal: confirm no breaks before
      continuing): `bun run typecheck`, `eslint .`, and `vite build` all
      clean; `bun test` from the repo root with `DATABASE_URL` set against
      a local Postgres 16 container — 451 pass, 0 fail, 0 skipped (no
      regression from the Group 2 baseline). Beyond static checks, actually
      ran the editor in a browser (Vite dev server + Playwright): added
      fields (including a `group` field with a recursive sub-field, and a
      `select` field verifying the live options/dataSource XOR), added two
      steps and a path between them (verifying automatic-trigger fields
      appear/disappear and `initialStep` auto-tracks), enabled the
      contract panel and added an outcome, and deleted a field and a step
      to confirm dangling-reference cleanup (e.g. `initialStep`
      recalculating) doesn't crash the UI. No console errors beyond an
      unrelated missing-favicon 404 throughout.

## 4. Live validation and issue mapping

- [x] 4.1 Wire `validateProcessBody` (CEL, via `./cel/check`) into the
      validation pass alongside the Zod parse from task 2.5.
      `draft/validation.ts::runValidation`. Runs against the *compiled*
      body (`compileProcessBody`, via `./schema/compile`) so a check sees
      exactly what publish would, matching `publishBody`'s own ordering
      and design.md decision 2's stated reason for exporting
      `./schema/compile`.
- [x] 4.2 Wire `checkActionRegistry`, gated on an injected `Registry`;
      render "not checked" for every action when no registry is loaded
      (per the editor-live-validation spec).
      **Blocked on a real gap found doing this task**: the Group 1
      exports map (`./schema`, `./cel/check`, `./schema/compile`) never
      included `checkActionRegistry`/`Registry`
      (`src/engine/registry.ts`/`registry-check.ts`). Confirmed both are
      pure (only import `zod` and `definition.js`, no DB/outbox) and added
      `./engine/registry` + `./engine/registry-check` to the root
      `package.json` exports map; corrected design.md decision 2 with the
      same annotated-correction convention as the task-1.3 `file:..` fix.
      **Also found**: after editing the exports map, `bun install` had to
      be re-run before the change was visible to `packages/editor` — a
      live-symlinked `file:` dependency does not pick up an `exports`
      map edit on its own.
      A `Registry`'s `HandlerDef.configSchema` is a live Zod schema, not
      JSON — it can't be "loaded" as pasted data, and evaluating pasted
      author JS to build one would be a real code-execution surface for a
      document editor with no server. v1 ships one built-in example
      registry (`registry/exampleRegistry.ts`, real `zod` schemas) an
      author can toggle on/off via `panels/RegistryPanel.tsx`; a real
      embedding would inject its own `Registry` object through
      `runValidation`'s existing parameter, the same way `publishBody`
      does.
      Verified live in-browser: an action shows a "registry: not checked"
      badge with no registry loaded; toggling the example registry on
      makes the badge disappear and a real `[registry] Required` issue
      appear for an `http.call` action missing its required `url` config.
- [x] 4.3 Wire `validateDurations`.
      Called directly (in addition to running inside `compileProcessBody`)
      so duration issues are always reported even though a duration
      failure aborts the compile the CEL/registry checks depend on —
      verified live: a malformed timer duration surfaces
      `[duration] unsupported ISO 8601 duration...` on that timer, and
      until it's fixed no CEL/registry issues appear at all (matches the
      real `compileProcessBody`, which gates on durations before anything
      else).
- [x] 4.4 Implement the `EditorIssue` normalization layer
      (`entityType`, `entityId`, `message`, `source`) consuming Zod
      issues, `CelIssue[]`, and registry/duration errors.
      `draft/issues.ts::resolveLoc`. Found the four validators' locating
      conventions don't agree with each other — e.g. a step-level action is
      `onEntry.actions[i]` in `check.ts`'s CEL collector but `onEntry[i]`
      in `registry-check.ts` and `compile.ts` — so this walks tokens
      tolerantly (accepting either shape) rather than pattern-matching one
      exact convention, and resolves to the deepest entity's real id
      (never an array position). Covered by
      `packages/editor/test/validation.test.ts` (6 tests: Zod-only on an
      incomplete draft, a CEL issue located on its path, a duration issue
      on its timer, registry-not-checked, a registry issue on its action,
      and subprocess not-checked-until-loaded).
- [x] 4.5 Trigger revalidation on every Draft mutation (debounced as
      needed for responsiveness) and surface `EditorIssue`s on the
      owning entity in each panel from task 3.
      A plain `useMemo` keyed on `[draft, registry, loadedChildren]` in
      `draft/store.tsx` — no `setTimeout` debounce. A document this size
      validates in single-digit milliseconds (test suite: the full
      `runValidation` battery runs in low milliseconds per case); a
      debounce would trade a briefly-stale result for a performance
      problem that doesn't exist at this scale. `panels/shared/IssueList.tsx`
      filters `useDraft().validation.issues` by `entityId` and is used in
      every panel (field, data source, step, path, timer, action,
      contract, and process-level for body-wide issues like duplicate
      ids). Verified live: editing a guard from `data.count == 5` to
      `data.count == 5.0` makes its `[cel]` issue disappear on the next
      render, no manual re-check needed.
- [x] 4.6 Implement cross-process check gating: when a subprocess step
      references a child process not loaded into the editor, render
      "not checked" instead of running (or silently skipping)
      `checkSubprocessChildRefs`.
      `runValidation` computes `subprocessStepStatus` per subprocess-type
      step (keyed by its entity id, not by `processId` — see 4.7).
      Verified live: a fresh `subprocess`-type step shows a
      "cross-process: not checked" badge, no crash, alongside its own real
      Zod issue ("a subprocess step needs a subprocess spec") when
      incomplete.
- [x] 4.7 Add a way to load a local child process JSON so cross-process
      checks can run against it, re-validating and flipping "not
      checked" to a real pass/fail once loaded.
      `draft/io.ts::parseChildProcessJson` (real `processBody.parse`, not
      the Draft load-guard — a loaded child is a complete file, not a
      mid-edit document; tolerates both on-disk shapes task 2.6 found:
      a `ProcessVersion` wrapper or a raw body) + a file input in
      `panels/StepsPanel.tsx`. **Deliberate scope note**: an authored
      `ProcessBody` carries no `processId` (only `SubprocessSpec.processId`
      references one), so matching a loaded child to a step by processId
      is impossible from local files alone — `loadedChildren` is keyed by
      the *step's own entity id* instead, i.e. "the child body to check
      this particular subprocess step against," not a global
      processId-keyed registry.

      **Group-level verification** (per the earlier goal: confirm no
      breaks before continuing): `bun run typecheck`, `eslint .` (after
      fixing a Group 2 lint-rule bug this task exposed — the
      `no-restricted-imports` pattern `**/engine/**` was broad enough to
      also block the newly-legitimate `workflow-engine/engine/*` package
      imports; narrowed to `**/src/engine/**`, re-verified both the
      still-blocked relative-import probe and the now-allowed package
      import), and `vite build` all clean. `bun test` — 457 pass, 0 fail,
      0 skipped (451 baseline + 6 new `validation.test.ts` cases). All
      of the above run **inside the devcontainer** via `docker compose
      exec`, not the host. Live-verified every scenario in-browser via
      Playwright as detailed above; also hit and fixed an unrelated
      environment issue along the way — the containerized Vite dev server
      stopped picking up file changes after several edits (likely a
      Docker Desktop bind-mount file-watch gap) and needed a restart to
      pick up the current `App.tsx`.

## 5. Read-only graph view

- [x] 5.1 Add `elkjs` and `@xyflow/react` dependencies to
      `packages/editor`.
- [x] 5.2 Implement the Draft-to-graph mapping: steps to nodes, paths to
      directed edges.
      `graph/mapping.ts::draftToGraph`. Skips a step with no id yet and a
      path whose `to` doesn't resolve within the same Draft — an
      unresolved target is a validation issue (Zod already flags it), not
      something the graph draws as an edge to nowhere. 3 unit tests in
      `test/graph-mapping.test.ts`.
- [x] 5.3 Wire `elkjs` layered auto-layout to compute node positions on
      every Draft change.
      `graph/layout.ts` (async elkjs layered layout) +
      `graph/useDraftGraphLayout.ts`. **Refinement**: node *content*
      (labels, terminal/initial flags) is re-derived from the Draft on
      every render as the task says, but the layout re-*positions* nodes
      only when the structural signature (which node/edge ids exist, and
      which nodes an edge connects) changes, not on every keystroke of an
      unrelated field — both spec scenarios ("new step appears", "new
      path appears as an edge") are themselves structural changes, so they
      still trigger a fresh layout; a label rename no longer visually
      jitters every node's position for no reason.
- [x] 5.4 Render via React Flow with all editing interactions disabled
      (no drag-to-reposition persistence, no drag-to-connect, no
      in-canvas delete).
      `graph/GraphView.tsx`: `nodesDraggable={false}`,
      `nodesConnectable={false}`, `deleteKeyCode={null}`, per-node/edge
      `draggable`/`connectable`/`deletable: false`. Belt-and-suspenders:
      even if an interaction fired, there is no `onNodesChange`/
      `onEdgesChange`/`onConnect` handler wired to any state — `nodes`/
      `edges` are recomputed fresh from the Draft every render, so nothing
      React Flow does internally can outlive the next render.
- [x] 5.5 Attach `EditorIssue`s from task 4.4 to their corresponding node
      or edge and render a visual indicator.
      A red border + "⚠ N" badge (with the issue messages as a hover
      title) on an affected node; a red-styled edge with the same "⚠"
      marker and title on an affected edge.
- [x] 5.6 Confirm the graph view and the panels read off the same issue
      list instance (no independently derived issue data).
      `GraphView` filters `useDraft().validation.issues` — the identical
      array the panels' `IssueList` filters — by `entityId`; no separate
      computation. Verified live: added a `data.count == 5` guard (the
      documented CEL `double`-literal papercut) on a path — the exact
      same message (`no such overload: double == int...`) appeared as
      both the edge's red styling/tooltip and the paths panel's
      `IssueList` entry. Also verified a step-level Zod issue ("a
      non-terminal step needs at least one outgoing path") showing
      identically as the node's "⚠ 1" badge and the step panel's issue
      list.

      **Group-level verification**: `bun run typecheck`, `eslint .`, and
      `vite build` clean (the build now warns about a >500kB chunk from
      `elkjs`+`@xyflow/react` — a real, expected cost of this dependency
      pair, not a defect; code-splitting is a v-next concern, not part of
      this change's scope). `bun test` — 460 pass, 0 fail, 0 skipped (457
      baseline + 3 new `graph-mapping.test.ts` cases). All run inside the
      devcontainer. Live-verified in-browser: nodes/edges render with
      elkjs-computed positions, the initial step and terminal steps are
      labeled, and both issue-attachment scenarios above.

## 6. Draft file I/O and export

- [ ] 6.1 Implement save: File System Access API `showSaveFilePicker`
      writing the current Draft as `.draft.json`.
- [ ] 6.2 Implement load: File System Access API `showOpenFilePicker`
      reading a `.draft.json` file and checking it with the task 2.3
      `load-guard`; reject and report a clear error on a failed check.
- [ ] 6.3 Implement the `<input type=file>` / download-link fallback for
      browsers without File System Access API support.
- [ ] 6.4 Implement export: available only when validation (task 4) shows
      no outstanding issues besides "not checked" ones; produce JSON and
      parse it through `authoredProcessBody` before offering it for
      download, failing loudly if that parse does not succeed.
- [ ] 6.5 Confirm export performs no network call and does not invoke
      `publishBody`.
- [ ] 6.6 Add a save-then-load round-trip test asserting structural
      equivalence, including entity ids (per the editor-draft-io spec).

## 7. Verification

- [ ] 7.1 Run `bun test` (with `DATABASE_URL` set) and `bun run
      typecheck` from the repo root; confirm both the engine package and
      `packages/editor` are green.
- [ ] 7.2 Manually author a process in the editor reproducing
      `examples/expense-approval.json`'s shape (or close to it) end to
      end: create fields, steps, paths, a timer, actions, and a
      contract; validate; export; confirm the exported JSON parses
      against `authoredProcessBody`.
- [ ] 7.3 Confirm the six named follow-up changes (HTTP API, canvas
      editing, non-technical CEL abstraction) remain out of scope and are
      not accidentally implemented.
