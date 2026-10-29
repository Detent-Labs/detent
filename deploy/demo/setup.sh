#!/bin/sh
# Run once on the demo server as the `detent` account. Writes db.env and
# engine.env with fresh secrets, only when absent, and enables the nightly reset.
set -eu

conf="$HOME/.config/detent"
here=$(dirname "$0")
mkdir -p "$conf"
umask 077

secret() {
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

if [ ! -e "$conf/db.env" ] && [ ! -e "$conf/engine.env" ]; then
  pg=$(secret)
  jwt=$(secret)
  printf 'POSTGRES_PASSWORD=%s\n' "$pg" > "$conf/db.env"
  sed -e "s/<generated>@/$pg@/" -e "s/^AUTH_JWT_SECRET=.*/AUTH_JWT_SECRET=$jwt/" \
    "$here/engine.env.example" | grep -v '^#' > "$conf/engine.env"
  chmod 600 "$conf/db.env" "$conf/engine.env"
fi

systemctl --user enable detent-demo-reset.timer
