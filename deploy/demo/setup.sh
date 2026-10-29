#!/bin/sh
# Run once on the demo server as the `detent` account. Writes db.env and
# engine.env with fresh secrets, only when absent, and enables the nightly reset.
set -eu

conf="$HOME/.config/detent"
here=$(dirname "$0")
umask 077
mkdir -p "$conf"

secret() {
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

have=0
[ -e "$conf/db.env" ] && have=$((have + 1))
[ -e "$conf/engine.env" ] && have=$((have + 1))
if [ "$have" -eq 1 ]; then
  echo "setup.sh: only one of db.env and engine.env exists; remove it or restore the other" >&2
  exit 1
fi
if [ ! -e "$conf/db.env" ]; then
  pg=$(secret)
  jwt=$(secret)
  printf 'POSTGRES_PASSWORD=%s\n' "$pg" > "$conf/db.env"
  sed -e "s/<generated>@/$pg@/" -e "s/^AUTH_JWT_SECRET=.*/AUTH_JWT_SECRET=$jwt/" \
    "$here/engine.env.example" | grep -v '^#' > "$conf/engine.env"
  chmod 600 "$conf/db.env" "$conf/engine.env"
fi

systemctl --user enable --now detent-demo-reset.timer
