## Context

The codebase already converts borders by hand in places. `ProcessTabRow`'s
`menu` style declares `borderWidth`, `borderStyle` and `borderColor` on one
line each, then declares `background: colors.surface` on the next. The first
three paint. The fourth does not. Nobody wrote that split on purpose. It is
what a file looks like after somebody fixed one border and left the rest.

The compiler gives no signal. A dropped declaration produces no warning, no
build error and no type error. The command `bun run build` stayed green
through all 113 sites.

Two conditional shapes appear in the tree. A plain value, `background:
colors.surface`. A pseudo-class map, `background: { default: "none", ":hover":
colors.surfaceMuted }`. The second is the register-row hover, and it repeats
across twelve list screens in three areas.

`packages/web` carries no ESLint. It has no lint config of any kind. It does
carry source-pattern tests that read a module and match against its text. Two
of them are `boundaries.test.ts` and `studio-guidedSurfaceStyle.test.ts`.

## Goals / Non-Goals

**Goals:**

- Every border and fill a style object declares paints in the browser.
- The two dropped keys cannot return without failing the suite.
- The conversion changes what paints, and nothing else.

**Non-Goals:**

- No new color, weight, spacing or radius. A converted declaration asks for
  what its shorthand asked for.
- No sweep of unrelated shorthands. `padding` and `font` compile to atoms,
  measured against the same bundle, and stay as they are.
- The border sides are not unrelated. `borderTop`, `borderBottom`,
  `borderLeft`, `borderRight` and the two logical axes drop exactly as
  `border` does, so they convert here too.
- No ESLint. One rule does not pay for a lint toolchain this repo has lived
  without.
- No change to the design language. `design-language.md` and `DESIGN.md` stay
  as they are.

## Decisions

### 1. Plain longhand keys, and no helper

Each site takes the plain longhand keys. A `border` becomes `borderWidth`,
`borderStyle` and `borderColor`. A `background` becomes `backgroundColor`.

This design rejects a `border()` helper returning the three keys. A helper
hides which of the three a sibling style overrides, and StyleX resolves an
override per property. The three keys read the way the
compiled output reads.

### 2. `"none"` becomes `transparent`, never `none`

`background: "none"` is valid. `background-color: none` is not, and a browser
drops it. Every conditional site therefore reads `backgroundColor: { default:
"transparent", ":hover": colors.surfaceMuted }`.

This is the one place the conversion is not literal. A reviewer should check
each of the twelve row-hover sites for it.

### 3. The guard is a source-pattern test

One test file reads every `.ts` and `.tsx` module under `packages/web/src`
and `packages/form-ui/src`. It fails on a line whose first token is `border:`
or `background:`. It reports the file and the line number for each hit.

`tokens.stylex.ts` is the one exemption. It declares a design token named
`border` through `defineVars`, which is a variable name, not a CSS property.

The alternative was a check inside the vite plugin beside
`assert-compiled-styles-linked`. It was rejected. That plugin runs at build
time and sees compiled output, so it can say a rule is missing but not which
line asked for it. A contributor needs the line.

### 4. The suite gains the check, the browser keeps the proof

The test proves no module declares the key. It cannot prove a border paints:
the harness lays out nothing and resolves no custom property. That half stays
a browser check, per `development-toolchain`'s split rule.
`docs/browser-checks.md` gains one entry naming the four surfaces where the
loss is largest.

### 5. `global.css` keeps every element reset

The `fieldset` reset stays. Two components mount a `<fieldset>` that takes no
compiled style. No conversion reaches either element. The component
`ActionListEditor` declares no style object at all. The component
`PluginEnvelopeEditor` declares one. Its fieldset element takes none of it. The `button`, `input`, `select` and
`textarea` resets stay for the same reason.

The sheet stands at 133 lines against a stated bound of about 120. The bound
moves to about 150 rather than the comment shrinking. That comment records the
measurement that found the bevel, and it is the only record of it.

### 6. One revealed declaration earns a correction

The conversion is faithful everywhere. In one place the declaration it
revealed is wrong, and this change fixes that place rather than leaving it.

`matrixFlagBadgePressed` asked for an accent fill. It painted none for as
long as it existed. Converting it put six accent fills on the field matrix at
once. Three things say the accent is wrong there. The legend twelve pixels
away names one color per flag. The language gives the accent to state and to
the one primary action per screen, and Publish holds it. The accent measures
4.525:1 under the badge's 11px label, clearing AA by 0.025, where each flag
color measures 6.4:1 or better.

The badge now takes its own flag's color. The three flag tokens are the
scoped exception `design-language.md` already names, and the legend on the
same screen already draws them.

Every other revealed declaration ships as authored. This one earned an
exception because it broke a rule the same screen states in words.

## Risks / Trade-offs

**A border that paints changes a box's size.** The global reset sets
`box-sizing: border-box`, so a fixed-size element absorbs the border inside
its own box. An auto-sized element grows by the border's width. The risk is
real on the field matrix, where a 10px legend swatch gains a 1px frame on each
edge. The browser check covers it.

**80 sites change what a screen looks like.** That is the change's purpose.
It is still a visual diff nobody reviewed as a design. Each site asks for what
its own style already declared. The review question is whether the original
declaration was right. Nobody needs to re-examine the conversion.

**The ban outlives its cause if StyleX changes.** A later version may emit
both shorthands. The guard would then forbid something that works. Deleting
the one test is the whole undo, and the longhands stay correct either way.

**The border sides cost a second pass.** The first pass banned `border` and
`background` alone, on a reading of the compiled bundle that mistook
longhand atoms for shorthand output. An audit measured the field matrix
computing `0px/none` on every rule it draws and found the hole. This
change carries the correction: 33 declarations across 12 files, and the guard
widened to the six side keys.

**The guard's pattern is textual.** A `border:` key inside a non-style object
would fail the suite for no reason. No such key exists in either tree today.
The test names the file and the line, so a false positive costs one exemption
and a comment saying why.

## Migration Plan

Four phases. Each leaves the tree green and each is its own commit.

1. **The shell and form-ui.** 3 sites in `Chrome.tsx`, `navStyles.ts` and
   `FieldForm.tsx`, plus their inert siblings. Smallest surface, and the shell
   frames every area, so a mistake here shows immediately.
2. **The app, admin and reporting areas.** 12 sites, all of them the
   register-row hover. One shape repeated twelve times, so it converts as one
   pattern.
3. **The studio area.** This phase covers 60 sites across 20 files. The
   browser check exercises it hardest.
4. **The guard and the browser check.** The test lands last, so it lands
   green. The file `docs/browser-checks.md` gains its entry in that commit.

Rollback is per phase. No phase leaves a screen unusable. The worst case
restores today's state, where the declaration compiles away.

## Open Questions

- The `fieldset` reset clears a UA border for two components that have no
  style object. Should those two components gain style objects instead? That
  would let the reset go. It is a larger change and it belongs to whoever owns
  `.action-list` and `.plugin-envelope`.
- `FieldMatrixPanel`'s three legend swatches read `colors.flagVisible`,
  `colors.flagRequired` and `colors.flagReadonly` directly. Those are the
  scoped exception `design-language.md` already names. The conversion keeps
  them as they are. Whether that exception should end is a separate question.
