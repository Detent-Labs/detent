## 1. Replace the requirement

- [ ] 1.1 In `openspec/specs/development-toolchain/spec.md`, replace the
  requirement at `:136` and its four scenarios with the delta's version.
- [ ] 1.2 Read `.githooks/pre-push` beside the new text, line by line. Every
  SHALL must match something the hook does, and every scenario must be one a
  reader can check there.

## 2. Sync the surrounding prose

- [ ] 2.1 Search `docs/current-state.md`, `CLAUDE.md` and `README.md` for
  claims about GitHub Actions or a pull-request gate. Correct the stale ones.
  Leave whatever already describes the hook.
- [ ] 2.2 Confirm no other spec references the removed workflow. A search for
  `Actions`, `workflow` and `ci.yml` across `openspec/specs/` is enough.

## 3. Verify

- [ ] 3.1 `openspec validate --specs` passes.
- [ ] 3.2 Confirm the stopped-container scenario by hand. With the
  devcontainer down, a push refuses and names the start command.
- [ ] 3.3 Confirm the running-container scenario by hand. With it up, a push
  runs both steps.
- [ ] 3.4 Confirm the run had `DATABASE_URL` set, from the skip count of the
  suite the hook ran. A large skip count means the variable was missing.
