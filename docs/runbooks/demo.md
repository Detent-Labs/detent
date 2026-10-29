# Demo Server

The public demo runs at `https://detent.org`. It has known logins, and it
resets to the seed state every night at 03:00 UTC. A visitor can change or
break anything, because the reset discards it.

`docs/runbooks/deployment.md` explains each engine variable. The file
`deploy/demo/engine.env.example` sets the demo's values, and this runbook
restates none of them.

## Server preparation

The server runs Debian 13 with 1 vCPU, 2 GB of RAM and a 20 GB disk. The image's
admin account is `debian`, with passwordless sudo. Run steps 1 to 6 as root
(`sudo -i`) on the server. Every later command runs on the developer machine
and reaches the server over SSH as `detent`.

1. Upgrade the system and install the packages:

   ```sh
   apt update && apt full-upgrade -y
   apt install -y sudo podman passt uidmap fuse-overlayfs dbus-user-session git ufw unattended-upgrades
   podman --version
   ```

   The version is 5.4.x.

2. Add the service account. It has no sudo, holds the same SSH key and
   lingers:

   ```sh
   adduser detent
   mkdir -p ~detent/.ssh
   cp ~debian/.ssh/authorized_keys ~detent/.ssh/
   chown -R detent:detent ~detent/.ssh
   chmod 700 ~detent/.ssh && chmod 600 ~detent/.ssh/authorized_keys
   loginctl enable-linger detent
   ```

   A non-interactive `ssh detent@... systemctl --user` needs three parts.
   Lingering keeps the user manager running. The `pam_systemd` module and the
   `dbus-user-session` package give the session a user bus.

3. Let a rootless container bind ports 80 and 443, and open the firewall:

   ```sh
   echo 'net.ipv4.ip_unprivileged_port_start=80' > /etc/sysctl.d/90-rootless-ports.conf
   sysctl --system
   ufw allow OpenSSH
   ufw allow 80,443/tcp
   ufw enable
   ```

4. Harden SSH. Do this only after `ssh debian@<ip>` and `ssh detent@<ip>` both
   work in a second terminal:

   ```sh
   printf 'PermitRootLogin no\nPasswordAuthentication no\n' > /etc/ssh/sshd_config.d/10-hardening.conf
   systemctl reload ssh
   ```

5. Enable security updates:

   ```sh
   dpkg-reconfigure -plow unattended-upgrades
   ```

6. Add a 2 GB swap file, since the server has 2 GB of RAM:

   ```sh
   fallocate -l 2G /swapfile
   chmod 600 /swapfile
   mkswap /swapfile
   swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   echo 'vm.swappiness=10' > /etc/sysctl.d/90-swappiness.conf
   sysctl --system
   swapon --show; free -h
   ```

DNS: `detent.org` has A and AAAA records that point at the server. `www.detent.org`
has no record. The first start can take a minute while Caddy obtains the
certificate.

## First deploy

Run this on the developer machine, from a clean tree with a pushed commit
checked out. The machine needs `git` and SSH access to the server as `detent`:

```sh
sh scripts/deploy-demo.sh detent@detent.org
```

The script refuses a dirty tree and ignores `VERSION`. It also refuses a commit
that no remote branch contains, before it contacts the server. On the first run
the server clones `https://github.com/Detent-Labs/detent.git` into
`~/detent/repo`. Each deploy fetches there, checks out the pushed commit and
builds the engine image on the server. No image crosses the network. The
server copies `deploy/demo/` from the same checkout.

The build needs outbound HTTPS to GitHub and the npm registry. It loads the
single vCPU while the demo keeps running.

<!-- antislop: allow passive-voice -->
Measured build time on the demo server: to be recorded by the test deploy.

Two marker files steer the script. A missing `~/.config/detent/engine.env` means the
secrets do not exist yet. A missing `~/.config/detent/seeded` means the demo is
not seeded.

When `engine.env` is missing, the script runs `setup.sh`. That script writes
the two secret files with mode 600 and enables the nightly reset timer.

Next the script pulls the Postgres and Caddy images and runs the server's
Quadlet generator. A bad unit file aborts the deploy here. Then it reloads
systemd and restarts the pod and its three containers.

When `seeded` is missing, the script runs `reset.sh`. That script writes
`seeded` as its last step. A first deploy that fails part-way therefore seeds on
the re-run.

## Later deploy

Run the same command. Both markers exist, so the script skips `setup.sh` and
`reset.sh`. The server builds the new commit, prunes the old image and copies
the files from the checkout. Then it restarts the pod and the containers. The data stays until the
next reset.

## Manual reset

```sh
ssh detent@detent.org 'sh ~/detent/reset.sh'
```

The script drops the database, starts the engine again and seeds it.

## Checking state

```sh
ssh detent@detent.org systemctl --user status detent-demo-pod.service
ssh detent@detent.org podman ps
ssh detent@detent.org journalctl --user -u detent-engine.service
ssh detent@detent.org systemctl --user list-timers detent-demo-reset.timer
```

## Known logins

`scripts/seed.ts` creates one account per reserved role. The script `reset.sh`
adds a superuser that holds all of them. Every account uses the password
`seed-demo-password`.

| Login | Role |
|---|---|
| `demo-superuser@example.test` | every `system:*` role |
| `demo-publish@example.test` | `system:publish` |
| `demo-cancel-any@example.test` | `system:cancel-any` |
| `demo-admin@example.test` | `system:admin` |
| `demo-developer@example.test` | `system:developer` |
| `demo-reports@example.test` | `system:reports` |
| `demo-datalists@example.test` | `system:datalists` |
| `demo-templates@example.test` | `system:templates` |
| `demo-author@example.test` | `system:author` |
| `demo-create@example.test` | `system:create` |
| `demo-owner@example.test` | `system:owner` |

A visitor who changes a password locks that login for the other visitors until
the next reset. A visitor with the admin login can do worse. That login can
disable or re-password every demo account within a minute. It can also
override interface wording with `PUT /admin/ui-strings`, and the public login
page shows that text. Each effect lasts until the next reset. Run the manual
reset to undo it.

## Disk is filling

Uploads stop at 1 MiB each. Every JSON route accepts a body of up to 8 MiB
(`MAX_REQUEST_BODY_SIZE` in `src/http/server.ts`), so drafts and form data fill
the disk faster. A process whose `process.start` action starts itself grows the
database with no visitor at work. Check the disk:

```sh
ssh detent@detent.org df -h
```

When the disk runs short, run the manual reset. It drops the database and frees
the space.

A full disk can leave Postgres unable to start, and then the reset times out.
In that case remove the database volume and start again:

```sh
ssh detent@detent.org systemctl --user stop detent-engine.service detent-db.service
ssh detent@detent.org podman volume rm systemd-detent-pgdata
ssh detent@detent.org systemctl --user start detent-db.service
ssh detent@detent.org 'sh ~/detent/reset.sh'
```

The volume name is `systemd-` plus the unit name. Check it with
`podman volume ls`. A watchdog or an hourly reset is a follow-up. Nothing
builds it yet.

## Rollback

Stop the reset timer and the pod. The timer would otherwise restart the engine
at 03:00 UTC:

```sh
ssh detent@detent.org systemctl --user stop detent-demo-reset.timer detent-demo-pod.service
```

## Related

- `docs/runbooks/deployment.md` explains each variable.
- `deploy/demo/` holds the Quadlet units, the Caddyfile and the scripts.
