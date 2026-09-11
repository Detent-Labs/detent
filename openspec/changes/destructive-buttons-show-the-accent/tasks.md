## 1. Stylesheet

- [x] 1.1 Move the `.btn-destructive` block in `tokens.css` below `.btn-secondary:active`
- [x] 1.2 Extend that block's comment with the order it needs and the test pinning it
- [x] 1.3 Add a `.btn-destructive:hover` and `:active` rule reading `--color-accent-on-muted`, after the block

## 2. Call sites

- [x] 2.1 Add `btn-secondary` to the confirming control in `ProcessHeaderBar.tsx:571`
- [x] 2.2 Add `btn-secondary` to the selection control in `CanvasBar.tsx:394`

## 3. Test

- [x] 3.1 Add a `packages/web/test/` file asserting the destructive rule follows every secondary rule
- [x] 3.2 In that file, assert each `className` naming `btn-destructive` also names `btn-secondary`
- [x] 3.3 Cite this change's proposal in the file's header comment as the defect it guards
- [x] 3.4 Assert that rule follows every secondary rule and reads `--color-accent-on-muted` for text and border

## 4. Browser check

- [x] 4.1 Add a `docs/browser-checks.md` section named for this change, walking the ten controls
- [x] 4.2 Give each control in the walk its screen and the state that shows it
- [x] 4.3 Reach the outbox row's control through a draft `http.request` action to a refused host
- [x] 4.4 Run the walk on the production build in both schemes, reading computed color and border
- [x] 4.5 Copy `.claude/skills/impeccable/` from the main checkout, then run critique and audit fresh
- [ ] 4.6 Add hover and pressed to the walk, measured on three controls in both schemes

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and `bun run build` in the devcontainer
- [x] 5.2 Run the FULL `bun test` with `DATABASE_URL` set, through `silent-green.sh`
- [x] 5.3 Run the prose and whitespace push gates over the branch range
- [x] 5.4 Run `openspec validate destructive-buttons-show-the-accent --strict`
- [ ] 5.5 Rerun 5.1 to 5.4 after the hover and press rule lands
