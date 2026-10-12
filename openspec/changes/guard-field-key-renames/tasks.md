# Tasks

## 1. The reader count

- [x] 1.1 Move `keyReader` into `draft/key-readers.ts` and add `countKeyReaders`. Check: `studio-fieldRemoval.test.ts` stays green.
- [x] 1.2 Add `studio-keyReaders.test.ts`. Cover a guard, a `visible` flag, the field's own rule, a `process.start` mapping and a string literal. Cover bad source and the empty key. Check: each case counts as the spec says.

## 2. The lock

- [x] 2.1 Give `nextFieldKey` a `locked` input. Check: a case with a locked key equal to its prior derivation returns `undefined`.
- [x] 2.2 Add `draft/publishedFields.tsx`. It fetches the base body once per `baseVersion` and exposes the field ids. Check: a test over a stubbed fetch covers loading, error and success.
- [x] 2.3 Mount the provider in `screens/EditScreen.tsx` with `changesBaseVersion`. Check: the test from 2.2 shows a new base version fetches again.
- [x] 2.4 Pass `locked` from `FieldEditor::updateLabel`. Check: panel tests cover a read key, a published key and a loading base version. They cover a group field and an unread new field too.

## 3. The key input

- [x] 3.1 Give the non-group `FieldKeyInput` the typed state and the commit on blur and Enter. Check: a test types each character, sees no write, then blurs and sees one write. The browser check (5.4) covers the blur and Enter wiring itself.
- [x] 3.2 Add the notice below the key input with `aria-describedby` and three catalog keys. Check: panel tests cover the count, the singular, the published-only case and no notice.
- [x] 3.3 Mark `countKeyReaders` with a `ponytail:` comment. Check: `git grep -n 'ponytail:' -- packages/web/src/areas/studio/draft/key-readers.ts` finds it.

## 4. Documents

- [x] 4.1 Fix the `docs/browser-checks.md` entry that renames `quantity`'s label. It expects the key to stay and the notice to show. Check: the text names the notice.
- [x] 4.2 Add a `docs/browser-checks.md` entry for the key input. Check: it holds a pass line for a read key, a published key and the blur commit.
- [x] 4.3 Delete the `guard-field-key-renames` entry from the audit index of `docs/decisions.md`. Check: `git grep -n 'guard-field-key-renames' -- docs/decisions.md` finds nothing.
- [x] 4.4 Add FIELDS-26 to `docs/decisions.md`. It names the option value that a CEL comparison keeps after a change. Check: the entry sits beside FIELDS-25.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and `bun run build` in the devcontainer. Check: both exit 0.
- [x] 5.2 Run `OPENSPEC_TELEMETRY=0 sh scripts/test-gated.sh bun test` with `DATABASE_URL` set. Check: the gate accepts the run.
- [ ] 5.3 Run the prose and whitespace gates over the pushed range on the host. Check: both exit 0.
- [x] 5.4 Check the Fields tab on the production build in a real browser. Run `/impeccable critique` and `/impeccable audit`. Check: each finding has a fix or a record.
