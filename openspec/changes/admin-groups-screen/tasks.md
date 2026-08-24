## 1. Dependency gate

- [x] 1.1 Confirm `group-based-assignment` has reached implementation:
      its `/admin/groups*` routes, the groups store, and the deletion
      guard exist and are reachable. Do not start task group 2 or later
      before this is true.
- [x] 1.2 Read the actual `/admin/groups*` route shapes
      `group-based-assignment` shipped. Compare them against the paths
      design.md's "The route shapes this screen assumes" decision
      names. Note any difference to carry into tasks 2 and 5. The
      placeholder token is already confirmed as `:groupId`, against
      `group-based-assignment`'s task 6.4 route registrations, and
      design.md and `specs/admin-app/spec.md`'s requirement text already
      use `:groupId` throughout. If the routes as actually implemented use
      a different token than `:groupId` when this task runs, update those
      same literal path strings in design.md and
      `specs/admin-app/spec.md` to match before task 6.7's `openspec
      validate --strict` re-run. Also
      confirm, before tasks 2.9 and 3.10 are implemented, the
      group-delete route's actual 409 body and wire `type` token.
      `group-based-assignment`'s own task 6.3 specifies that 409 as
      `{ error: { type: "conflict", message: ..., processIds: [...] } }`
      — reusing the generic `"conflict"` wire type, not minting a fresh
      discriminant. That token already belongs to
      `packages/web/src/api/client.ts`'s `PASSTHROUGH` set, which maps
      every `"conflict"` response to `{ type, message }` unconditionally,
      dropping any `processIds` field. A type-keyed branch cannot tell
      this 409 apart from `handleAdminDeleteDataList`'s own `"conflict"`
      409: this is a body-shape-detection problem, not a type-match
      problem. Confirm the shipped body still matches task 6.3's plan
      before tasks 2.9 and 3.10 rely on it; note any drift to carry into
      those tasks. If `group-based-assignment` ever ships a genuine
      structured count field on this 409, a follow-up change should
      interpolate it via `tFill` from that field — never from the raw
      `err.error.message` task 3.10's fixed-message fallback deliberately
      avoids.

## 2. Admin API client and routing

- [x] 2.1 Add group types (`GroupSummary`, `GroupScope`, and similar) to
      `packages/web/src/areas/admin/api/types.ts`, matching what
      `group-based-assignment`'s routes actually return.
- [x] 2.2 Add `listGroups`, `createGroup`, `renameGroup`, `setGroupMembers`,
      `setGroupScope`, and `deleteGroup` to
      `packages/web/src/areas/admin/api/client.ts`, calling the routes
      confirmed in task 1.2. `listGroups` SHALL take the same
      `{ limit, cursor }` page parameters `listUsers` takes and return the
      same cursor-bearing page shape, since `GET /admin/groups` paginates
      like `GET /admin/users`.
- [x] 2.3 Add `{ name: "groups"; processId?: string }` to the admin
      `Route` union in `packages/web/src/areas/admin/routing.ts`. Extend
      `matchRoute` to parse an optional `processId` query parameter out of
      its own `path` string argument (never `location.search`, preserving
      `matchRoute`'s pure, DOM-free contract), per design.md's "A query
      parameter is new in this codebase" decision. Extend `routePath` to
      append that parameter only when set.
- [x] 2.4 Add `groups: "system:admin"` to `ROUTE_ROLE` in the same file.
- [x] 2.5 Add a Groups tab to `TABS` in
      `packages/web/src/areas/admin/root.tsx`. Import a `lucide-react`
      icon for the tab (e.g. `Users2` or `UsersRound`) and set it as the
      entry's `Icon`. Add the tab's label key, `nav.groups`, to the admin
      catalog's EN and DE key sets in
      `packages/web/src/i18n/catalogs/admin.ts`, per
      `.claude/rules/design-language.md`'s locale rules. The
      `route.name === "groups"` dispatch clause that renders the new
      screen lands later, in task 3.4, once `GroupsScreen.tsx` exists;
      completing this task leaves `TABS` and the catalog keys in place
      with no dispatch clause yet, and the tree stays green.
- [x] 2.6 Extend `packages/web/test/admin-routing.test.ts`: add
      `{ name: "groups" }` to its `ROUTES` array, add `"groups"` to
      the operator-reachable `reachable` array in "shows an operator the
      operations screens and no data list screen", and add `"groups"` to
      the hardcoded `operations` array (around line 43) the test "keeps
      the operations screens behind system:admin" iterates over, so all
      three existing assertions keep passing with the new route in place.
- [x] 2.7 Add a `bun:test` case in `admin-routing.test.ts` exercising
      `matchRoute("/groups?processId=proc_123")`, asserting it returns
      `{ name: "groups", processId: "proc_123" }`, and a round-trip case
      confirming `matchRoute(routePath({ name: "groups", processId:
      "proc_123" }))` returns the same route.
- [x] 2.8 Add a `"group-referenced"` variant to the shared `ClientError`
      union in `packages/web/src/api/types.ts`:
      `{ type: "group-referenced"; message: string; blockingProcessIds?:
      string[] }`. This mirrors the existing `self-role-strip` /
      `unknown-manager` / `email-in-use` precedent: a route needing
      structured 409 data gets its own dedicated variant rather than
      falling through the generic passthrough shape.
- [x] 2.9 Extend `parseErrorBody` in `packages/web/src/api/client.ts` to
      recognize the group-delete route's 409 by body shape, not by a
      fresh wire `type` token: per task 1.2, `group-based-assignment`
      reuses the generic `"conflict"` type for this 409, the same token
      `PASSTHROUGH` already maps unconditionally to `{ type, message }`
      for every other `"conflict"` response, including
      `handleAdminDeleteDataList`'s own. A pure type match on
      `"conflict"` cannot tell this 409 apart from that one. Instead,
      check body shape first: when the parsed body's `type === "conflict"`
      AND it carries a `processIds` array, map to the new
      `group-referenced` variant and populate `blockingProcessIds` from
      that array, keeping only its string entries (`.filter((x): x is
      string => typeof x === "string")`), before consulting
      `PASSTHROUGH`. When `type ===
      "conflict"` and no `processIds` array is present — any other
      route's own `"conflict"` 409, or a group-delete 409 whose body
      carries only a count or free-text message per task 1.2's confirmed
      shape — fall through to the existing `PASSTHROUGH` handling
      unchanged, and leave `blockingProcessIds` `undefined`. Widen
      `parseErrorBody`'s currently-narrow parsed-body type (today
      `{ type?: string; message?: string; issues?: unknown[] }`) to also
      recognize an optional `processIds?: unknown[]` field, so the shape
      check above can read it. `parseErrorBody` itself stays free of any
      count-only message-building; see task 1.2's note on where a future
      structured count field would be read instead.

## 3. Groups screen

- [x] 3.1 Invoke the design skills before implementing `GroupsScreen`:
      `/frontend-design:frontend-design` for visual direction, plus the
      installed Vercel skills (`web-design-guidelines`,
      `vercel-react-best-practices`, `vercel-composition-patterns`), per
      `CLAUDE.md`'s rule that UI work in `packages/web` goes through the
      design skills before implementing or reshaping any screen.
- [x] 3.2 Add `groupsLogic.ts` beside the screen, mirroring
      `usersLogic.ts` and `migrationsLogic.ts`: `scopeText(scope:
      GroupScope, locale: UiLocale): string`, a pure helper for scope
      display text, taking `locale` and returning already-translated
      text via `t`/`tFill` ("Global" or an `{n}`-templated "N
      processes"), mirroring `migrationsLogic.ts::migrationBuckets`'s
      pattern of translating per entry rather than returning a
      hardcoded English string; `groupMatchesFilter(scope: GroupScope,
      processId: string | undefined): boolean`, the process-filter
      predicate; `prefillScope(processId: string | undefined):
      GroupScope`, the create-time scope pre-fill; `resolveMemberTokens(
      text: string, users: UserSummary[], preEditMembers: string[]):
      { ok: true; memberIds: string[] } | { ok: false; unresolvedTokens:
      string[] }`, member-token forward-resolution against a loaded
      account list,
      resolving each comma-separated token per the token rule below and
      collecting every token that resolves to neither an email match nor
      a pre-edit member id into `unresolvedTokens`, so the inline refusal
      message task 3.9 builds has a value to name; and
      `blockingProcessLabels(blockingProcessIds: string[], processes:
      ProcessSummary[]): string[]`, a
      blocking-process-id-to-label resolver for the deletion-guard
      message. `ProcessSummary.label` is `LocalizedText`, not a plain
      string, so resolving it needs the process's own `baseLocale` —
      never the operator's `UiLocale` — the same way
      `instancesLogic.ts::labelText(label, baseLocale)` already does;
      that function is this task's precedent for the label-extraction
      half. `mappingProcesses` (`dataListsLogic.ts`) stays the precedent
      only for the other half, the pure-function-over-a-referencing-process-list
      shape, since it returns raw ids rather than resolving labels. Resolve
      each blocking id via `const match = processes.find(p =>
      p.processId === id); match?.label[match.baseLocale] ??
      Object.values(match?.label ?? {})[0] ?? id`, mirroring
      `labelText`'s own resolution exactly. This inlines rather than calls
      `labelText` directly because `labelText`'s own final fallback is
      `""`, not the id: `labelText(match.label, match.baseLocale) ?? id`
      would silently produce an empty string, not the raw id, for a
      matched process carrying an empty label object, breaking this
      task's own "falls back to the raw id" requirement below. A blocking
      id absent from the loaded process list SHALL fall back to the raw
      id string itself, so the deletion-guard message still names
      something. Add
      `scopeIsSavable(scope: GroupScope):
      boolean`, a pure predicate returning `false` only when
      `scope.type === "processes"` and `scope.processIds` is empty,
      backing task 3.8's scope-editor refusal the same way this task's
      member-token refusal rule backs task 3.9's.

      Member resolution runs in both directions, since
      `group-based-assignment`'s own spec declares a member id naming no
      account a first-class, persistent state
      (`specs/group-administration/spec.md`, "A member id naming no
      account is accepted"). Add `memberDisplayText(members: string[],
      users: UserSummary[]): string`, a reverse (id-to-email) resolver
      that maps each stored member id to its matching account's email,
      comma-joined, and falls back to the raw id string itself when no
      account matches — mirroring `blockingProcessLabels`'s own fallback
      pattern above and `usersLogic.ts::managerLabel`'s identical
      fallback for an unmatched manager pointer. This seeds the member
      editor's initial text. `resolveMemberTokens`, named above, is the
      forward direction's token rule: a comma-separated entry in the
      editor's saved text resolves against the loaded directory by email
      match, OR — when no email matches — passes through unchanged when
      it exactly matches an id already present in `preEditMembers`,
      carrying a dangling member forward across an edit that does not
      touch it. An entry satisfying neither is refused, the same
      client-side, before-any-request refusal the plain email case
      already has.
- [x] 3.3 Add `admin-groupsLogic.test.ts` covering scope display text
      (both locales), the process-filter predicate, the create-time
      scope pre-fill, member-token resolution (including the refusal
      case, asserting the refused token's value appears in
      `unresolvedTokens`, not merely that `ok: false` came back),
      `memberDisplayText` (including a stored member id no
      loaded account matches, asserting the raw id appears in the
      display text), the save-path token rule (a token passing through
      unchanged when it matches a pre-edit dangling member id, and a
      token refused when it matches neither a loaded email nor a
      pre-edit member id, again asserting that token's value appears in
      `unresolvedTokens`), `blockingProcessLabels` (including a
      blocking id absent from the loaded process list), and
      `scopeIsSavable` (including the empty-process-list refusal case),
      mirroring `admin-usersLogic.test.ts`'s shape.
- [x] 3.4 Create
      `packages/web/src/areas/admin/screens/GroupsScreen.tsx` with the
      list view: columns for name, scope, and member count. The screen
      SHALL walk `listGroups`'s cursor to completion before it filters or
      renders, mirroring `UsersScreen.tsx`'s own `load()`, which loops on
      the returned cursor until the walk is exhausted rather than
      assuming one unpaged response. Follow the refresh-on-focus
      convention `useRefresh` already gives every other Operations
      screen. Add the screen's title key, its name/scope/member-count
      column-header keys, a "Global" scope-display key, and an
      `{n}`-templated "N processes" scope-display key for task 3.2's
      scope-text helper, to the admin catalog's EN and DE key sets in
      `packages/web/src/i18n/catalogs/admin.ts`, per
      `.claude/rules/design-language.md`'s locale rules. Wire
      `route.name === "groups"` in `root.tsx` to render this screen,
      passing `route.processId` through as an `initialProcessId?: string`
      prop on `GroupsScreen`, the same pass-through pattern `root.tsx`
      already uses for `InstanceScreen instanceId={route.instanceId}` and
      `DataListScreen listKey={route.listKey}`.
- [x] 3.5 Add the process-filter `<select>` above the list, populated
      from the existing `listProcesses`, following
      `MigrationsScreen.tsx`'s picker exactly. Wire it to the narrowing
      predicate from task 3.2. Initialize the `<select>`'s selected value
      from `initialProcessId` (task 3.4) when present at mount; the
      operator can still change or clear it afterward, the same as any
      other selection on this control.
- [x] 3.6 Add group creation: a form (name, scope) with save/cancel,
      pre-filling scope from the active process filter per task 3.2's
      helper. On save, call `createGroup` and refresh. Add the
      creation-form's catalog keys (its field labels and its save/cancel
      control labels, where no shared key already covers them) to the
      admin catalog's EN and DE key sets.
- [x] 3.7 Add the rename inline editor per row, mirroring
      `UsersScreen.tsx`'s roles editor for INTERACTION SHAPE only:
      autoFocus, Enter to save, Escape to cancel, save/cancel controls.
      NOT its class names: `.admin-role-input` takes the mono face
      (`.admin-role-editor` is its plain layout wrapper, styled
      separately) (`packages/web/src/areas/admin/app.css`, ~lines
      195-201) reserved for a value the engine matches literally, per
      `.claude/rules/design-language.md`'s "A value the engine matches
      exactly uses the mono face. Prose never does." A group's `name` is
      operator-authored prose, not an engine-matched identifier, so it
      needs its own classes with no mono-face rule — for example
      `admin-name-editor`/`admin-name-input` — styled like `.admin-field`'s
      text input, mirroring `DataListScreen.tsx`'s list-name/description
      inputs (~lines 161-177), the correct precedent for prose-field
      styling. Wire it to `renameGroup` (`PATCH
      /admin/groups/:groupId/name`). Add the rename editor's catalog keys
      to the admin catalog's EN and DE key sets.
- [x] 3.8 Add the scope inline editor per row: a Global/Processes switch,
      and a process picker that appears only for Processes. Refuse an
      empty process list client-side, via task 3.2's `scopeIsSavable`.
      Wire saving to `setGroupScope`. Add the scope editor's catalog
      keys, including the client-side refusal message for an empty
      process list, to the admin catalog's EN and DE key sets.
- [x] 3.9 Add the member inline editor per row: a comma-separated text
      input, resolved against the full account directory (load it via
      the existing `listUsers` walk) using task 3.2's resolvers. Seed
      the editor's initial text with `memberDisplayText` over the row's
      current member list, so a dangling member shows as its raw id
      rather than vanishing from the text. On save, resolve each token
      per task 3.2's token rule: an email match against the directory,
      or a pass-through when the token exactly matches an id already in
      the row's pre-edit member list. Refuse client-side, inline, a
      token matching neither, naming the offending token(s) via the
      failure's `unresolvedTokens` in the inline message. Wire saving to
      `setGroupMembers`. Add the member editor's catalog keys, including
      the `tFill` template for the client-side refusal message that
      names a token matching neither a loaded email nor a pre-edit
      member id, to the admin catalog's EN and DE key sets.
- [x] 3.10 Add delete per row, behind a `window.confirm` naming the
      group, calling `deleteGroup`. `describeCaughtError`
      (`packages/web/src/areas/admin/errors.ts`) cannot render this
      refusal: it delegates to `describeError`, a fixed switch keyed on
      `error.type` that returns one canned catalog string per type,
      whose own doc comment states it never reads `error.message`, since
      the server does not guarantee that string is safe to show. It
      structurally cannot produce the resolved process labels this
      refusal needs, since that data is not a fixed catalog string.
      The delete handler therefore catches `AdminClientError` directly
      and checks whether `err.error.type === "group-referenced"` OR
      `err.error.type === "conflict"` itself — the two error types this
      screen branches on by hand, bypassing `describeCaughtError` for
      them alone. Both types are safe to treat as the deletion guard
      here, and only here: this catch block is scoped to this screen's
      own `deleteGroup` call, so a `"conflict"` caught at this exact
      call site cannot be any other route's refusal. This parallels how
      `UsersScreen` already special-cases `self-role-strip` and
      `email-in-use` in prose comments over `describeError`'s switch,
      but here with actual branching code, since the message is built
      from resolved data rather than picked from a fixed catalog string.
      On a 409, `parseErrorBody` (task 2.9) answers with the
      `group-referenced` variant added in task 2.8 when the body carried
      structured `processIds`, or with the generic `"conflict"` shape
      (task 2.9's unchanged fallthrough) when it did not. When
      `err.error.type === "group-referenced"` and its
      `blockingProcessIds` is present, resolve them to labels with task
      3.2's `blockingProcessLabels` against the already-loaded process
      list, and fill a catalog template naming each one with `tFill`,
      mirroring `DataListScreen.tsx`'s `dataList.dropColumnMapped` key
      (`tFill(locale, "dataList.dropColumnMapped", { processes:
      breaking.join(", ") })`) — the precedent for joining several
      strings into one `tFill` substitution, since every `tFill` call in
      `UsersScreen.tsx` substitutes a single scalar value instead.
      Otherwise — a `"group-referenced"` value with no
      `blockingProcessIds`, or the fallthrough `"conflict"` shape — show
      a fixed, translated catalog string (for example, "A published
      process still references this group.") instead, without naming
      individual processes and without reading `err.error.message`: the
      server does not guarantee that string is safe to show, the same
      rule `describeError` itself follows. Any other caught error, of
      any other type, still falls back to `describeCaughtError`
      unchanged. Add both deletion-guard catalog templates — the
      `tFill` template naming blocking processes, and the fixed
      fallback string above — to the admin catalog's EN and DE key
      sets.
- [x] 3.11 Verify every inline editor's open state and pending text
      survive a `useRefresh`-triggered reload, the way `UsersScreen`'s
      editors already do.

## 4. Studio link

- [x] 4.1 Add `go: (href: string, opts?: NavigateOptions) => void` to the
      prop chain from `packages/web/src/areas/studio/root.tsx` through
      `EditScreen.tsx` to `EditorArea`, per design.md's "Threading `go`
      down to the link" decision.
- [x] 4.2 Pass `go` and `processId` into `ProcessHeaderBar`'s props.
- [x] 4.3 Invoke the design skills before adding the link: the new item
      sits beside `AddLocaleControl`, which uses a visually different
      pattern (`.studio-header-bar-menu-add-locale` / `btn
      btn-secondary`) than the label-row pattern
      (`.studio-header-bar-menu-row`) the key and base-locale fields use
      in the same menu group — a real styling decision, not a mechanical
      copy. Run `/frontend-design:frontend-design` for the link's
      placement and styling within the `⋮` menu's "Process, saved with
      the draft" group, per `CLAUDE.md`'s rule that UI work in
      `packages/web` goes through the design skills before implementing
      or reshaping any screen or component.
- [x] 4.4 Add the "Manage assignment groups for this process" link to
      the `⋮`
      menu's "Process, saved with the draft" group in
      `ProcessHeaderBar.tsx`, beside `AddLocaleControl`, per task 4.3's
      styling direction. Place it as a sibling of the `{structureActive
      && (...)}` block within the group, alongside `AddLocaleControl` —
      never inside that conditional — so it renders on both surfaces.
      Build its href with `areaHref("admin",
      "/groups")` plus the `processId` query parameter, and call
      `go(href)` on click. Add the studio catalog key for the link's
      label to the studio catalog (English only, per that catalog's
      existing convention).
- [x] 4.5 Confirm the link renders regardless of `structureActive` and
      regardless of the signed-in actor's roles, per the studio-canvas
      spec delta's requirement text; it triggers no group-data request
      of its own.

## 5. Completeness sweep

- [x] 5.1 Confirm every catalog key task groups 2 through 4 added along
      the way — `nav.groups` (task 2.5); the Groups screen's title,
      column-header, scope-display, creation-form, rename, scope-editor,
      member-editor, and deletion-guard-template keys (tasks 3.4, 3.6,
      3.7, 3.8, 3.9, 3.10); and the Studio link's label key (task
      4.4) — carries both an EN and a DE entry in the admin catalog, and
      an EN entry in the studio catalog per that catalog's English-only
      convention, per `.claude/rules/design-language.md`'s locale rules.
      This is a final completeness sweep, not a place to introduce a new
      key; if the sweep finds nothing missing, mark it done as a
      no-op.
- [x] 5.2 Record the query-parameter routing precedent task 2.3
      introduces. `docs/current-state.md`'s Unified shell passage
      (the "Routing is the load-bearing part" paragraph) already
      describes `matchRoute`/`routePath` per area; add one sentence
      there naming `admin/routing.ts`'s `groups` route as the first
      `Route` variant carrying a query parameter, parsed out of
      `matchRoute`'s own `path` string argument per design.md's "A
      query parameter is new in this codebase" decision, never from
      `location.search`. `.claude/rules/ui-glossary.md` covers naming
      and vocabulary, not routing mechanics, so it is not the right
      home for this note.

## 6. Verification

- [x] 6.1 Run `bun run typecheck` and confirm it passes clean.
- [x] 6.2 Run `bun run build` and confirm it passes clean.
- [x] 6.3 Run the full `bun test` suite with `DATABASE_URL` set, not a
      single-file rerun. Confirm the reported skip count matches an
      expected full run (no silent skip from a missing `DATABASE_URL`),
      and confirm no named test fails.
- [x] 6.4 Run `sh scripts/gates/prose.sh < /dev/null` over this change's
      touched Markdown and confirm no new antislop findings.
- [x] 6.5 Run `sh scripts/gates/whitespace.sh < /dev/null` and confirm it
      passes clean.
- [x] 6.6 Exercise the Groups screen and the Studio link in a real
      browser: list, filter, create (with and without an active filter),
      rename, scope edit both directions, member add and delete, a
      blocked delete showing the guard's process names, and the Studio
      link opening the Groups screen pre-filtered to the open process.
      Also exercise the link's two unauthorized outcomes: an actor
      holding `system:datalists` but not `system:admin` sees the admin
      area's own `MissingRole` empty state, and an actor holding neither
      role — the more common real-world case — sees the shell's generic
      `area.forbidden` message instead, before the admin area even
      mounts. Also confirm the link still appears in the `⋮` menu with
      the JSON surface active, not only the structure surface. This
      codebase has no component-rendering test infrastructure for the
      admin area, so confirm by hand: an open inline editor keeps its
      typed text across a window-focus refresh, and cancelling each
      editor sends no request. The no-structured-ids fallback message
      (design.md's "The deletion guard's 409 needs its own
      `ClientError` variant" decision) has no reachable trigger under
      `group-based-assignment`'s current plan, task 6.3's body always
      carrying a `processIds` array, so this pass does not exercise it;
      code review alone verifies that branch.
- [x] 6.7 Run `openspec validate admin-groups-screen --strict` and
      confirm it reports the change valid, before archiving. Re-run it
      if tasks 1 through 5 above touched proposal.md, a spec delta, or
      design.md after this task was first read.
