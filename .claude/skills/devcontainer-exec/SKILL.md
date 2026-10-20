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
It builds the app image, plays the pod, waits for every container's probe,
installs dependencies, seeds the demo data and starts the HTTP server. It
prints the three ports at the end. Re-running it leaves a pod that already
runs the current spec alone. To manage the pod without the rest:
```
sh scripts/dev-pod.sh up      # build, write .devcontainer/pod.yaml, play, wait
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

`DATABASE_URL` is set in the `app` container and points at
`localhost:5432`. The three containers share one network namespace, so every
address between them is `localhost`. DB-backed tests need no extra setup once
they run through `dev-exec.sh`.

The pod publishes this checkout's derived ports on `127.0.0.1` only. To view
a dev server from the host browser, run it inside the container:
```
sh scripts/dev-exec.sh sh -c 'cd packages/web && bun run dev -- --host 0.0.0.0'
```
In a linked worktree, point it at that checkout's own engine:
`VITE_API_URL=http://127.0.0.1:$PORT_APP`.

Nothing publishes an extra port of your own. A port the generated spec does
not cover means a change to `scripts/dev-pod.sh`. Never hand-edit
`.devcontainer/pod.yaml`: the next `up` overwrites it.
