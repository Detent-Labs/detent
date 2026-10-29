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

# The post-commit hook leaves VERSION modified on purpose.
if [ -n "$(git status --porcelain -- . ':!VERSION')" ]; then
  echo "deploy-demo.sh: the working tree is dirty; commit or remove the changes first" >&2
  exit 1
fi

podman build --format docker -t localhost/detent-engine:demo -f deploy/engine.Dockerfile .
podman save localhost/detent-engine:demo | ssh "$target" podman load

ssh "$target" 'mkdir -p ~/.config/containers/systemd ~/.config/systemd/user ~/detent'
# Quadlet units, plain systemd units, then the files the units mount or run.
scp deploy/demo/*.pod deploy/demo/*.container deploy/demo/*.volume "$target:.config/containers/systemd/"
scp deploy/demo/systemd/* "$target:.config/systemd/user/"
scp deploy/demo/Caddyfile deploy/demo/engine.env.example deploy/demo/setup.sh deploy/demo/reset.sh "$target:detent/"

# test exits 0 when the file is absent, 1 when present; ssh itself exits 255.
first=no
rc=0
ssh "$target" 'test ! -e ~/.config/detent/engine.env' || rc=$?
case $rc in
  0) first=yes; ssh "$target" 'sh ~/detent/setup.sh' ;;
  1) ;;
  *) echo "deploy-demo.sh: ssh to $target failed (exit $rc)" >&2; exit 1 ;;
esac

# The container units bind to the pod, but starting the pod starts none of them.
ssh "$target" 'systemctl --user daemon-reload && systemctl --user restart detent-demo-pod.service detent-db.service detent-engine.service detent-caddy.service'

if [ "$first" = yes ]; then
  ssh "$target" 'sh ~/detent/reset.sh'
fi
