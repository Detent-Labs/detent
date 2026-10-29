#!/bin/sh
# scripts/deploy-demo.sh <ssh-target> — deploys the checked-out, pushed commit:
# the server fetches it into ~/detent/repo, builds the engine image there, copies
# deploy/demo/ from the checkout and restarts the pod. Example target:
# detent@detent.org. POSIX sh only.
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: deploy-demo.sh <ssh-target>" >&2
  exit 2
fi
target=$1

# Every ssh call below shares one TCP connection. The demo host's
# network drops port 22 for minutes when new connections follow the image
# upload in quick succession.
control_dir=$(mktemp -d)
trap 'command ssh -o ControlPath="$control_dir/cm" -O exit "$target" 2>/dev/null; rm -rf "$control_dir"' EXIT
ssh() { command ssh -o ControlMaster=auto -o ControlPath="$control_dir/cm" -o ControlPersist=120 "$@"; }

# The post-commit hook leaves VERSION modified on purpose.
if [ -n "$(git status --porcelain -- . ':!VERSION')" ]; then
  echo "deploy-demo.sh: the working tree is dirty; commit or remove the changes first" >&2
  exit 1
fi

# The server can build only a commit the remote holds.
sha=$(git rev-parse HEAD)
case $sha in
  *[!0-9a-f]*|'') echo "deploy-demo.sh: HEAD is not a commit hash: $sha" >&2; exit 1 ;;
esac
git fetch --quiet
if [ -z "$(git branch -r --contains "$sha")" ]; then
  echo "deploy-demo.sh: commit $sha is on no remote branch; push it first" >&2
  exit 1
fi

ssh "$target" 'mkdir -p ~/.config/containers/systemd ~/.config/systemd/user ~/detent'
ssh "$target" 'test -d ~/detent/repo/.git || git clone --quiet https://github.com/Detent-Labs/detent.git ~/detent/repo'
ssh "$target" "git -C ~/detent/repo fetch --quiet origin && git -C ~/detent/repo checkout --quiet --detach $sha"

# The image build loads the server's single vCPU; the duration comes from two date readings.
build_start=$(date +%s)
ssh "$target" 'podman build --format docker -t localhost/detent-engine:demo -f ~/detent/repo/deploy/engine.Dockerfile ~/detent/repo'
echo "deploy-demo.sh: server build took $(($(date +%s) - build_start)) s"
ssh "$target" podman image prune -f

# Quadlet units, plain systemd units, then the files the units mount or run.
ssh "$target" 'cd ~/detent/repo/deploy/demo && cp *.pod *.container *.volume ~/.config/containers/systemd/ && cp systemd/* ~/.config/systemd/user/ && cp Caddyfile engine.env.example setup.sh reset.sh ~/detent/'

# test exits 0 when the file is absent, 1 when present; ssh itself exits 255.
rc=0
ssh "$target" 'test ! -e ~/.config/detent/engine.env' || rc=$?
case $rc in
  0) ssh "$target" 'sh ~/detent/setup.sh' ;;
  1) ;;
  *) echo "deploy-demo.sh: ssh to $target failed (exit $rc)" >&2; exit 1 ;;
esac

# reset.sh writes the marker as its last step, so a failed first deploy seeds on the re-run.
seed=no
rc=0
ssh "$target" 'test ! -e ~/.config/detent/seeded' || rc=$?
case $rc in
  0) seed=yes ;;
  1) ;;
  *) echo "deploy-demo.sh: ssh to $target failed (exit $rc)" >&2; exit 1 ;;
esac

# A bad key aborts here, before the restart. The pull keeps the first start inside
# the unit's start timeout and gives each deploy the current patch level.
ssh "$target" '/usr/libexec/podman/quadlet -dryrun -user >/dev/null'
ssh "$target" podman pull docker.io/library/postgres:18 docker.io/library/caddy:2

# The container units bind to the pod, but starting the pod starts none of them.
ssh "$target" 'systemctl --user daemon-reload && systemctl --user restart detent-demo-pod.service detent-db.service detent-engine.service detent-caddy.service'

if [ "$seed" = yes ]; then
  ssh "$target" 'sh ~/detent/reset.sh'
fi
