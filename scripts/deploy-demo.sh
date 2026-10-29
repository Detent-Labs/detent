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

if [ -n "$(git status --porcelain)" ]; then
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

first=no
if ssh "$target" 'test ! -e ~/.config/detent/engine.env'; then
  first=yes
  ssh "$target" 'sh ~/detent/setup.sh'
fi

ssh "$target" 'systemctl --user daemon-reload && systemctl --user restart detent-demo-pod.service'

if [ "$first" = yes ]; then
  ssh "$target" 'sh ~/detent/reset.sh'
fi
