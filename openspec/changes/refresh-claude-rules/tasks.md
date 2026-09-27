# Tasks

## 1. process-contract.md

- [x] 1.1 Fix PC items 1-11 per design.md; grep finds no "Twelve kinds" or "Default binding"
- [x] 1.2 Add PC gaps 1-8 per design.md; grep finds `cancellable`, `collaboration`, `MAX_SUBPROCESS_DEPTH`
- [x] 1.3 Apply PC trims 1-6; each trimmed fact still appears in its target file
- [x] 1.4 Add `src/validate.ts` and `packages/form-ui/**` to the `paths:` list
- [x] 1.5 Drop the `allow-file` directive per D6; antislop check on the file exits 0
- [x] 1.6 Drop the "two pickers" clause in `src/schema/definition.ts`; grep confirms it is gone

## 2. authoring-invariants.md

- [x] 2.1 Fix AI items 1-9 per design.md; grep finds no "CEL step below"
- [x] 2.2 Add AI gaps 1-9 per design.md; grep finds "time function not allowed"
- [x] 2.3 Apply AI trims 1-6; each fact trim 5 removes still appears in PC
- [x] 2.4 Add `src/validate.ts` to the `paths:` list
- [x] 2.5 Drop the `allow-file` directive per D6; antislop check on the file exits 0

## 3. design-language.md

- [x] 3.1 Fix DL items 1-10 per design.md; grep finds no "Booked" or "3d 04h"
- [x] 3.2 Scope `DESIGN.md:590-592` and `:794` per DL items 6 and 11
- [x] 3.3 Add DL gaps 1-8; grep finds `accent-on-muted`, `layout-cap-narrow` and "flagged-cell ring"
- [x] 3.4 Apply DL trims 1-8; each trimmed fact still appears in `DESIGN.md`
- [x] 3.5 Drop "chevrons' old position" in `StepsRail.tsx:113`; grep confirms it is gone
- [x] 3.6 Add `DESIGN.md` to the `paths:` list
- [x] 3.7 Run antislop check on the rule file and on `DESIGN.md`; no new finding

## 4. ui-glossary.md

- [x] 4.1 Fix UG items 1-8 per design.md; grep finds no "field tabs"
- [x] 4.2 Add UG gaps 1-10, the Access tab row included; grep finds "Access tab"
- [x] 4.3 Apply UG trims 1-6; each trimmed fact still appears in its target file
- [x] 4.4 Add `openspec/**`, `docs/browser-checks.md` and `DESIGN.md` to `paths:`
- [x] 4.5 Run antislop check on the file; it exits 0

## 5. Repeated claims elsewhere

- [ ] 5.1 Apply the `CLAUDE.md` rows of design.md's table; grep finds no "inspector"
- [ ] 5.2 Apply the `PRODUCT.md` and `README.md` rows; grep finds no "JSON view" there
- [ ] 5.3 Apply the `openspec/config.yaml` rows; grep finds no "ten tabs" and no "JSON view"
- [ ] 5.4 Apply the three `docs/authoring-guide.md` rows; grep finds no "unreachable outcome"
- [ ] 5.5 Apply the `docs/current-state.md:252` row; grep finds no "inspector" there
- [ ] 5.6 Fix the structural-check count in `src/validate.ts`, `definitions.ts`, `compile.ts` and `validation.ts`
- [ ] 5.7 Run design.md's count grep; it finds nothing
- [ ] 5.8 Fix the three `checksRail.ts` comments; grep finds no "six structural" and no "same order" there
- [ ] 5.9 Run the design.md "Inbound citations" sweep; re-point `FormEditorScreen.tsx:476` at `DESIGN.md`
- [ ] 5.10 Run antislop check on each touched Markdown file; no new finding

## 6. docs/decisions.md

- [ ] 6.1 Add the Open-questions entry for the subprocess-child rule (D1)
- [ ] 6.2 Add the off-spec weight entry (3 at 500, 7 at 600) beside `#726e6e` (D2)
- [ ] 6.3 Add the "Access surface" wording entry (D3)
- [ ] 6.4 Add the retired-words entry for specs and catalog keys, `studio-canvas` edit rail included (D4)
- [ ] 6.5 Narrow FIELDS-13 to the `docs/browser-checks.md` lines (D7)
- [ ] 6.6 In the Archivo entry, name the ten sites and drop the `app.css` sentence
- [ ] 6.7 Run antislop check on `docs/decisions.md`; no new finding

## 7. Verification

- [ ] 7.1 Run `bun run typecheck` in the devcontainer; it exits 0
- [ ] 7.2 Run `bun run build` in the devcontainer; it exits 0
- [ ] 7.3 Run the full `bun test` with `DATABASE_URL` set inside the devcontainer; pipe it through `scripts/gates/silent-green.sh`
- [ ] 7.4 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/prose.sh` on the host; it exits 0
- [ ] 7.5 Run `sh scripts/gates/range.sh < /dev/null | sh scripts/gates/whitespace.sh` on the host; it exits 0
- [ ] 7.6 Run `OPENSPEC_TELEMETRY=0 openspec validate refresh-claude-rules --strict`; it reports valid
- [ ] 7.7 The `studio-checks-rail` delta does not need code; it lands at sync or archive
