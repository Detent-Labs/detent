## Why

The 2026-09-13 audits of the Studio Forms tab left two design findings open in
`docs/decisions.md`. The authoring command's hover wash barely shows. Its
press drops the text under WCAG 1.4.3's 4.5:1 in both schemes (FORMS-7). The
empty form card's border reads a ramp step, and it measures 1.88:1 on the
light paper (FORMS-14). The owner picked a fix for both on a mockup.

## What Changes

- The authoring command keeps both of its washes. Under the pointer and while
  pressed, its text turns to ink. The light scheme then reads 13.70:1 on the
  hover wash and 11.26:1 on the press wash. The dark scheme reads 12.60:1 and
  9.87:1.
- Three components draw the authoring command, and all three follow. They
  are a form card's open control, the form tab strip's controls and the
  change list's commands.
- A disabled authoring command keeps its slate text and a transparent ground
  under the pointer.
- A new semantic role, `advisory`, joins `tokens.css` and the token module. It
  reads `#e25a40` in the light scheme, at 3.26:1 on paper and 3.00:1 on
  ledger. The dark scheme keeps `#ff9783`, at 7.91:1 and 6.71:1.
- Eleven component styles read the role in place of the accent ramp's light
  step. They draw a warning callout's rule and an empty form card's border.
  They also draw the dashed box of an incomplete condition or an unresolved
  migration mapping.
- `DESIGN.md` and `.claude/rules/design-language.md` gain the role and the
  command's states. `docs/current-state.md` and `docs/browser-checks.md`
  follow. `docs/decisions.md` drops FORMS-7 and FORMS-14. A new TONE-1
  bullet, in a section of its own, records three blocks that keep a refusal
  rule.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `web-styling`: two requirements join the spec. One declares the advisory
  role, defines a warning callout and names the role's readers. The other
  states the authoring command's hover, press and disabled looks.
- `studio-forms-overview`: the empty form card's border takes the advisory
  role, and it clears 3:1 against paper in both schemes.

## Impact

- Tokens: `packages/web/src/shell/tokens.css` and
  `packages/form-ui/src/tokens.stylex.ts`.
- Components under `packages/web/src/areas/studio/`: `panels/FormsTab.tsx`,
  `panels/FormTabStrip.tsx`, `panels/ChangeList.tsx`,
  `panels/DataSourcesPanel.tsx`, `panels/FieldCatalogPanel.tsx`,
  `panels/MigrationSpecEditor.tsx` and `panels/ProcessHeaderBar.tsx`.
  Three more sit under `panels/shared/`: `ConditionBuilder.tsx`,
  `RuleBuilder.tsx` and `InstanceQueryForm.tsx`. Three sit under `screens/`:
  `FormEditorScreen.tsx`, `MigrationPlanScreen.tsx` and `ProcessesScreen.tsx`.
- Tests: `studio-guidedSurfaceStyle.test.ts` and
  `studio-formTabStrip.test.tsx`.
- Docs: `DESIGN.md`, `.claude/rules/design-language.md`,
  `docs/current-state.md`, `docs/browser-checks.md` and `docs/decisions.md`.
- No engine, schema, HTTP or definition contract change. No catalog string
  changes.
