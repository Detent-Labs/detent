---
name: devcontainer-exec
description: Run commands (bun, tsc, tests) inside this project's devcontainer pod through scripts/dev-exec.sh, bring the pod up with scripts/dev-up.sh, and expose a dev server port to the host browser.
---

The devcontainer is one Podman pod per checkout, played from a generated Pod
spec by `podman kube play`. Its containers are `app`, `db` and `mailpit`.
`scripts/worktree-env.sh` derives the pod name (`DEV_POD`) and the host ports
(`PORT_APP`, `PORT_VITE`, `PORT_MAILPIT`) from the worktree's path
(worktree-isolation). A linked worktree then never reaches the main
checkout's containers or database.

Start the pod from the host:
```
bash scripts/dev-up.sh
```
It builds the app image, plays the pod and waits for every container's probe.
It then installs dependencies, seeds the demo data and starts the HTTP
server. It
prints the three ports at the end. Re-running it leaves a pod that already
runs the current spec alone. To manage the pod without the rest:
```
sh scripts/dev-pod.sh up      # build, write container/pod.yaml, play, wait
sh scripts/dev-pod.sh down    # remove the pod; the database volume stays
sh scripts/dev-pod.sh spec    # print the Pod spec; calls no podman
```

Run every command in the `app` container through `scripts/dev-exec.sh`:
```
sh scripts/dev-exec.sh bun run typecheck
sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test
```
The helper sources the derivation, then runs `podman exec -w /workspace
$DEV_POD-app <cmd>`. It takes no flags. A command that needs an environment
variable gets it through `env`:
```
sh scripts/dev-exec.sh env SEED_ALLOW=1 bun run seed
```

The `app` container sets `DATABASE_URL`, which points at
`localhost:5432`. The three containers share one network namespace, so every
address between them is `localhost`. DB-backed tests work without extra setup once
they run through `dev-exec.sh`.

The pod publishes this checkout's derived ports on `127.0.0.1` only. To view
a dev server from the host browser, run it inside the container:
```
sh scripts/dev-exec.sh sh -c 'cd packages/web && bun run dev -- --host 0.0.0.0'
```
In a linked worktree, point it at that checkout's own engine. `PORT_APP`
exists only on the host. Take the number from the bring-up printout and pass
it through `env`:
```
sh scripts/dev-exec.sh env VITE_API_URL=http://127.0.0.1:<PORT_APP> sh -c 'cd packages/web && bun run dev -- --host 0.0.0.0'
```

Nothing publishes an extra port of your own. A port the generated spec does
not cover means a change to `scripts/dev-pod.sh`. Never hand-edit
`container/pod.yaml`: the next `up` overwrites it.

## Running the suite

Run the full suite from the host in one call:
```
rtk test sh scripts/dev-exec.sh sh scripts/test-gated.sh bun test
```
Inside the container, run `sh scripts/test-gated.sh bun test`. Run the full
suite either way, since a subset run fails the pass floor.
The script `scripts/test-gated.sh` runs the command, prints its full output, then runs
`scripts/gates/silent-green.sh` over that output. The exit code is the suite's
own, or 1 when the suite exits 0 and the gate rejects the run.

**The host call filters through rtk.** It runs on the host and stays optional.
The runner also works without it. Measured on 2026-09-30 with rtk 0.50.0 and
4997 tests, a green run prints 6 lines and 87 characters. The raw output has
5581 lines and 523110 characters. A red run keeps each failing test's name, its
diff and its stack lines.

**Exit 1 with `0 fail` means the gate rejected the run.** The filter hides the
rejection text. The last line names the full log under `rtk/tee/`, and that
log holds the rejection.

**Three traps in the host call.**
- Keep `bun test` as literal words at the end of the call. `rtk test` picks
  its filter from them. Without them a red run loses every name and diff.
- Never pass `sh -c '...'` to `rtk test`. It splits the script at spaces, so
  `rtk test sh -c 'exit 3'` prints nothing and exits 0. It does not forward
  stdin either.
- Do not use `rtk err` for tests, because it cuts object diffs short.
