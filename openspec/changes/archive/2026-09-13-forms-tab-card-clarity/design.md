## Context

See `proposal.md` for the motivation. The card lives in `FormCard`, inside
`packages/web/src/areas/studio/panels/FormsTab.tsx`. Its head holds the
kicker and a name span. The span has no id. The `Miniature` component
follows the head. The foot holds a count span and the open control, a
`btn btn-ghost` button with no ARIA attribute.

Today `Miniature` renders one element with `role="img"`. Its `aria-label`
comes from `formsTab.miniatureLabel` or `formsTab.miniatureLabelOne`. On a
card whose `fieldCount` is 0 it renders a `<p>` reading "No fields yet"
instead. The foot's count span reads "Empty form" on such a card.

The pure function `formCardRows` in `formCardRows.ts` sets `fieldCount` to
`viewEntries.filter(isDraftViewField).length`. That count takes in group
entries. It sets `requiredCount` from the entries without a group break. The
foot's style sets `justifyContent: "space-between"`, so a lone child sits at
the row's start edge.

The owner answered the three questions of `docs/decisions.md` on 2026-09-13.
They approved the result on a mockup built from IT Offboarding's real rows.

Mockup: <https://claude.ai/code/artifact/c367e2d4-d53d-42f1-aa50-8ed51f096d2b>

## Goals / Non-Goals

**Goals:**

- Each open control on IT Offboarding carries an accessible name no other
  card shares.
- A card states each fact once. The empty state appears once, and a screen
  reader hears the counts once.
- The count's number matches the marks an author sees.

**Non-Goals:**

- A legend for the marks (FORMS-2). The owner deferred it.
- Any change to the miniature's drawing, the grid, the badge or the colors.
- Any change to the step page's own count, "32 / 51 fields configured" in
  `StepPage.tsx`.
- A new catalog key, or a renamed one.
- A CEL-conditional required entry (FORMS-5). `required: true` stays the
  rule.

## Decisions

### Shape brief

The brief below comes from `/impeccable shape`, run with the approved mockup
as the fixed direction.

- **Job and audience.** An author comes to find a form, open it, or spot a
  problem. An author on a screen reader does the same through the button
  list and the reading order. The mode is Operate.
- **Direction.** The incumbent world from `DESIGN.md` stays. Sighted authors
  see two differences: the foot's longer count, and an empty card's foot
  holding the control alone.
- **States and ranges.** IT Offboarding's forms hold 5 to 26 marks and 0 to
  7 required entries. Prepare the Offboarding and Offboarding Closed hold
  none required. An empty form has no entry, notes alone, or group entries
  alone. A form of one mark reads "1 field" or "1 field, 1 required".
- **Layout and interaction.** The count stays left in the foot and the
  control stays right, on one line. The tab order does not move. The
  miniature still takes no focus and no pointer input.
- **Accessibility.** The control's name begins with its visible words,
  as WCAG 2.5.3's guidance recommends, then names the step. The miniature leaves the
  accessibility tree.

### The open control names its step through `aria-labelledby`

`FormCard` mints two ids with React's `useId`, one for the name span and one
for the control. The control's `aria-labelledby` lists its own id first,
then the name span's. The accessible name computation joins the two texts
with a space: "Open the form Submit the Exit Notification".

The joined name builds no sentence from catalog fragments. One key still
holds the whole visible phrase. An author writes the step's label, and WCAG
2.5.3's guidance puts the visible words first. Two steps sharing one
label still share one name, so the spec promises distinct names only for
distinct labels.

`useId` keeps the ids unique across twelve cards.
`renderToStaticMarkup` prints them, so a markup test reads both references.
`CanvasBar.tsx` and `Chrome.tsx` already mint ids this way.

Alternatives considered:

- **`aria-describedby` on the name span.** A screen reader's list of buttons
  shows names alone. All twelve entries there would still read "Open the
  form".
- **`aria-label` from a new key, "Open the form: {step}".** A translator and
  an operator would keep two strings in step. The `ui-string-overrides`
  capability lets an operator override one key and leave the other.
- **A visually hidden step name inside the button.** The studio's
  visually hidden recipe escapes its container today, FIELDS-2 in
  `docs/decisions.md`.

### The count counts marks

`fieldCount` becomes the number of `entries` without a group break. A
reference the catalog no longer declares still draws a one-line mark, so it
still counts. `requiredCount` keeps its rule. The doc comment on
`FormCardRow.fieldCount` names entries that draw a mark.

`FormCard` keeps `empty` as `row.fieldCount === 0`. A view of group entries
alone therefore reads as empty. Its card shows "No fields yet" and "Start the
form".

The alternative kept group entries and added sections, as in "26 fields in 6
sections". The group breaks already show the sections, and the text would
crowd the foot. The owner chose to count marks.

### The foot states both counts, and the miniature leaves the tree

The foot's text follows one table:

| `fieldCount` | `requiredCount` | Key | Reads |
|---|---|---|---|
| 0 | 0 | none | no text |
| 1 | 0 | `formsTab.fieldCountOne` | 1 field |
| 1 | 1 | `formsTab.miniatureLabelOne` | 1 field, 1 required |
| 16 | 0 | `formsTab.fieldCount` | 16 fields |
| 26 | 7 | `formsTab.miniatureLabel` | 26 fields, 7 required |

The keys keep their names, so the catalog's diff stays at one retired key. A
rename to names that describe the foot stays open for a later change. No
deployment runs this engine yet, so neither choice strands an override. The
catalog comment over them moves from the miniature to the foot.

The miniature drops `role` and `aria-label` and takes `aria-hidden="true"`.
Its marks have no text, so hiding it takes nothing a reader needs.

The alternative kept the miniature's name and left the foot's count as it
is. A sighted author would then never see the number behind the filled
marks. The visible required count explains the fill, which is why the
legend can wait.

### The empty card's foot holds the control alone

The count span renders only where `fieldCount` is above 0. The catalog
retires `formsTab.emptyForm`, since `FormsTab.tsx` was its one reader. The
`openControl` style takes `marginInlineStart: "auto"`. A lone control then
keeps the trailing edge, and beside a count the row already puts it there. A
style assertion in `studio-guidedSurfaceStyle.test.ts` holds the declaration.

Alternatives considered:

- **Drop "No fields yet" and keep "Empty form".** The design language puts
  a state's words where the content would sit. It does so for a failed
  request and for a wait. The owner chose the sentence in the miniature's
  place.
- **Keep an empty count span.** It would add an element with no content to
  every empty card.

### The height budget holds

The foot row stays one control tall. At three columns in a 1100px window a
card's content box measures about 316px. "26 fields, 7 required" at 0.85rem
takes about 140px, beside the control's 94px. The narrowest 280px track
leaves 254px, which still fits that text.

### The delta replaces two requirements

Two base scenarios state the rule this change reverses. One is "A group
entry counts as a field entry", the other "The miniature names its counts".
A MODIFIED block must keep every base scenario. The strict validator refuses
a block that drops either one.

The delta therefore removes the two requirements that hold them. Two added
requirements replace them under new names. The requirement on the open
control keeps its scenarios, so it stays a MODIFIED block. The CLI's archive
appends an added requirement at the spec's end. The sync step moves each one
by hand to its removed one's place.

Code and test comments that quote a removed name take the added name
instead. The same tasks rewrite comments on the miniature's accessible name.

### `docs/decisions.md`

The change removes FORMS-1, FORMS-3 and FORMS-4. The other entries keep
their tags. The section's paragraph on the owner's three questions records
the answers instead. FORMS-2 records that the legend waits, since the foot's
required count now stands under the filled marks. FORMS-5 notes that its
under-count now reaches the foot's text as well.

The entries that stay cite lines in files this change moves. The decisions
task re-reads each such citation once groups 1 to 3 have landed.

## Risks / Trade-offs

- [The step page reads "32 / 51 fields configured" where the card reads "26
  fields, 7 required"] → The two numbers measure different things. The step
  page counts configured catalog rows against the catalog's total, groups on
  both sides. The card counts what a participant fills in.
- [A view of group entries alone offers "Start the form"] → Such a form asks
  nothing of a participant. Both words open the same route.
- [The joined name has no punctuation] → The name still leads with the
  visible words. The Decisions section rejects a punctuated catalog key.
- [An override on `formsTab.emptyForm` shows nowhere] → No deployment runs
  this engine yet, so no override exists to strand.
- [A three-digit count wraps at the narrowest track] → The text wraps in its
  own span. The row grows one line, and the control keeps its edge. IT
  Offboarding's longest count fits.
- [FORMS-5's under-count now shows as text] → FORMS-5 stays filed, and its
  entry names the foot.

## Migration Plan

No data, route or definition change. The next web bundle ships the card.
Reverting the commit restores today's card.

## Open Questions

None.
