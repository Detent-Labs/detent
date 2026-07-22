## 1. Workspace promotion

- [ ] 1.1 Add `workspaces: ["packages/*"]` to the root `package.json`,
      keeping its existing `name`, dependencies, and scripts intact (it
      remains the engine package's manifest).
- [ ] 1.2 Add an `exports` map to the root `package.json` exposing exactly
      `./schema` -> `src/schema/definition.ts`, `./cel/check` ->
      `src/cel/check.ts`, `./schema/compile` -> `src/schema/compile.ts`.
- [ ] 1.3 Create `packages/editor` with a minimal `package.json` declaring
      `"workflow-engine": "file:.."` (no editor source yet) — not
      `workspace:*`, since the root package is the workspace root, not a
      member matched by the `workspaces` glob (design.md decision 2).
- [ ] 1.4 Run `bun install` at the repo root; confirm a single `bun.lock`
      resolves both the engine package and `packages/editor`, and that
      the engine dependency in `packages/editor/node_modules` is a
      symlink back to the repo root, not a copy.
- [ ] 1.5 Rename the root package's own `tsc --noEmit` invocation to a
      package-local script (e.g. `typecheck:engine`) and make the root
      `typecheck` script an orchestrator that runs it plus every
      workspace member's own `typecheck` script (design.md decision 8);
      verify the chosen fan-out mechanism (`bun run --filter`, or an
      explicit `&&` chain if the pinned Bun version lacks `--filter`)
      against the Bun version in `.devcontainer/Dockerfile`.
- [ ] 1.6 Give `packages/editor` a placeholder `typecheck` script (even
      before it has real source) so the orchestrator from 1.5 has
      something to call; confirm `bun run typecheck` and `bun test` (with
      `DATABASE_URL` set) are still green from the repo root with no path
      changes to the engine's own `src`/`test`.
- [ ] 1.7 Add a smoke import in `packages/editor` (temporary file, removed
      or superseded in task 2) that imports from the engine package's
      `./schema` specifier and confirm it resolves; confirm an import
      attempt of an unexported path (e.g. `src/engine/...`) fails to
      resolve.

## 2. Editor scaffold and Draft model

- [ ] 2.1 Scaffold `packages/editor` as a React + Vite app (per
      design.md decision 5); add its own `tsconfig.json` (strict mode,
      DOM/JSX libs) and replace the task 1.6 placeholder `typecheck`
      script with the real `tsc --noEmit` invocation for this package.
- [ ] 2.2 Add a lint rule (`no-restricted-imports` or equivalent)
      blocking `packages/editor` from importing any path under
      `src/engine/**` via relative import, closing the gap the `exports`
      map alone leaves open (design.md risk 2).
- [ ] 2.3 Implement the generic `DraftOf<T>` recursive mapped type in
      `packages/editor/src/draft/types.ts` and apply it to the imported
      `AuthoredProcessBody` type (via `./schema`) to get the Draft's
      editing-time type; implement the separate, deliberately minimal
      `load-guard.ts` structural check used only for file-load safety
      (per design.md decision 3 — neither one re-declares the contract's
      business shape).
- [ ] 2.4 Implement id-minting: a helper that generates a prefixed
      UUIDv4 id per entity kind at creation time, using the same prefix
      scheme as the contract.
- [ ] 2.5 Implement `packages/editor/src/draft/validate.ts`: assemble the
      current Draft into `AuthoredProcessBody` shape and parse it through
      the real `authoredProcessBody` schema (via `./schema`), collecting
      every Zod issue rather than stopping at the first.
- [ ] 2.6 Add a structural round-trip test: load each file in `examples/`
      as a Draft, re-export it, and assert the result is deep-equal to
      the original (design.md risk 1 mitigation).
- [ ] 2.7 Add `packages/editor`'s test suite to the repo's CI/test entry
      point so it runs alongside `bun test`.

## 3. Structural panels

- [ ] 3.1 Build the field catalog panel: create/edit/delete process-wide
      fields.
- [ ] 3.2 Build the data sources panel: create/edit/delete process-wide
      `dataSources` entries (plugin envelope: `type`, `config`, plus
      `key`); wire the field catalog panel's `dataSource` picker to list
      them, and enforce the `options`/`dataSource` XOR in the field
      catalog panel itself (in addition to it surfacing as a validation
      issue from task 4).
- [ ] 3.3 Build the steps panel, including per-step `view` overrides
      (visible/required/readonly/order/group) referencing catalog fields.
- [ ] 3.4 Build the paths panel: manual vs. automatic trigger, guard CEL
      text entry, automatic-path priority editing, explicit display of
      trigger type per path.
- [ ] 3.5 Build the timers panel: duration/deadline XOR entry, deadline
      CEL text entry, `onFire` action list.
- [ ] 3.6 Build the actions panel/sub-editor (shared across step
      onEntry/onExit/onCancel, path onPath, timer onFire positions):
      `{ type, config }` entry and `output` mapping CEL text entry.
- [ ] 3.7 Build the contract panel: input/output fields and outcomes for
      a process authored as a subprocess-callable child.
- [ ] 3.8 Wire every panel to mint ids via the task 2.4 helper on entity
      creation and to write only through the Draft model (no direct
      state mutation bypassing it).

## 4. Live validation and issue mapping

- [ ] 4.1 Wire `validateProcessBody` (CEL, via `./cel/check`) into the
      validation pass alongside the Zod parse from task 2.5.
- [ ] 4.2 Wire `checkActionRegistry`, gated on an injected `Registry`;
      render "not checked" for every action when no registry is loaded
      (per the editor-live-validation spec).
- [ ] 4.3 Wire `validateDurations`.
- [ ] 4.4 Implement the `EditorIssue` normalization layer
      (`entityType`, `entityId`, `message`, `source`) consuming Zod
      issues, `CelIssue[]`, and registry/duration errors.
- [ ] 4.5 Trigger revalidation on every Draft mutation (debounced as
      needed for responsiveness) and surface `EditorIssue`s on the
      owning entity in each panel from task 3.
- [ ] 4.6 Implement cross-process check gating: when a subprocess step
      references a child process not loaded into the editor, render
      "not checked" instead of running (or silently skipping)
      `checkSubprocessChildRefs`.
- [ ] 4.7 Add a way to load a local child process JSON so cross-process
      checks can run against it, re-validating and flipping "not
      checked" to a real pass/fail once loaded.

## 5. Read-only graph view

- [ ] 5.1 Add `elkjs` and `@xyflow/react` dependencies to
      `packages/editor`.
- [ ] 5.2 Implement the Draft-to-graph mapping: steps to nodes, paths to
      directed edges.
- [ ] 5.3 Wire `elkjs` layered auto-layout to compute node positions on
      every Draft change.
- [ ] 5.4 Render via React Flow with all editing interactions disabled
      (no drag-to-reposition persistence, no drag-to-connect, no
      in-canvas delete).
- [ ] 5.5 Attach `EditorIssue`s from task 4.4 to their corresponding node
      or edge and render a visual indicator.
- [ ] 5.6 Confirm the graph view and the panels read off the same issue
      list instance (no independently derived issue data).

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
