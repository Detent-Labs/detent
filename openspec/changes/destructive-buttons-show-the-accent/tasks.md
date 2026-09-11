## 1. Stylesheet

- [x] 1.1 Move the `.btn-destructive` block in `tokens.css` below `.btn-secondary:active`
- [x] 1.2 Extend that block's comment with the order it needs and the test pinning it

## 2. Call sites

- [x] 2.1 Add `btn-secondary` to the confirming control in `ProcessHeaderBar.tsx:571`
- [x] 2.2 Add `btn-secondary` to the selection control in `CanvasBar.tsx:394`

## 3. Test

- [x] 3.1 Add a `packages/web/test/` file asserting the destructive rule follows every secondary rule
- [x] 3.2 In that file, assert each `className` naming `btn-destructive` also names `btn-secondary`
- [x] 3.3 Cite this change's proposal in the file's header comment as the defect it guards

## 4. Browser check

- [x] 4.1 Add a `docs/browser-checks.md` section named for this change, walking the ten controls
- [x] 4.2 Give each control in the walk its screen and the state that shows it
- [x] 4.3 Reach the outbox row's control through a draft `http.request` action to a refused host
- [x] 4.4 Run the walk on the production build in both schemes, reading computed color and border
- [ ] 4.5 Copy `.claude/skills/impeccable/` from the main checkout, then run critique and audit fresh

## 5. Verification

- [ ] 5.1 Run `bun run typecheck` and `bun run build` in the devcontainer
- [ ] 5.2 Run the FULL `bun test` with `DATABASE_URL` set, through `silent-green.sh`
- [ ] 5.3 Run the prose and whitespace push gates over the branch range
- [ ] 5.4 Run `openspec validate destructive-buttons-show-the-accent --strict`
