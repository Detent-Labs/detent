#!/bin/sh
# scripts/deploy-demo.sh <ssh-target> — builds the engine image here, ships it
# and deploy/demo/ to the demo server, and restarts the pod. Example target:
# detent@detent.org. POSIX sh only.
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: deploy-demo.sh <ssh-target>" >&2
  exit 2
fi
target=$1

# Every ssh and scp call below shares one TCP connection. The demo host's
# network drops port 22 for minutes when new connections follow the image
# upload in quick succession.
control_dir=$(mktemp -d)
trap 'command ssh -o ControlPath="$control_dir/cm" -O exit "$target" 2>/dev/null; rm -rf "$control_dir"' EXIT
ssh() { command ssh -o ControlMaster=auto -o ControlPath="$control_dir/cm" -o ControlPersist=120 "$@"; }
scp() { command scp -o ControlMaster=auto -o ControlPath="$control_dir/cm" -o ControlPersist=120 "$@"; }

# The post-commit hook leaves VERSION modified on purpose.
if [ -n "$(git status --porcelain -- . ':!VERSION')" ]; then
  echo "deploy-demo.sh: the working tree is dirty; commit or remove the changes first" >&2
  exit 1
fi

podman build --format docker -t localhost/detent-engine:demo -f deploy/engine.Dockerfile .
podman save localhost/detent-engine:demo | ssh "$target" podman load
ssh "$target" podman image prune -f

ssh "$target" 'mkdir -p ~/.config/containers/systemd ~/.config/systemd/user ~/detent'
# Quadlet units, plain systemd units, then the files the units mount or run.
scp deploy/demo/*.pod deploy/demo/*.container deploy/demo/*.volume "$target:.config/containers/systemd/"
scp deploy/demo/systemd/* "$target:.config/systemd/user/"
scp deploy/demo/Caddyfile deploy/demo/engine.env.example deploy/demo/setup.sh deploy/demo/reset.sh "$target:detent/"

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
