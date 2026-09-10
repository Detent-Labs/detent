# Code review record, 2026-07-29 to 2026-08-18

This entry holds four dated code reviews and no change of its own. It is a
record, and the directory name takes the date of the newest review in it.

## The chain

The four files form one chain, each header linking the review before it with
`**Supersedes:**`:

1. `CODE_REVIEW-2026-07-29.md`, the first audit. All 27 findings closed under
   the nine archived changes named `2026-07-29-*`.
2. `CODE_REVIEW-2026-08-01.md`, the second pass. Six changes archived under
   `2026-08-06-*` closed its findings, except its ARCH-1.
3. `CODE_REVIEW-2026-08-09.md`, the third pass. Its seven findings reappear in
   the fourth review's disposition table.
4. `CODE_REVIEW.md`, the 2026-08-18 review, the newest and the last one to
   live under `docs/`.

Commit `9fe8fb38` set the rename convention. The live review sat at the
unnumbered path. A new pass renamed the outgoing one to its own date, so its
record and disposition table survived. Commit `0b520cc8` drew the tracked
line. The ponytail reports stay untracked, because their tools regenerate
them on demand. A dated audit records a closed pass, so it stays tracked.

## Where the live findings are

Every open finding from these four reviews sits in `docs/decisions.md`. The
ten items of the 2026-08-18 action list, and the nine findings that never
reached that list, are under `## Open from the 2026-08-18 code review`. The
`NotFoundError` question from the 2026-08-01 review is under `## Open
questions`.

The four files keep their dates, the commits they read, the methods they
used and the limits of those methods. Their text stays as it was. The
`development-toolchain` capability states the rule that put them here.
