## 1. Stylesheet

- [ ] 1.1 Move the `.btn-destructive` block in `tokens.css` below `.btn-secondary:active`
- [ ] 1.2 Extend that block's comment with the order it needs and the test pinning it

## 2. Call sites

- [ ] 2.1 Add `btn-secondary` to the confirming control in `ProcessHeaderBar.tsx:571`
- [ ] 2.2 Add `btn-secondary` to the selection control in `CanvasBar.tsx:394`

## 3. Test

- [ ] 3.1 Add a `packages/web/test/` file asserting the destructive rule follows every secondary rule
- [ ] 3.2 In that file, assert each `className` naming `btn-destructive` also names `btn-secondary`
- [ ] 3.3 Cite this change's proposal in the file's header comment as the defect it guards

## 4. Browser check

- [ ] 4.1 Add a `docs/browser-checks.md` walk over the ten destructive controls, in both schemes
- [ ] 4.2 Run the walk on the production build, reading each control's computed color and border
- [ ] 4.3 Run `/impeccable critique` and `/impeccable audit` on one changed route, or record why not

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` and `bun run build` in the devcontainer
- [ ] 5.2 Run the FULL `bun test` with `DATABASE_URL` set, through `silent-green.sh`
- [ ] 5.3 Run the prose and whitespace push gates over the branch range
- [ ] 5.4 Run `openspec validate destructive-buttons-show-the-accent --strict`
