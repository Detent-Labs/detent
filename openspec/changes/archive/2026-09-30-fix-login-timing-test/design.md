# Design

## Context

`verifyLogin` in `src/auth/users.ts` reads the row, then runs one
`Bun.password.verify`. A missing row verifies against `DUMMY_HASH`, which
`Bun.password.hash` made with the same default parameters. Both paths
therefore do the same argon2id work.

The test times one call per path and asserts `unknown > knownWrong / 2`.

A probe on 2026-09-30 timed `Bun.password.verify` in the devcontainer, six
rounds of one known-hash call and one dummy-hash call, three times. Single
calls ranged from 47.7 ms to 90.2 ms. Within one round the two paths differed
by up to 21 ms, in either order. The first round was not slower than the rest,
so a cold start does not explain the failure. The spread does. Under the load
of the full parallel suite, one sample per path can land below the half.

## Goals / Non-Goals

**Goals:**

- The test separates two behaviors on every run. In the first, both paths run
  the same argon2id work. In the second, one path skips `verify` and returns in
  about 1 ms.

**Non-Goals:**

- No change to `verifyLogin` or `DUMMY_HASH`.
- No retry, no wider bound and no skip. `development-toolchain` forbids all
  three for a wandering result.

## Decisions

**Compare the fastest of five samples per path.** Load only adds time to a
call. The fastest sample is the best estimate of a path's own cost. The two
minimums of equal work stay close, while a path that skips `verify` stays
near 1 ms. The probe's fastest calls were 47.7 ms and 47.9 ms.

**Alternate the two paths.** Each round times the known email, then the
unknown one. A burst of load then hits both paths.

**Keep the bound at one half.** The fix changes the measurement. The tolerance
stays. A retry would run the same single-sample comparison again and pass
by chance. This change removes the single sample.

The alternative, a median of five, also resists spikes. It needs a sort and
reacts to a long burst that covers three samples. The minimum needs neither.

## Risks / Trade-offs

- [Risk] The test takes about ten verify calls, around 0.7 s. → The suite runs
  about 77 s. The cost is small.
- [Risk] Load could slow all five samples of one path. → The rounds alternate.
  The load would have to skip every sample of the other path. The regression the
  test guards differs by a factor of about 50, far outside that effect.

## Migration Plan

No migration. To revert, restore the single-sample test.

## Open Questions

None.
