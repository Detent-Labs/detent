# Design

## Context

See `proposal.md`, Why. The process list is `screens/ProcessesScreen.tsx`.
Its rows come from `screens/processListLogic.ts::deriveProcessRows`, which
merges `GET /processes` with `GET /drafts`.

- `GET /processes` already sends `publishedAt`, `key`, `label` and
  `baseLocale` for the newest version (`src/engine/definitions.ts::listProcesses`).
  The web mirror `ProcessSummary` lacks `publishedAt`.
- `GET /drafts` sends `processId`, `revision`, `baseVersion`, `updatedBy`
  and `updatedAt` (`src/engine/drafts.ts::listDrafts`). A never-published
  process therefore has no name the list can read.
- `updatedBy` is the saving actor's id. Under the login resolver that id is
  an `auth_users.user_id`. Under `devHeaderResolver` it can be any string.
- `src/auth/users.ts::resolveDisplayName` is the one resolution of a
  displayable name: `display_name`, or the email while that is `NULL`.
- The studio has no `<a href>` yet. Navigation goes through `navigate(route)`,
  which calls `go(areaHref("studio", routePath(route)))`.
- `e2e/publish.e2e.ts` finds its row by a cell whose name is the key
  `laptop_inventory`, then clicks Open. CI runs the e2e job.
- `environment-promotion` requires that a repeated import reports the
  existing version and hash. The import result line keeps its hash.

## Shape brief

This is the result of `/impeccable shape process list`, run on
2026-10-31. The owner pre-approved every decision for stage 64 and asked
for no interview. The brief therefore states its assumptions instead of a
confirmation round. The mode is Operate.

1. **Job and audience.** A process author arrives at `/studio` to reach a
   process. They open its draft, start one, or look at what runs. They
   recognise a process by its name and a colleague by their name. They scan
   9 to 50 rows.
2. **Outcome and proof.** The author finds the row by its name and
   activates the name. Each row answers two questions in words: is there
   unsaved work, and who left it when? What runs, and since when? Evidence:
   the nine seeded processes and a fresh "Untitled process".
3. **Selected direction.** The incumbent register stays: the ruled table,
   the 0.9rem body, the slate header legend, flush-left content. The table
   carries three columns of words and one column of commands. The name is
   the one link per row. Machine values move one disclosure away, into the
   same "Developer view" the change list's rows use.
4. **Scope and boundaries.** The table, the toolbar and the discard text.
   Untouched: both dialogs, the import result line, the error banner, the
   start picker, the Templates and Versions screens.
   Anti-goals: a stamp per row, chips, a side panel, a hover card. A draft
   names no state of the case, so it earns no stamp.
5. **States and ranges.** A row is one of three kinds: draft only, published
   only, or both. A name runs from empty ("Untitled process") to about 80
   characters and wraps. A display name may be an email. The times run from
   "just now" to years. The loading, empty and failed states keep their
   current one line or banner.
6. **Interaction and layout.** Tab order per row: the name link, the
   Developer view summary, then the commands. A plain click on the name
   navigates in place. A modified click or a middle click opens a new tab,
   as a link does. Hovering a time reveals the absolute date and time. The
   toolbar reads left to right: the one primary action, then the secondary
   import button. Below 40rem the table keeps its columns and the cells
   wrap; the studio stays a desktop tool, by decision.
7. **Constraints.** Strings come from the studio catalog. Mono only for the
   version number and the Developer view's values. `translate="no"` on
   every machine value. One primary action on the screen.

## Goals / Non-Goals

**Goals:**

- Every visible word on a row is the author's word: a name, a person, a
  time, a version number.
- The name is a real link, with a modified click that works as a link's.
- The toolbar speaks one register: two buttons.

**Non-Goals:**

- The discard confirmation stays a native `confirm()`. Change 13
  (`studio-one-dialog-form`) replaces all six prompts. This change only
  names the process in its text.
- The promotion-preview dialog keeps its key, id and hash. Checking those is
  its job, and an import is a developer's action.
- No `h1` joins the screen. The area nav already names it, and the header
  rows belong to changes 9 and 14.
- No "Saved by you". The screen receives no actor id today.

## Decisions

### D1. The name fields come out of the body in SQL

`listDrafts` selects `body->'key'`, `body->'label'` and
`body->'baseLocale'` beside the existing columns. The response still carries
no body. `toDraftSummary` narrows each value in TypeScript:

- `key`: the value when it is a string, else `null`.
- `baseLocale`: the value when it is a string, else `null`.
- `label`: for a JSON object other than an array, its string-valued
  entries. For any other value, `null`. An object with no such entry
  becomes `{}`.

`DraftSummary` gains `key: string | null`, `label: Record<string, string> |
null` and `baseLocale: string | null`.

Alternative: read the label from `GET /drafts/:processId` per row. That is
one request per draft and carries the whole body. Rejected.

### D2. The display name resolves in the route, through `users.ts`

`src/auth/users.ts` already exports
`displayNamesForUserIds(userIds: string[], db: SQL = sql): Promise<Map<string, string>>`.
It sends one query and resolves each row through `resolveDisplayName`. It
keeps a disabled account and leaves an unmatched id out of the map. An empty list
sends no query. Its one reader today is the person-field option resolution
in `src/runtime/fields.ts`. This change adds a second reader and names it in
the function's doc comment.

`handleListDrafts` filters first, then calls `displayNamesForUserIds` over
the de-duplicated `updatedBy` values of the remaining drafts. It answers each entry as the summary
plus `updatedByDisplayName: map.get(updatedBy) ?? null`. The engine's
`DraftSummary` gains no display name; the HTTP layer adds it. The route's
response type is `DraftSummary & { updatedByDisplayName: string | null }`,
exported from `src/http/studio-routes.ts` as `DraftListEntry`. The web
mirror in `api/types.ts` names that export in its comment, so the export
has a reader.

Alternative: a `LEFT JOIN auth_users` inside `listDrafts`. It would put a
second copy of the `COALESCE(display_name, email)` rule into SQL. The rule
lives in one function on purpose. Rejected.

### D3. One row description, drawn by one row component

`processListLogic.ts` gains a pure function
`describeProcessRow(row: ProcessRow): ProcessRowView`. It decides every
variant, and `ProcessesScreen` draws the result without a branch on row
kind of its own:

```ts
export type ProcessRowCommand = "createDraft" | "versions" | "discard";

export interface ProcessRowView {
  processId: string;
  name: string;          // the label text, or "" for an untitled process
  open: Route;           // { name: "edit", processId } or { name: "versions", processId }
  saved?: { by: string | null; at: string };
  published?: { version: number; at: string };
  seedVersion?: number;  // seedVersionFor(row): what Create draft seeds from
  developer: { key: string | null; processId: string; revision?: number; hash?: string; savedBy?: string };
  commands: ProcessRowCommand[];
}
```

The rules, in order:

- `name`: `localizedText(draft.label, draft.baseLocale ?? published.baseLocale ?? "en")`.
  When that gives `undefined`, use
  `localizedText(published.label, published.baseLocale)`. When that gives
  `undefined` too, use `""`. The component prints `""` as the catalog's
  "Untitled process".
- `open`: the route named `edit` when a draft exists, else the route named
  `versions`.
- `saved`: set when a draft exists. Its `by` is `updatedByDisplayName`.
- `published`: set when a version exists. Its `at` is `publishedAt`.
- `developer.key`: the draft's non-empty `key`. Without one, the published
  non-empty `key`. Without either, `null`.
- `developer.revision` and `developer.savedBy` come only with a draft.
  `savedBy` is the raw `updatedBy`. `developer.hash` comes only with a
  version.
- `seedVersion`: `seedVersionFor(row)`. The Create draft handler reads
  `view.seedVersion`, so `seedVersionFor` keeps its caller.
- `commands`, in this order: `createDraft` when no draft exists; `versions`
  when both a draft and a version exist; `discard` when a draft exists.

The new export `localizedText(label, locale)` returns `label?.[locale]` when
it is non-empty. Otherwise it returns the first non-empty value, or
`undefined`. The function `templateDisplayName` becomes
`localizedText(label, locale) ?? templateKey`. Its results stay the same,
with one exception. An empty entry for the shown locale now falls through
to the next one.

`sortProcessRows(views)` sorts by `name` with
`localeCompare(other, "en", { sensitivity: "base" })`. An untitled row sorts
as "Untitled process", so it does not lead the list. Ties fall back to
`processId`. `deriveProcessRows` keeps its own processId order, and the
screen sorts after narrowing.

Alternative: keep the branches in the JSX. The row has three kinds and five
facts, and every one of them would need a DOM test. Rejected: a
`studio-app` rule keeps testable logic out of the components.

### D4. Relative time

`relativeAgo(iso: string, now: number): string`, in `processListLogic.ts`.
Seconds `s = floor((now - Date.parse(iso)) / 1000)`, clamped at 0:

| Range | Output |
|---|---|
| `s < 60` | `t("processList.justNow")`, "just now" |
| under 60 minutes | `rtf.format(-minutes, "minute")` |
| under 24 hours | `rtf.format(-hours, "hour")` |
| under 30 days | `rtf.format(-days, "day")` |
| under 365 days | `rtf.format(-floor(days / 30), "month")` |
| otherwise | `rtf.format(-floor(days / 365), "year")` |

`rtf` is `new Intl.RelativeTimeFormat("en", { numeric: "always" })`, so
"1 day ago", never "yesterday". Each unit floors. The studio ships in
English only, so `"en"` matches its catalog.

The component prints each relative time as `<time dateTime={iso}>`. Its
`title` holds the absolute date and time, written inline as
`new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))`.
One caller and one expression keep it out of the logic module, per the
`studio-app` rule on extracted logic.

Each pass of the component reads `Date.now()` once. A list left open does
not tick. Its times move on the next load. That matches the still-page
rule.

### D5. The name is an `<a href>` that navigates in place

The link's `href` is `areaHref("studio", routePath(view.open))`. Its
`onClick` calls `navigate(view.open)` and `preventDefault()` only for a
plain primary click. The function `isPlainLeftClick(e)` in
`processListLogic.ts` decides that. It returns `true` for `e.button === 0`
with `defaultPrevented` false. Each of `metaKey`, `ctrlKey`, `shiftKey` and
`altKey` must be false too. The browser handles every other click.

The link takes the ink color and the body text at the table's size. It
underlines on hover only. A long name wraps through
`overflowWrap: "anywhere"`. The global `:focus-visible` ring already covers
the link. An untitled name prints in slate and stays a link.

### D6. The Developer view per row

Each Process cell holds the name, then a closed `<details>`. Its
`<summary>` reads "Developer view" and takes the change list's
`developerSummary` look: mono at 11px in slate, `fit-content`. The body is a
`<dl>` in the change list's `developerBox` look: a hairline box on the
ledger ground. It holds two columns of term and value, at 0.8rem:

| Term (catalog) | Value | When |
|---|---|---|
| "Key" | `developer.key`, or a dash for `null` | always |
| "Process id" | `processId` | always |
| "Draft revision" | `revision` | with a draft |
| "Published hash" | the full `hash` | with a version |
| "Saved by account" | `savedBy` | with a draft |

Each value takes `fonts.mono`, `translate="no"` and
`overflowWrap: "anywhere"`. The implementer copies the styles into
`ProcessesScreen.tsx`'s own `stylex.create()`. An area's file may duplicate
another file's style on purpose, and the change list lives in another
module.

Alternative: one screen-wide "Keys" toggle. It would be a new pattern
beside six existing per-row Developer views. Rejected.

### D7. The cells

- Draft: with `saved.by`, `t("processList.savedBy")`, "Saved by {name},
  {when}". Without it, `t("processList.savedAnonymous")`, "Saved {when}".
  The template splits at `{when}`. The `<time>` element takes that place.
  A replacer function fills `{name}`, so a `$` in a name prints as
  written. With no draft: `t("processList.noDraft")`, "No draft", in slate.
- Published: `v{version}` in mono with `translate="no"`, then " · ", then the
  `<time>`. With no version: `t("processList.notPublished")`, "Not
  published yet", in slate.
- Commands: `createDraft` is "Create draft", `versions` is "Versions",
  `discard` is "Discard draft". All keep `btn btn-secondary`, and discard
  keeps `btn-destructive`. Create draft keeps its in-flight `disabled`.

### D8. The toolbar

"+ New process" stays the one `btn btn-primary`. The import control becomes
`<button type="button" className="btn btn-secondary">`, holding the
`Upload` icon (18px, 1.75 stroke, `aria-hidden`) and the label "Import a
promoted version". Its `onClick` calls `fileInput.current?.click()`. The
file input keeps its `id`, `ref`, `accept` and `onChange`. It gains
`hidden`. The `fileLabel` style goes.

A hidden file input still opens its chooser on `click()` in every
supported browser.

### D9. The discard text

`t("processList.discardConfirm")` reads "Discard the draft of “{name}”?
You lose its unpublished edits.". `{name}` takes the row's name, or
"Untitled process". The `discard` handler therefore takes the row's view in
place of a bare id.

### D10. Catalog keys

All in `packages/web/src/i18n/catalogs/studio.ts`, in a new
`processList.*` block. Strings outside the table and toolbar stay literal.

| Key | Text |
|---|---|
| `processList.newProcess` | `+ New process` |
| `processList.import` | `Import a promoted version` |
| `processList.headProcess` | `Process` |
| `processList.headDraft` | `Draft` |
| `processList.headPublished` | `Published` |
| `processList.untitled` | `Untitled process` |
| `processList.savedBy` | `Saved by {name}, {when}` |
| `processList.savedAnonymous` | `Saved {when}` |
| `processList.noDraft` | `No draft` |
| `processList.notPublished` | `Not published yet` |
| `processList.justNow` | `just now` |
| `processList.developerView` | `Developer view` |
| `processList.devKey` | `Key` |
| `processList.devProcessId` | `Process id` |
| `processList.devRevision` | `Draft revision` |
| `processList.devHash` | `Published hash` |
| `processList.devSavedBy` | `Saved by account` |
| `processList.createDraft` | `Create draft` |
| `processList.versions` | `Versions` |
| `processList.discard` | `Discard draft` |
| `processList.discardConfirm` | `Discard the draft of “{name}”? You lose its unpublished edits.` |
| `processList.loading` | `Loading…` |
| `processList.empty` | `No processes yet.` |

## Risks / Trade-offs

- [A shared label] → Their Developer views tell the two rows
  apart. The sort keeps them adjacent, and the author fixes a duplicate.
- [A nameless account prints its email] → Only a co-developer reads it.
  The list narrows to the actor's own Developer list. A participant's person field prints the same resolved
  name through the same function. An account can set a display name on
  its profile page.
- [The e2e flow finds its row by the key] → Task 5 points it at a link.
  The link reads "E2E draft". `scripts/e2e.ts` gives the suite's draft that label.
- [`relativeAgo` floors months at 30 days] → "11 months ago" for day 359 is
  honest enough for a list. The `title` carries the exact time.
- [A hidden file input could stop opening in a future browser] → The browser
  check covers it. The button falls back to nothing silently, so the check
  must click it.

## Migration Plan

None. No stored data changes. A client from before this change ignores the
four new `GET /drafts` fields.

## Open Questions

None. The owner pre-approved the stage 64 decisions, and this design
settles the rest.
