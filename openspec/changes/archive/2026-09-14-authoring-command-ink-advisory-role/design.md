## Context

See `proposal.md` for the motivation. Every path below under `panels/` or
`screens/` starts at `packages/web/src/areas/studio/`.

The shell's `tokens.css` declares three color layers. Each primitive has a
dark override. The five ramp steps have none. A semantic role aliases a
primitive and follows that primitive's override. The one role that picks its
own ramp step per scheme is `--color-accent-on-muted`. The token module
`packages/form-ui/src/tokens.stylex.ts` aliases every custom property, 42 in
all.

The advisory tone has no role. Eleven style blocks read `colors.accent400`
directly, which is `#ff9783` in both schemes.

| File | Block | Property | Mark |
|---|---|---|---|
| `panels/FormsTab.tsx` | `cardEmpty` | `borderColor` | the empty card's 2px border |
| `panels/shared/ConditionBuilder.tsx` | `conditionRowIncomplete` | `borderColor` | an incomplete condition's dashed box |
| `panels/shared/RuleBuilder.tsx` | `conditionRowIncomplete` | `borderColor` | an incomplete rule row's dashed box |
| `panels/MigrationSpecEditor.tsx` | `studioMapUnresolved` | `borderColor` | an unresolved mapping's dashed box |
| `panels/DataSourcesPanel.tsx` | `studioWarning` | `borderLeftColor` | a warning callout's 3px rule |
| `panels/FieldCatalogPanel.tsx` | `studioWarning` | `borderLeftColor` | a warning callout's 3px rule |
| `panels/ProcessHeaderBar.tsx` | `warning` | `borderLeftColor` | a warning callout's 3px rule |
| `panels/shared/InstanceQueryForm.tsx` | `studioWarning` | `borderLeftColor` | a warning callout's 3px rule |
| `screens/FormEditorScreen.tsx` | `studioWarning` | `borderLeftColor` | a warning callout's 3px rule |
| `screens/MigrationPlanScreen.tsx` | `studioWarning` | `borderLeftColor` | a warning callout's 3px rule |
| `screens/ProcessesScreen.tsx` | `warning` | `borderLeftColor` | a warning callout's 3px rule |

The checks rail's dot has no code site. The archived change
`2026-09-08-checks-status-consolidation` deleted it. Today the Checks tab's
own count takes a color for a blocker alone. The type `ChecksDotState` kept
the old name. The comment above `cardEmpty` still cites the dot. So does the
`studio-forms-overview` requirement "A card names its step and counts the
fields it draws".

Three style blocks draw the authoring command: `openControl` in
`panels/FormsTab.tsx`, `control` in `panels/FormTabStrip.tsx` and `command`
in `panels/ChangeList.tsx`. Each sets the mono face at 11px in
`colors.textMuted`. Each sets a transparent ground, a `colors.surfaceMuted`
hover wash and a press wash of `colors.text` at 14%. Each composes over the
literal `btn btn-ghost` classes. The strip's two move controls take
`disabled` at either end of the tab list.

Other `surfaceMuted` hovers in the studio belong to rows, tabs and menu
items. The steps rail's `move` block inherits its font and sets no press
wash. None of them draws the authoring command.

The change `forms-card-legend` lands first. It adds `minHeight: 24` to
`openControl` and a dashed `miniatureConditional` block reading
`accentOnMuted`. It also rewrites the Form Card, Shapes and Accent on Muted
entries of `DESIGN.md`. Every task below names a block or a section, so each
holds on top of that change.

### The owner's picks

The owner chose on a mockup built from IT Offboarding's real rows. The block
below copies the picks verbatim from the program record,
`.superpowers/sdd/forms-program.md`.

Mockup: <https://claude.ai/code/artifact/33271039-eff3-4eaf-8a1e-69cdfbf966d2>

```text
- C1: authoring command hover keeps the surfaceMuted wash and turns the text to ink (13.7:1); press keeps the ink-14% wash and turns the text to ink (11.2:1 light, 9.8:1 dark). Applies to FormsTab.tsx openControl and FormTabStrip.tsx control; DESIGN.md authoring command line.
- D2: new role `advisory`; light value #e25a40 (3.26:1 on paper), dark stays #ff9783 (7.91:1). The empty card border, the checks rail's advisory dot and the warning callout's rule read the role.
```

## Goals / Non-Goals

**Goals:**

- The authoring command's text clears 4.5:1 on hover and on press, in both
  schemes, on all three blocks.
- No component reads an accent ramp step for the advisory tone.
- The advisory mark clears 3:1 against paper and ledger in both schemes.
- Both token files, `DESIGN.md` and `.claude/rules/design-language.md` state
  one role and one command recipe.

**Non-Goals:**

- The refusal-tone callouts. The blocks `checksGroupHeldBack` in
  `panels/ChecksRail.tsx`, `refusal` in `panels/TimersPanel.tsx` and
  `warning` in `panels/StepPage.tsx` read `colors.refusal`. They stay as
  they are. A new TONE-1 bullet, in a section of its own, records them in
  `docs/decisions.md`.
- The other dashed marks in `DESIGN.md`. They mark a field kind the catalog
  lacks, the drop target at a form's tail, and a suggested role. None reads
  the ramp's light step.
- The miniature's dashed conditional mark. Pick B1 gave it `accentOnMuted`.
- A sixth stamp tone. The role draws rules and borders alone.
- The hover wash's own contrast against the plate, 1.08:1 light and 1.18:1
  dark. Pick C1 keeps that wash, and the ink text carries the hover signal.
- A shared export of the command recipe. The comment above `openControl`
  records its copy of the strip's block as a deliberate duplicate.
- `tmp/Detent Design Language.dc.html`. Git tracks no file under `tmp/`, and
  this worktree has no `tmp/` directory. The main checkout holds the file
  untracked. The change leaves it.
- The sidecar `.impeccable/design.json`. Git tracks it, and it still names
  `#ff9783` as Advisory in both schemes. It refreshes in a bulk pass over the
  design files, as it did at `2cc9e24f`. The commit `b5303fd3` added the
  dormant role without it.

## Decisions

### Shape brief

The brief below comes from `/impeccable shape`, run with C1 and D2 as the
fixed direction.

- **Job and audience.** An author opens a form, adds or moves a tab, or
  expands a change row. An author also reads
  what still needs work, from a warning callout or an empty card. The mode
  is Operate.
- **Direction.** The incumbent world from `DESIGN.md` stays. The command
  stays quiet slate at rest. It answers the pointer in ink, never in the
  accent. The accent keeps the open tab and the one primary action.
- **States and ranges.** At rest a command sets slate text on a transparent
  ground. Hover sets ink text on the ledger wash. Press sets ink text on the
  ink wash at 14%. Focus keeps the 2px accent ring. A disabled command stays
  slate at 45% opacity and takes no hover or press look.
- **Layout and interaction.** No size, spacing or order changes. The 24px
  minimum from `forms-card-legend` stays on `openControl`.
- **Accessibility.** Command text reads 13.70:1 on hover and 11.26:1 on press
  in light. It reads 12.60:1 and 9.87:1 in dark. The advisory mark reads
  3.26:1 on light paper and 7.91:1 on dark paper. On ledger it reads 3.00:1
  and 6.71:1. Each advisory mark stands beside words stating the same fact.
- **Constraints.** Components read roles from `tokens.stylex.ts`. The
  detector hook may be inactive in the worktree, so `impeccable detect` runs
  by hand after the build.

### The command's text turns to ink on hover and on press

Each of the three blocks gains one conditional `color`. Its default reads
`colors.textMuted`, and both `":hover"` and `":active"` read `colors.text`.
The `backgroundColor` object stays as it stands. StyleX orders `:active`
(170) after `:hover` (130), so a pressed control takes its press values.

### All three blocks follow the pick

The pick names two components, since the audit walked two screens. The
comment above `command` in `panels/ChangeList.tsx` names that block the
authoring command. The file `DESIGN.md` defines the command once, for every
row of secondary studio commands. A change list left at slate would give one recipe
two looks. The alternative, an exception for the change list in `DESIGN.md`,
buys nothing.

The requirement joins `web-styling`, beside "A destructive control renders
outlined in the accent". One recipe spans `studio-forms-overview`,
`studio-form-editor` and `studio-app`, so no single area capability owns it.

### A disabled command takes no hover or press look

The strip's move controls take `disabled`. Under C1 alone, a disabled
control would turn its text to ink under the pointer. The shared priorities
in `@stylexjs/shared` 0.19.0 put `:disabled` at 92, under `:hover` at 130. A
`":disabled"` key inside `control` therefore loses under the pointer.

The strip's module gains a `controlDisabled` block. Its `color` reads
`colors.textMuted` for the default, `":hover"` and `":active"`. Its
`backgroundColor` reads `"transparent"` for all three. The strip stacks it
after `control` wherever it sets `disabled`, from the same boolean. The
local `ghost` helper takes its styles as separate arguments, as the change
list's helper does. The test preload's `props` mock joins string arguments
and drops `false`, and it flattens no array.

The wash under a disabled control predates this change. Holding the text
alone at slate would leave that wash under the pointer. A compound key such
as `":enabled:hover"` has no earlier use in this build. The first-use rule in
`web-styling` would demand a build check for it, and the stacked block needs
none. A comment above `controlDisabled` records the priority order, so the
stack survives.

### The advisory role rides its own primitive

The `:root` block of `tokens.css` gains the primitive `--advisory-500:
#e25a40`. The dark block overrides it with `#ff9783`. The semantic aliases
gain `--color-advisory: var(--advisory-500)`. The token module gains
`advisory500` among the primitives and `advisory` among the semantic aliases.
Its header count moves from 42 to 44. A comment above the primitive states its
two light ratios, and that it is no ramp step.

The value `#e25a40` is no ramp step. Its OKLCH lightness reads 0.640. The
accent steps read 0.780 at 400, 0.581 at 600 and 0.481 at 700. A 500 step
on the shared scale sits at 0.680, where `--color-neutral-500` and the dark
stamp `#ff563c` sit. An `--color-accent-500` at `#e25a40` would break the
ramp comment's claim of one shared lightness scale.

The dormant and refusal roles both ride a primitive with a dark override.
The advisory role follows them. The dark block's comment keeps its claim
that `--color-accent-on-muted` is the one alias picking a ramp step per
scheme. A role holding a literal hex in both blocks would break the rule
that roles alias primitives. The front matter of `DESIGN.md` lists every
primitive, so it gains `advisory-500: "#e25a40"`.

### Every advisory reader moves to the role

All eleven blocks in the context table read `colors.advisory`. Afterwards no
component names `colors.accent400`. The token module keeps the `accent400`
alias, since it mirrors every custom property `tokens.css` declares.

The two builder blocks sit on the ledger ground, through their
`conditionRow` blocks. There the light role reads 3.0035:1, a margin of
0.0035. The migration picker sets a paper ground. A callout clears 3:1 on
either ground, so its container's fill decides nothing.

The requirement defines a warning callout as refusal text beside a 3px rule.
It exempts three blocks that keep a refusal rule. The step page's `warning`
block draws a 2px rule. The checks rail's `checksGroupHeldBack` and the
timers panel's `refusal` mix refusal at 55% for a 3px rule. The
missing-translation message then takes two looks on one process surface.
TONE-1, in a section of its own, records the three blocks and the message's
two looks.

### The non-text basis

WCAG 1.4.11 holds a graphical object's needed parts at 3:1 against adjacent
colors. It holds a component state's visual indicator to the same ratio. A
2px border, a 3px rule and a dashed box are graphics. The 4.5:1 of WCAG 1.4.3
binds text alone. The role clears 3:1 on paper and on ledger in both schemes.

The Five Tones Rule covers the stamp. No stamp lookup reads the advisory
role, so the stamp paragraph of `design-language.md` stays.

### Contrast figures

Every figure below uses the WCAG 2 relative luminance. Each sRGB channel `c`
divides by 255. A channel at or under 0.04045 divides by 12.92. A larger one
becomes `((c + 0.055) / 1.055)` raised to 2.4. Luminance `L` sums `0.2126 R`,
`0.7152 G` and `0.0722 B`. The ratio divides `L1 + 0.05` by `L2 + 0.05`, with
the lighter color as `L1`.

The press wash is `color-mix(in srgb, ink 14%, transparent)`. That yields ink
at alpha 0.14, composited over paper as `0.14 ink + 0.86 paper` per channel.
It reads `rgb(213.5, 212.3, 212.2)` in light and `rgb(61.5, 59.7, 58.8)` in
dark.

Token values come from `tokens.css`. Light paper is `#f3f2f2`, ledger
`#eae9e9`, ink `#201e1d` and slate `#605d5d`. Dark paper is `#201e1d`, ledger
`#2d2b2b`, ink `#f3f2f2` and slate `#9b9797`.

| Pair | Light | Dark |
|---|---|---|
| Hover wash (ledger) against paper | 1.08 | 1.18 |
| Slate on the hover wash, today | 5.38 | 4.87 |
| Slate on the press wash, today | 4.42 | 3.82 |
| Ink on the hover wash, C1 | 13.70 | 12.60 |
| Ink on the press wash, C1 | 11.26 | 9.87 |
| `#ff9783` on paper, today | 1.88 | 7.91 |
| `#ff9783` on ledger, today | 1.73 | 6.71 |
| Advisory role on paper, D2 | 3.26 | 7.91 |
| Advisory role on ledger, D2 | 3.00 | 6.71 |

The pick's 13.7, 11.2 and 9.8 truncate the computed 13.70, 11.26 and 9.87.
The light advisory role on ledger reads 3.0035 before rounding. In D2 the
dark role takes the same `#ff9783` it has today.

### Tests

Two new `describe` blocks join `packages/web/test/studio-guidedSurfaceStyle.test.ts`.
They read source the way that file's checks already do, through
`stripComments` and `styleBlock`.

The advisory role's checks read four things. The `:root` block of
`tokens.css` declares the primitive and the alias. The dark block declares
the override and no alias. The token module aliases both. Each of the eleven
blocks reads `colors.advisory` for its border color. A walk over
`packages/web/src` and `packages/form-ui/src` finds no `colors.accent400`
once comments strip.

A contrast check parses the hex values from both blocks of `tokens.css`. It
reads them as `token()` in `studio-fieldMatrixBadge.test.ts` does, taking the
first declaration as light and the last as dark. It applies the formula above. The role measures at least 3:1 against paper and
against ledger in each scheme.

The authoring command's checks read each of the three blocks. Each declares
the conditional `color` above and keeps its two washes. The
`controlDisabled` block declares slate and a transparent ground for the
default, the hover and the press. A contrast check holds ink at 4.5:1 or
more against the hover wash and the press wash in each scheme. It passes
today and guards a later token change.

The strip's own test, `packages/web/test/studio-formTabStrip.test.tsx`, gains
a markup check. With
the first tab open, the move-left control's class carries `controlDisabled`,
and the move-right control's class does not. With the last tab open, the
reverse holds.

The comment above the `miniatureRequired` assertion names `cardEmpty`'s read
of `accent400`. That comment changes, since the read leaves. No DOM test
library exists here, so each computed color goes to a browser check.

### Documentation

- **`DESIGN.md`.** The front matter's `colors` gains `advisory-500`. Its
  `components` gains `button-authoring-hover`, setting the ledger ground and
  ink text. It also gains `button-authoring-active`, setting ink text. The
  Advisory entry under Secondary states both values and all four marks, and
  drops its check result. The
  Role Rule names `colors.advisory`. The Buttons list's authoring command
  line states the ink text and the disabled look. The Form Card and Warning
  Callout sections name the Advisory role.
- **`.claude/rules/design-language.md`.** The Color section names
  `--color-advisory` beside the dormant role. The authoring command
  paragraph states the ink text and the disabled look. The warning callout
  paragraph drops its sentence saying the tone has no role.
- **`docs/current-state.md`.** The Forms tab paragraph names `colors.advisory`
  where it describes the empty form's box. No passage there names a single
  color token.
- **`docs/browser-checks.md`.** The Forms tab entry gains a step reading the
  open control's hover and press, and the empty card's border. The tabbed
  step form entry gains a paragraph on the strip's controls. A new entry reads
  a warning callout, an incomplete condition and the change list's command.
  The tester releases each press off its control. The click then targets the
  nearest common ancestor, which has no click handler, so the control never
  activates. A pass line confirms the screen stayed put.
- **`docs/decisions.md`.** FORMS-7 and FORMS-14 leave. A new section holds a
  TONE-1 bullet, recording the three blocks that keep a refusal rule. The
  sweep re-reads every citation in the Forms tab section. It also re-reads
  each `DESIGN.md:` and `tokens.css:` citation elsewhere in the file. This
  change shifts lines in both files.

## Risks / Trade-offs

- [The light role clears ledger by 0.0035] → The contrast check reads
  `tokens.css`. A token change that drops the ratio fails the suite.
- [Ink text makes a quiet command louder] → The text takes ink and never the
  accent. The critique pass reads the strip.
- [The change `forms-card-legend` moves lines in shared files] → The tasks
  name blocks and sections. The decisions sweep re-reads each citation this
  change can shift.
- [A light advisory rule reads close to the accent's current mark] → The value
  `#e25a40` sits OKLab ΔE 0.082 from the light accent, where `#ff9783` sat at
  0.23. The critique pass reads the Fields tab, where a field's warning
  callout meets the current mark.
- [The owner's mockup omits the change list's command and the step page's
  condition rows] → Critique and audit read both screens. The PR
  description names both extensions for the owner.
- [The web package reads a copy of `form-ui` under `node_modules/.bun`] → A
  task runs `bun install` in the devcontainer after the token change.
- [The `impeccable` hook stays silent in a worktree] → A verification task
  runs `impeccable detect` by hand on each touched component.
- [The untracked `tmp/Detent Design Language.dc.html` drifts from `DESIGN.md`]
  → Git has no copy, so the report names the drift for the owner.

## Migration Plan

The change touches styles, tokens and prose. No stored data or definition reads
a token. The branch comes from `main` after `forms-card-legend` merges. A
revert of the change's commits rolls it back whole.

## Open Questions

- Should the owner's untracked `tmp/Detent Design Language.dc.html` gain the
  swatch and the command states? It sits outside git, so the answer changes
  no spec, task or approach.
