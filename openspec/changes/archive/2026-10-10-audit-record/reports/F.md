# Area F: Other web areas and the renderer (`packages/web` without studio, `packages/form-ui`)

State: HEAD `5f41cd8a`. The audit read the code only. It ran no build, no test and no browser.

## Findings

### F-1: Focus refetch overwrites unsaved input on the data list and UI strings screens

- Case:
  - An operator opens `/admin/data-lists/products`. The operator types three new value rows and renames the column label `unit_price`.
  - The operator switches to the spreadsheet with Alt-Tab to copy the next value, and returns.
  - The window's `focus` event increments `reloadToken`, and `load()` runs. It rewrites `label`, `description`, `columns` and `rows` with the server state.
  - The three rows and the rename are gone, with no message.
  - The same happens on `/admin/ui-strings`. There `load()` calls `setDrafts({})`, and every typed translation disappears.
  - Mechanism: `useRefresh` attaches an unconditional `focus` listener. Both screens fill their input state directly from the refetch.
- Location: `packages/web/src/areas/admin/useRefresh.ts:12-15`; `packages/web/src/areas/admin/screens/DataListScreen.tsx:215`, `:218-244` (the inputs bind to this state: `:325`, `:336`, `:368-386`, `:451-487`); `packages/web/src/areas/admin/screens/UiStringsScreen.tsx:115`, `:118-133` (input `:222`)
- Severity: high
- Evidence: confirmed (code read, lines above). The visible effect needs a window switch, see repro 1.
- Counter-evidence sought:
  - A dirty guard in `load` or `useRefresh`: none.
  - A test that pins this: no test imports `DataListScreen` or `UiStringsScreen`. The directory `packages/web/test` holds only `admin-dataListsLogic.test.ts` and `admin-uiStringsLogic.test.ts`.
  - The browser check `docs/browser-checks.md:752-775` runs the screen with no window switch.
  - The sibling screens know the rule and keep unsaved input in separate state: `UsersScreen.tsx:217-219`, `GroupsScreen.tsx:160-161` ("a reload must not reset").
  - The spec asks for the focus refetch (`openspec/specs/admin-app/spec.md:816-825`). It does not ask the refetch to overwrite unsaved input.
- Known: new
- Suggestion: The refetch fills only `detail`/`overrides`. Set the input state only on the first load and after the screen's own save. Or skip the refetch while the screen holds unsaved input.

### F-2: Admin instance header shows an expired claim and a stale `transitionSeq`

- Case:
  - In `expense_approval`, alice claims the step (event `assignment.claimed`, actorId alice) and submits.
  - The instance moves to the next step. The transition writes the new, unclaimed assignment, but no `assignment.released` event.
  - The operator opens `/admin/instances/<id>`. The function `deriveFromRecord` walks the record and takes the last claim event.
  - The header shows "Claimed by alice", although `GET /instances/:id` returns an empty `assignment.claimedBy`.
  - Second case: when the record holds more than 200 elements, the screen loads only page 1 (ascending order). "Transition seq" then shows the value of the 200th element instead of the current one.
- Location: `packages/web/src/areas/admin/screens/InstanceScreen.tsx:156-168`, `:319`, `:357-364`; cause in the transition: `src/engine/transition.ts:390` (`assignment: next.assignment ?? null`), claim events only at `:1084`, `:1101`, `:1136`; ordering `src/runtime/record.ts:78`
- Severity: medium
- Evidence: confirmed. The server `InstanceView` carries `assignment` and `baseLocale` (`src/runtime/instances.ts:55-59`, `:83-88`). The admin type omits both (`packages/web/src/areas/admin/api/types.ts:55-63`). The comment at `InstanceScreen.tsx:156-157` ("no single-instance read") is no longer true. The spec requires the claim status and `transitionSeq` in the header (`openspec/specs/admin-app/spec.md:180-183`).
- Counter-evidence sought: another event that deletes the claim at the transition: none (`git grep` of the three event kinds in `src`). A test for `deriveFromRecord`: none (not exported).
- Known: new
- Suggestion: Read the claim from `view.assignment` and extend the type. Read `baseLocale` from `view.baseLocale` instead of the extra call `listProcesses` (`:251`, `:263`). Let the server deliver `transitionSeq`, or label the value "up to the loaded state".

### F-3: `form-ui` and the engine disagree about cleared fields

- Case:
  - (a), number: An optional `number` field, for example `amount`, already holds 120. The value comes from a catalog `default`, an earlier step or an action output. The participant clears the field. The handler `onChange` returns `undefined`, and `filterToEditable` keeps the key with `undefined`. The call `JSON.stringify` drops the key, and the engine merges the patch over the data. The field `amount` stays 120, and the clearing disappears without a message.
  - (b), format or choice: An optional field with `format: "date"`/`"email"` or a choice field (for example `booking_status`) gets a value. The participant then clears it or sets it to the empty option. The form sends `""`. The engine reports `type-mismatch` ("expected date") or `invalid-option`. The participant can no longer clear an optional field this way. The submission stays stuck until a reload.
  - (c), side note for the runtime area: A required text field, typed and then cleared, sends `""`. The required check counts only `undefined` as missing and lets `""` pass.
  - (d): A `datetime` value with a zone (`...Z`, `+02:00`, which the engine allows) does not fit `<input type="datetime-local">`. The field shows empty, also when it is readonly.
- Location: `packages/form-ui/src/FieldForm.tsx:616` (number to `undefined`), `:682-691` (empty option), `:710-718` (native inputs, `:279-283`); `packages/form-ui/src/submit.ts:17-24`; `packages/web/src/areas/app/screens/TaskScreen.tsx:367`, `:374`; `packages/web/src/api/client.ts:146-151`; `src/engine/transition.ts:540` (merge); `src/runtime/fields.ts:416-421`, `:571-577`, `:588-593`; `src/schema/definition.ts:551-566`
- Severity: medium
- Evidence: confirmed for (a) to (c) by code. Case (d) follows from the HTML value format of `datetime-local` (assumed, repro 3).
- Counter-evidence sought: the `form-ui` tests cannot fire events (`field-form.test.tsx` checks static markup only). No spec line covers cleared values in `openspec/specs/form-ui/spec.md`. The hits at `:234-238` concern only the missing browser-side gate.
- Known: new
- Suggestion: Define one empty value per type and emit it in `form-ui`. For example, delete the key explicitly and let the engine accept "cleared" as `null`. Or treat `""` as "no value" for a format or an option. The fix touches the engine's submit semantics (`runtime-api`) and leaves `definition.ts` unchanged.

### F-4: The reporting area does not end the session on a 401

- Case: A process owner with only `system:reports` works longer than the token lifetime. The call `GET /reporting/<proc>/cycle-time` answers 401 with type `actor-resolution`. The view shows `Your session could not be resolved. Sign in again.` and stays there. The expired token stays stored. Every further view fails the same way until the owner signs out through the account menu.
- Location: `packages/web/src/areas/reporting/root.tsx:59` (does not accept `onUnauthorized`, although `App.tsx:62` and `:224` pass it); `reportingLogic.ts:137-140`, `:160-161`; `components.tsx:164-170`; 401 mapping `src/http/errors.ts:98`
- Severity: medium
- Evidence: confirmed. The search `git grep onUnauthorized|is401|useFail` in `areas/reporting` has no hit.
- Counter-evidence sought: another 401 path in the shell. The shell has no global fetch interceptor, and `api/client.ts:106-118` only throws. Spec: "A `401` from any API call stays the sole signal that a session has ended" (`openspec/specs/unified-shell/spec.md:144-146`, `:158-163`).
- Known: new
- Suggestion: Accept `onUnauthorized` in `ReportingArea` and call it in the screens on `status === 401`, as `useFail` does in app and admin.

### F-5: Report builder comparison: nobody can type a list for "in", values always go as strings

- Case:
  - In the builder, add a comparison, choose the comparison "in" and type `a`. The handler `onChange` stores `["a"]`. The input then shows its `JSON.stringify`, so `["a"]`. The next character `,` yields `['["a"]', ""]`, shown as nested JSON. Nobody can type a list.
  - Second, the comparisons `eq` and `ne` always send a string. For `amount` (number), `eq 500` builds the condition `data @> {"amount":"500"}` and never matches. The comparison `ne 500` matches every row, also the rows with 500.
  - Third, every keystroke in a comparison fires a new `POST /reporting/reports/columns`. The effect depends on `draft?.dataWhere`.
- Location: `packages/web/src/areas/reporting/screens/ReportBuilderScreen.tsx:31`, `:384-390`, `:161-175`; type without a field type `packages/web/src/areas/reporting/api/types.ts:76`; server comparison `src/runtime/queries.ts:318-326`
- Severity: medium
- Evidence: confirmed (code). Visibility in the browser: repro 5.
- Counter-evidence sought: type conversion on the server: none (`queries.ts:320-325` compares jsonb by exact type). A logic test for `ComparisonRow`: none (a component, outside `reportsLogic.ts`).
- Known: new
- Suggestion: Keep the raw text apart from the value and split it only on send. Deliver the field type in `ColumnChoice` and convert the value by it. This is an API change (spec `reporting-data-tables`).

### F-6: Report builder date filter computes in UTC and excludes the "Bis" ("To") day

- Case: A process owner in Europe/Zurich picks "Von 01.10.2026" ("From") and "Bis 10.10.2026" ("To") in the builder. The builder sends `createdAfter 2026-10-01T00:00:00.000Z` and `createdBefore 2026-10-10T00:00:00.000Z`. The server filters `created_at >= ... AND created_at <= ...`. The result misses cases from 10.10. at 02:00 local time and later. It also misses cases from 01.10. before 02:00. The three views of the same area use the same labels (`range.from`/`range.to`) and count the whole local day.
- Location: `packages/web/src/areas/reporting/screens/ReportBuilderScreen.tsx:273-288`; `src/runtime/queries.ts:296-297`; correct pattern `reportingLogic.ts:59-66`; rule for the views `openspec/specs/reporting-app/spec.md:115-122`
- Severity: medium
- Evidence: confirmed (code).
- Counter-evidence sought: a spec rule for the builder in particular: none (the cited requirement names the three views). Another site that corrects the value: `draftToInput` (`reportsLogic.ts:41-55`) passes it through unchanged.
- Known: new
- Suggestion: Use `fromDateInput(value, "start"|"end")` and `toDateInput` as the views do.

### F-7: Stale responses overwrite newer ones (filter lists, migrations)

- Case:
  - On `/admin/instances` the operator types `proc_expense` into "Process id". Every keystroke changes `filter`. That change reaches `fetchPage`, `load` and the effect. The result is twelve requests.
  - The hook `usePagedList.load` takes the response that arrives last. Suppose the empty response for `proc_expens` arrives after the correct one. The list then shows "No instances match these filters".
  - The same holds on `/admin/outbox` (instance filter) and on `/admin/migrations`. When the operator switches the process quickly, the version list of the previous process can remain.
- Location: `packages/web/src/shell/usePagedList.ts:46-58`; `InstancesScreen.tsx:142-162`, `:177-200`; `OutboxScreen.tsx:144-170`, `:219-224`; `MigrationsScreen.tsx:86-94`. Counter-pattern with a cancel flag: `reporting/screens/CycleTimeScreen.tsx:113-121`
- Severity: medium
- Evidence: mechanism confirmed (no sequence guard and no cancel guard). The visible effect depends on timing (assumed, repro 7).
- Counter-evidence sought: a debounce or an `AbortController` in the screens or in `request` (`api/client.ts:106-118`): none.
- Known: new. Entry 51 at `decisions.md:1858-1862` names the class "stale UI" in general and defers TanStack Query. It does not record this concrete case.
- Suggestion: Keep a request number in `usePagedList` and accept only the newest response. In the migrations effect, use a `cancelled` flag as the reporting views do.

### F-8: The form accepts input when no path is available

- Case: A participant opens a completed case from "Cases I started". The engine returns `availablePaths: []`. The component `PathButtons` shows nothing, but `FieldForm` keeps the inputs of the last step open to input. The spec requires "the form renders read-only". On a running wait-state step with no manual paths, "Save" also stays visible.
- Location: `packages/form-ui/src/PathButtons.tsx:27-28`; `FieldForm.tsx:526`; `TaskScreen.tsx:454-473`, `:542-546`; `src/runtime/instances.ts:256`; `openspec/specs/form-ui/spec.md:356-359`
- Severity: low
- Evidence: confirmed (readonly comes only from the view, `src/runtime/fields.ts:255`).
- Known: new
- Suggestion: Give `FieldForm` a `readonly` switch. The `TaskScreen` sets it when `availablePaths` is empty or `status !== "running"`.

### F-9: The ponytail limit of the timer scan takes effect at 201 running timers

- Case: A tenant has 250 running instances with a timer. The instance view loads `GET /admin/timers?limit=200`, sorted by `next_timer_at` ascending. It searches that list for its own instance. When that instance's timer sits past place 200, the header shows "No timer armed", although one runs.
- Location: `packages/web/src/areas/admin/screens/InstanceScreen.tsx:150-154`, `:250`, `:261`; `src/engine/admin-queries.ts:48`, `:178-194`
- Severity: low
- Evidence: confirmed (code). Whether a tenant exceeds 200 is an operations question.
- Known: ponytail marker `InstanceScreen.tsx:150` (not in `decisions.md`)
- Suggestion: Add an `instanceId` filter to `GET /admin/timers`, or deliver the timer in the `InstanceView`. This is an API change (spec `admin-operations-api`).

### F-10: Outbox `Discard` acts with no confirmation, `Retry` asks

- Case: On `/admin/outbox` a `dead-letter` row has `Retry` and `Discard`. The button `Retry` asks through `confirm`. The button `Discard` sets `discarded` at once. After that no retry is possible, since a requeue works only from `dead-letter`. The side effect never goes out.
- Location: `packages/web/src/areas/admin/screens/OutboxScreen.tsx:172-195`; `src/engine/admin-queries.ts:232-235`, `:251-254`; spec `admin-app/spec.md:330-337` (requires the confirmation only for `Retry`)
- Severity: low
- Evidence: confirmed
- Known: new (same class as `decisions.md:939`, Cancel instance)
- Suggestion: Ask before `Discard`, with the text: final, no retry afterwards.

### F-11: A failed column choice appears as an empty choice

- Case: The request `POST /reporting/reports/columns` fails (for example 500). The builder silently sets `choices` to `[]`. The field picker is empty, and the builder disables "Add comparison". No error message appears.
- Location: `packages/web/src/areas/reporting/screens/ReportBuilderScreen.tsx:165-171`; `ColumnEditor.tsx:244-271`; spec `openspec/specs/spa-error-reporting/spec.md:14-20`, `:67-71`
- Severity: low
- Evidence: confirmed
- Known: new
- Suggestion: Hold the error in state and show it as an `ErrorNote`.

### F-12: Tabs do not synchronize the session, and a stale tab can write a logged-out session back

- Case: Tab A and tab B both hold a signed-in session. In tab A, a click on "Logout" deletes the key `web.session`. Tab B keeps the session in memory, since it has no `storage` listener. A language pick in tab B makes `persistSession` write the old session back. After a reload, tab A holds a session again. When another account signs in on tab A, tab B overwrites that session the same way.
- Location: `packages/web/src/shell/App.tsx:80-84`, `:89-95`, `:116-121`, `:174-176`; `session.ts:64-70`; `git grep 'addEventListener("storage"'` in `packages/web`: no hit
- Severity: low
- Evidence: confirmed (code). Logout runs in the browser only. The token stays valid on the server until it expires, since `src/http` has no logout route.
- Known: new (SEC-4, `decisions.md:694`, covers only the storage location and leaves out the synchronization)
- Suggestion: Listen for the `storage` event on `SESSION_STORAGE_KEY` and align the state.

### F-13: The first page load waits on `/ui-strings` with no time limit

- Case: When `GET /ui-strings` hangs (the engine is reachable, the response never comes), `main.tsx` shows nothing. The result is a white page with no login, until the browser abandons the request. The comment there names the build targets `es2020`/`chrome87`. The file `vite.config.ts` sets `chrome114`/`safari17`/`firefox125`.
- Location: `packages/web/src/main.tsx:16-27`; `packages/web/src/i18n/overrides.ts:43-54`; `packages/web/vite.config.ts:72`
- Severity: low
- Evidence: code confirmed (no timeout, no `AbortSignal`). The audit assumes the hanging route.
- Known: new (`spa-error-reporting` names "a blank page" as a state to avoid)
- Suggestion: Use `AbortSignal.timeout(…)` in the fetch. Align the comment with the real targets.

### F-14: The tab announcement expands `$` patterns from the tab label

- Case: A tab carries the label `Kosten $&`. After a rejected submission, the live region announces "…{tab}…" instead of the label. The reason: `replace` with a string replacement expands `$&`.
- Location: `packages/form-ui/src/tabs.ts:175-182`; call site `TaskScreen.tsx:487-492`
- Severity: low
- Evidence: confirmed
- Known: `decisions.md:1217-1239` (FIELDS-19). This site lies in `packages/form-ui` and is missing from the count there, which covers `packages/web/src`.
- Suggestion: A replacement function `() => tabLabel`.

### F-15: Dead exports and arguments

- Case: these have no caller in product code.
  - The functions `deleteReport` and `executeReport` (`reporting/api/client.ts:71-77`). The graph shows `in_degree 0`. The tests import the engine functions of the same name.
  - The function `fieldLabel` (`reporting/screens/reportsLogic.ts:112-114`). It returns `fieldId` in both branches, `in_degree 0`.
  - The prop `PathButtons.style` (`PathButtons.tsx:16-19`). Only one test sets it.
  - The argument `baseLocale` of `issueMessage` and `issueCountText` (`issue-messages.ts:61`, `:79`). The calls at `FieldForm.tsx:430` and `:753` never pass it, and `UiLocale` knows only en and de.
  - Exported types and constants with no importer: `OPTION_ATTRIBUTE_SEPARATOR` (`FieldForm.tsx:286`), `WireField` (`form-ui` `types.ts:10`), `InstanceKind`, `DataListValue` (`admin/api/types.ts:8`, `:209`), `InboxGroup` (`inboxLogic.ts:44`), `ShellLocation` (`shell/routing.ts:14`), `LocaleSyncDeps` (`localeSync.ts:20`). Also `OutboxListParams`, `MigrationBucket`, `AccountName`.
- Severity: low
- Evidence: `git grep` over `packages`, `src`, `test` and `e2e`, plus the graph for the three functions. No LSP was available (see "Not checked").
- Known: new. Entry 41 at `decisions.md:1793-1800` protects only exports with a test importer. None of the exports here has one.
- Suggestion: Delete the functions. Delete the `export` keyword from types used only locally.

### F-16: `form-ui` declares React 18 as a peer, the consumer uses React 19

- Location: `packages/form-ui/package.json` (`peerDependencies.react: "^18"`, `react-dom: "^18"`); `packages/web/package.json` (`react: "^19"`)
- Severity: low
- Evidence: confirmed (manifests read)
- Known: new
- Suggestion: Set the peer range to `^19` (or `^18 || ^19`).

### F-17: Migrations screen with no refresh button and no focus refetch

- Location: `packages/web/src/areas/admin/screens/MigrationsScreen.tsx` (no `useRefresh`, no refresh control; counted by grep); spec `admin-app/spec.md:816-820` ("Every screen SHALL offer an explicit refresh control")
- Severity: low
- Evidence: confirmed
- Known: new
- Suggestion: Add `useRefresh` and a button as in the other admin screens.

### F-18: The users and groups screens load the whole directory on every window focus

- Case: With 5 000 accounts, `/admin/users` loads 25 pages in sequence on every Alt-Tab. The screen `/admin/groups` also loads all groups and `GET /processes`.
- Location: `UsersScreen.tsx:257-283`; `GroupsScreen.tsx:198-236`; `useRefresh.ts:12-15`
- Severity: low
- Evidence: confirmed (code). The counts are an assumption.
- Known: new (the full load itself has a reason, `UsersScreen.tsx:261-265`)
- Suggestion: Throttle the focus refetch, for example only after a minimum interval.

## Checked without a finding

- XSS, raw HTML: `packages/web` (without studio) and `packages/form-ui` have no `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval` or `new Function` (`git grep` empty). Authored content (labels, notes, options, tab labels) goes out as JSX text: `FieldForm.tsx:417`, `:467`, `:496`, `:546-552`. Comment text: `TaskScreen.tsx:585`. The dependencies have no Markdown renderer (`packages/web/package.json`, `packages/form-ui/package.json`).
- The attributes `href`/`src` from data: no `<a href>`, `<img>`, `<iframe>`, `window.open` or `location.href` from data (`git grep`). The app fetches attachments and CSV as a Blob and saves them through `download`, never inline: `TaskScreen.tsx:402-411`, `ReportBuilderScreen.tsx:221-236`. This matches SEC-8 (`decisions.md:719`).
- CSP: the meta tag sets `script-src 'self'`, `object-src 'none'`, `base-uri 'none'` in the build only (`packages/web/csp.ts:19-37`, included at `vite.config.ts:52`). Headers: `frame-ancestors 'none'`, `nosniff`, `X-Frame-Options DENY` (`src/http/static.ts:39-44`, `docker/nginx.conf:23-26`).
- Token storage: only the key `web.session` (`session.ts:16`, `:64-70`). SEC-4 records it as accepted, so this audit does not report it again.
- Logout clears the browser state: it deletes the key, empties the state and shows the login (`App.tsx:80-84`). The language choice stays on purpose (`localeSync.ts:7-10`).
- A 401 in app, admin and shell: `useFail` (`useFail.ts:17-27`) in every app and admin screen. The `TaskScreen` has its own ladder with `is401` (`TaskScreen.tsx:233-236`). So does the `ProfilePage` (`ProfilePage.tsx:105-106`). Exception: reporting, F-4.
- Headless boundary: the area reaches the engine only through `workflow-engine/<exports map entry>` and HTTP. No relative path leaves `packages/web` or `packages/form-ui` (`git grep` for 4+ `../` empty). The package `form-ui` imports only `workflow-engine/schema` (`types.ts:1`, `locale.ts:1`, `FieldForm.tsx:2`, `issue-messages.ts:1`).
- Polling: no `setInterval`, `setTimeout` or `requestAnimationFrame` in the area (`git grep` empty). The screens detach their focus listeners on unmount (`useRefresh.ts:12-15`, `TasksScreen.tsx:164-169`, `StartedScreen.tsx:161-166`, `InvolvedScreen.tsx:162-167`).
- Code splitting: one `lazy()` per area (`App.tsx:42-53`). The shell pulls only `form-ui/tokens.stylex` (`git grep`). Catalogs load per area: only `uiStringsLogic.ts` imports `i18n/catalogs/index.ts`. The coordinator measures the bundle size.
- Unhandled rejections (old ERR-2): every async path catches. The statement `throw err` appears only in `fetchPage` adapters, which `usePagedList` catches (`usePagedList.ts:53-57`, `:68-72`). Also `App.tsx:125-127`, `localeSync.ts:36-38`, `overrides.ts:51-53`, `LoginScreen.tsx:56-63`.
- A list shows a stale row after a mutation: not found. Claim, release and delegate reload the view (`TaskScreen.tsx:341-362`). The buttons `Submit` and `Discard` navigate to the inbox, which reloads (`TaskScreen.tsx:368`, `:381`). Admin mutations call `refresh()` (`OutboxScreen.tsx:177`, `:189`; `UsersScreen.tsx:290`, `:341`; `InstanceScreen.tsx:279`, `:292`).
- An error shown as an empty list: the empty states check `!error` (`TasksScreen.tsx:204`, `StartedScreen.tsx:175`, `StartScreen.tsx:84`, `InstancesScreen.tsx:214`, `OutboxScreen.tsx:232`, `TimersScreen.tsx:143`, `ReportsListScreen.tsx:116-118`). Exception: F-11.
- Reporting views: a cancel flag against stale responses exists (`CycleTimeScreen.tsx:113-121`; `ReportsListScreen.tsx:93-105`). This audit did not check the CSV export (agent C). It did check how the export shows an error (`ReportBuilderScreen.tsx:234`, `:347`).
- Large lists: list routes page with a limit of 200 (`src/runtime/internal.ts:31`, `src/engine/admin-queries.ts:48`). Sorting and grouping in the inbox cover at most the loaded pages (`inboxLogic.ts:36-68`). Exception: F-18.
- Validation in `form-ui` against the engine: no browser-side check, on purpose (`FieldForm.tsx:529-540`; `form-ui` spec `:234-238`, `:336-340`). The native types `date`, `datetime-local` and `email` match `formatMatches` (`definition.ts:551-566`). The two differ only for empty values and zoned times (F-3).
- The action `Discard case` with no confirmation: the spec requires it this way (`openspec/specs/end-user-app/spec.md:397-401`), so no finding.
- Claim controls: the mirror of `isEligibleCandidate` matches the engine exactly (`claimLogic.ts:29-31` against `src/engine/transition.ts:95-97`). The engine resolves groups to account ids at step entry.
- The ponytail marker outside studio: exactly one site (`InstanceScreen.tsx:150`). Its limit is reachable: F-9.
- Abstractions with one implementation: `usePagedList.reset` (only `InstanceScreen`, with a reason at `usePagedList.ts:17-23`), `useRefresh` (only admin). The `useFail` shape and `accountName.ts` both stand among the refused simplifications (`decisions.md:1736-1741`, `:1825-1831`). This audit does not propose them again.

## Repro proposals

1. F-1: Production build, `playwright-cli -s=auditF`. Open `/admin/data-lists/<key>` and change a value label. Then run `page.evaluate(() => window.dispatchEvent(new Event("focus")))` through `run-code`, and read the label input. Expected per the finding: the server value instead of the input. Repeat on `/admin/ui-strings`.
2. F-2: As a candidate, claim an instance of `expense_approval` and submit the step (HTTP `POST /instances/:id/claim`, then `/submit`). The call `GET /instances/:id` shows an empty `assignment.claimedBy`. The page `/admin/instances/:id` shows "Claimed by <id>".
3. F-3:
   - (a) In `bun repl` or a test, `JSON.stringify(filterToEditable({ f: undefined }, [field f editable]))` yields `{}`. With an instance whose number field holds 120, clear the field and submit. Then `GET /instances/:id` shows the value still at 120.
   - (b) Set an optional `format: "date"` field, clear it and submit. The result is the check result `type-mismatch` expected `date`.
   - (d) Show a readonly `datetime` field with the value `2026-10-10T12:00:00Z`. The input stays empty.
4. F-4: Set an invalid token with the role `system:reports` in `localStorage["web.session"]` and open `/reporting`. The spec expects the login screen. Per the finding, the error note appears.
5. F-5: Open the builder, add a comparison, choose the comparison "in" and type `a,b`. Read the input content. Also run `eq` on `amount` with an existing amount and open the preview. Per the finding, expect 0 rows.
6. F-6: Run a browser with `TZ=Europe/Zurich` and set "Bis" ("To") in the builder. Read the request body of `POST /reporting/reports/preview`. The value `createdBefore` ends in `T00:00:00.000Z` of the chosen day (UTC).
7. F-7: Use `playwright-cli route` to delay the first response to `/admin/instances?*processId=proc_expens*` by 2 s. Then finish typing `proc_expense` and read the final state of the table.

## Not checked

- No execution (by instruction): no build, no test, no browser. The coordinator measures the bundle size.
- LSP references: the tool does not start (`TypeScript 7.0.2 … provides no tsserver.js`). Replacement: `git grep` over `packages`, `src`, `test` and `e2e`, plus the codebase-memory graph (`in_degree`).
- The studio area (by instruction) and the CSV export (agent C).
- The known 22 error renderings without `role="alert"` (`decisions.md:460`): not counted again. Accessibility beyond the check questions stays unrated, for example `role="menu"` with `<select>` in `Chrome.tsx:233-257`.
- The audit read these files only in excerpts: `ColumnEditor.tsx`, `ShareEditor.tsx`, `ReportTable.tsx`, `BottleneckScreen.tsx`, `SlaScreen.tsx`, `ProcessPickerScreen.tsx`, `DataListsScreen.tsx`, and `GroupsScreen.tsx` from line 250 on.
