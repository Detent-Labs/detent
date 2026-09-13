## Context

See proposal.md, "Why", for the measured double press.

The process list lives in
`packages/web/src/areas/studio/screens/ProcessesScreen.tsx`. Its `createDraft`
function, at line 366, runs three steps in order. It reads the published
version through `seededDraftInput`, writes the draft through `saveDraft`, and
calls `navigate`. The row's "Create draft" button, at line 579, has no
`disabled` prop. Every press runs all three steps again.

The second write lands because of the engine's create rule. The engine's
`saveDraft` in `src/engine/drafts.ts` inserts a row at `revision` 0 when none
exists. A second `PUT` at `revision` 0 finds that row and runs the conditional
`UPDATE` instead. That statement matches revision 0 and moves the row to
revision 1. The editor loaded revision 0, so its first save answers 409.

The engine cannot tell the two writes apart. An editor's first save of a fresh
draft sends `revision` 0 too, on purpose.

The studio client's own `saveDraft` answers a 409 with `undefined` and throws
nothing. The screen's `createDraft` then opens the edit screen anyway. That
path stays as it is.

The screen receives the area's unguarded `navigate`, at
`packages/web/src/areas/studio/root.tsx:160`. A route away from the process
list unmounts the whole screen.

The package `packages/web` has no DOM test library. Studio keeps testable
logic in a pure module beside each screen. For the process list that module is
`processListLogic.ts`, and `packages/web/test/studio-processListLogic.test.ts`
tests it.

## Goals / Non-Goals

**Goals:**

- One press on a row's "Create draft" sends at most one read and one write.
- A helper owns the hold, and a `bun:test` suite drives it with no DOM.

**Non-Goals:**

- The "+ New process" start picker. Its `startProcess` calls
  `setPicking(false)` before its first `await`, so the dialog closes ahead of
  the write. Each pick also mints its own process id through `mintId`. A
  second pick writes a second process and never moves the first draft's
  revision.
- The row's "Versions" button. It sends no write, so it cannot move a draft's
  revision.
- A 409 on the create write. The client's `undefined` answer stays as it is.
- A refusal of a repeated create on the server. The first decision below
  states why.

## Decisions

### Shape brief

An `/impeccable shape` pass on the process list produced this brief. No
interview or confirmation round ran, so the owner's decisions of 2026-09-13
stand in for both. It follows the "Buttons" list in `DESIGN.md` and the "Actions" rule in
`.claude/rules/design-language.md`.

- **Job.** An author wants to continue a published process as a draft. One
  press opens the edit screen on a draft the editor can save. The mode is
  Operate.
- **Idle state.** "Create draft" reads as a secondary button, as today.
- **Writing state.** The same button drops to 45% opacity with
  `cursor: not-allowed`. The rule `.btn:disabled` in
  `packages/web/src/shell/tokens.css` already draws both.
- **Failed state.** The button reads enabled again. The screen's error banner
  states the error above the table.
- **Interaction.** The first press takes the hold, and further presses on that
  button do nothing. Every other row keeps its own button. The label never
  moves off "Create draft", unlike the header bar's Save and Publish.
- **Accessibility.** The button takes the native `disabled` attribute. Its
  label stays, so its accessible name stays. It gets no `aria-busy` and no live
  message. The decision on native `disabled` below says why.

### A helper owns the hold, with a synchronous check

The logic module gains `createInFlightGuard(onHeldChange)`. It returns a
function `run(key, write)`, which behaves this way:

- It reads its held set before its first `await`, inside the press's own
  handler. A held key resolves `false` and never calls `write`.
- Otherwise it adds the key and passes a copy of the set to `onHeldChange`.
  Then it awaits `write`.
- A rejected `write` frees the key and passes the set again. Then it
  rethrows the same error.
- A resolved `write` leaves the key held and resolves `true`.

React commits a click's new state in a microtask, before the browser
dispatches the next click. React state alone would therefore disable the
button in time. The helper exists so a `bun:test` suite can drive the rule
with no DOM. Its check runs before the first `await`, so two calls in one
tick still write once.

The copy matters as well. React skips a re-render when the new state is the
same object. A mutated set would never disable the button.

Alternatives considered:

- React state alone, or a `useRef` set inside the screen. Either holds the
  button, but no test reaches it without a DOM.
- A create-only mode for `PUT /drafts/:processId`. The engine cannot tell a
  repeated create from an editor's first save at `revision` 0. A new flag
  would also reach the HTTP route and its spec, for a double press in one
  browser.

### A successful write keeps its key held

The write ends in `navigate`, and the route away unmounts the screen. Today a
key freed in a `finally` commits in that same render, so no press could land.
A later visit mounts a fresh screen, and that screen creates a fresh guard.
The row then offers "Open" instead, since its draft exists.

Alternative considered: free the key on either outcome. It adds a call, and a
later transition around `navigate` would let a second press through.

### The screen mirrors the held set into state

The screen keeps a `creating` state holding a `ReadonlySet<string>`, empty at
mount. It creates the guard once, through a lazy
`useState(() => createInFlightGuard(setCreating))`. A `useRef` argument would
create and drop a guard on every render.

The function `createDraft` hands its read, its write and its `navigate` to
`run` as one callback. Its `catch` stays `fail(err)`, so the error banner
reports a failed write exactly as today. The row's button reads
`disabled={creating.has(row.processId)}`.

### Native `disabled`, with no `aria-busy` and no live message

The Publish control in `panels/ProcessHeaderBar.tsx` sets the precedent for
the attribute. Its comment at line 313 keeps a request in flight on the
native `disabled` attribute. That state has no reason to read. "Create
draft" follows that attribute and departs from its label swap.

Seven studio buttons swap their label while a request runs, among them the
header bar's Save and Publish. The error banner's Retry on this screen keeps
its label while the list reloads. This row keeps "Create draft" as Retry
does. A swap here needs a new string. A catalog key falls outside this
proposal, and a literal adds to the screen's hardcoded English.

The attribute `aria-busy` marks a region whose content is still loading.
Screen readers announce nothing for it on a button. A live message would add
nothing either. A success replaces the list with the edit screen. A failed write
raises the error banner, which already has `role="alert"`.

### The browser check slows the write

No `bun:test` assertion presses a rendered button twice and reads the network
log. The check therefore lands in `docs/browser-checks.md`, by the split rule
in `development-toolchain`.

The check delays each `PUT` to `/drafts/` by 20000 ms. Two ways work. In the
browser's dev tools, a custom throttling profile with 20000 ms of latency slows
every request. With `playwright-cli`, pass `-s=process-list-create-once` on
every call. Then run this function through `run-code`:

```js
async (page) => {
  await page.route("**/drafts/*", async (route) => {
    if (route.request().method() === "PUT") await page.waitForTimeout(20000);
    await route.continue();
  });
}
```

A locator click waits for an enabled button. The extra press therefore goes
through `page.mouse.click` at the button's center, which dispatches a trusted
event.

Under `playwright-cli`, steps 2 and 3 run as one `run-code` call. Separate
calls each cost an agent turn, and three turns can outlast the delay. The
`getByRole` lookup resolves only while the name reads "Create draft":

```js
async (page) => {
  const row = (key) => page.getByRole("row").filter({ hasText: key });
  const pressed = row("it_offboarding").getByRole("button", { name: "Create draft", exact: true });
  const other = row("access_request").getByRole("button", { name: "Create draft", exact: true });
  const read = (button) => button.evaluate((el) => ({ disabled: el.disabled, opacity: getComputedStyle(el).opacity }));
  await pressed.dblclick();
  const result = { pressed: await read(pressed), other: await read(other) };
  const box = await pressed.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return result;
}
```

In dev tools, blocking the `/drafts/` request URL fails the write in step 6
below. Under `playwright-cli`, this function answers the `PUT` with a 500
instead:

```js
async (page) => {
  await page.unroute("**/drafts/*");
  await page.route("**/drafts/*", (route) =>
    route.request().method() === "PUT" ? route.fulfill({ status: 500 }) : route.continue(),
  );
}
```

The entry uses `it_offboarding` for the pressed row and `access_request` for
the other row. Both come from the seeded demo data. The seeding account is
`demo-superuser@example.test`, password `seed-demo-password`, as the entries
above it use.

The entry's steps and pass lines:

1. Reload `/studio/` so the request log starts empty. Read the
   `it_offboarding` and `access_request` rows. Pass: each reads an em dash
   under Draft. Discard a draft first where a row has one.
2. Install the delay. Double-click that row's "Create draft". Read both rows'
   buttons within the 20 seconds. Pass: the pressed button reports `disabled`,
   a computed `opacity` of 0.45 and the accessible name "Create draft". The
   `access_request` button reports no `disabled`.
3. Press the disabled button once more, using `page.mouse.click` for that
   press, then wait for the edit screen. Pass: the log lists one `PUT` to
   `/drafts/<id>`. Before that `PUT` it lists one `GET` of
   `/processes/<id>/versions/<v>`. The `GET` of that URL after the edit
   screen opens is the Changes tab's base read.
4. Take the delay off. Under `playwright-cli`, a `run-code` call to
   `page.unroute("**/drafts/*")` does that. Edit the process label. Press
   Save. Pass: the header bar reads "Saved". No conflict banner shows.
5. Go back to the process list. Choose "Discard" on the `it_offboarding` row.
   Accept the browser's confirm. The header bar's own "Discard draft" does
   nothing, per DRAFT-1 in `docs/decisions.md`.
6. Install the 500 route. Press that row's "Create draft". Pass: the error
   banner shows its "Failed" stamp. The row still reads an em dash under
   Draft. Its button reports no `disabled`.
7. Take the 500 route off. Under `playwright-cli`, a `run-code` call to
   `page.unroute("**/drafts/*")` does that. Press "Create draft" once more.
   Pass: the edit screen opens. Discard that draft the way step 5 did.

## Risks / Trade-offs

- [Two rows pressed in one wait both write.] → Neither write moves the other
  draft's revision. Each draft belongs to its own process. Each write
  navigates once it lands. The owner kept the rows independent. The later
  navigation leaves the first edit screen with no unsaved-changes prompt, as
  today.
- [A disabled button can lose keyboard focus.] → A success opens the edit
  screen within the wait. A failed write announces itself through the banner's
  `role="alert"`. The Publish control accepts the same trade for its own
  pending state.
- [A 409 on the create write still opens the edit screen.] → The hold stops
  the measured cause. Any other cause keeps today's path.

## Migration Plan

The work touches the browser bundle alone. It ships with the next bundle of
`packages/web` and needs no data step. A rollback reverts the commit.

## Open Questions

None. The owner settled the scope on 2026-09-13. That covers what a failed
write does and the start picker's exclusion.
