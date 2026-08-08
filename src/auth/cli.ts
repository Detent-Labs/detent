/**
 * User administration CLI — the only way to create a local BPS user or change
 * its password; no HTTP route does either. Listing users, disabling/enabling
 * them and assigning roles do have an HTTP route — see
 * `src/http/admin-routes.ts` (`GET /admin/users`, `POST
 * /admin/users/:id/disable`, `POST /admin/users/:id/enable`, `PATCH
 * /admin/users/:id/roles`, `PATCH /admin/users/:id/manager`, `PATCH
 * /admin/users/:id/name`). `set-roles` and `set-manager` below stay: they key on
 * the email a human types, and `set-roles` is the recovery path when no
 * `system:admin` holder is left. Usage:
 *
 *   bun run src/auth/cli.ts add-user <email> <password> [role,role,...] [display-name]
 *   bun run src/auth/cli.ts set-roles <email> <role,role,...>
 *   bun run src/auth/cli.ts set-password <email> <password>
 *   bun run src/auth/cli.ts set-manager <email> <manager-email|->
 *   bun run src/auth/cli.ts set-name <email> <display-name>
 *
 * Display name sits last, so a caller who wants no display name omits it. An
 * account with a display name and no roles passes an empty roles argument:
 * `add-user <email> <password> "" <display-name>`. A whitespace-only display
 * name stores as NULL, the same as an omitted one, and resolves to the email.
 */
import { createUser, setRoles, setPassword, setManagerByEmail, setDisplayNameByEmail } from "./users.js";
import { initSchema } from "../engine/store.js";

async function main(argv: string[]): Promise<void> {
  // Every statement in initSchema is CREATE ... IF NOT EXISTS, so this is a
  // no-op against a database that already has the schema — and load-bearing
  // against a fresh one, since add-user is often the first thing run there.
  await initSchema();
  const [command, ...args] = argv;
  switch (command) {
    case "add-user": {
      const [email, password, rolesArg, displayNameArg] = args;
      if (!email || !password) throw new Error("usage: add-user <email> <password> [role,role,...] [display-name]");
      const roles = rolesArg ? rolesArg.split(",").map((r) => r.trim()).filter(Boolean) : [];
      const { userId } = await createUser(email, password, roles, displayNameArg);
      console.log(`created ${userId} (${email}), roles: [${roles.join(", ")}]`);
      break;
    }
    case "set-roles": {
      const [email, rolesArg] = args;
      if (!email || !rolesArg) throw new Error("usage: set-roles <email> <role,role,...>");
      const roles = rolesArg.split(",").map((r) => r.trim()).filter(Boolean);
      await setRoles(email, roles);
      console.log(`${email} roles set to [${roles.join(", ")}]`);
      break;
    }
    case "set-password": {
      const [email, password] = args;
      if (!email || !password) throw new Error("usage: set-password <email> <password>");
      await setPassword(email, password);
      console.log(`${email} password updated`);
      break;
    }
    case "set-manager": {
      // "-" clears the pointer: an empty argv entry is indistinguishable from a
      // forgotten one, so the clear is spelled explicitly.
      const [email, managerArg] = args;
      if (!email || !managerArg) throw new Error("usage: set-manager <email> <manager-email|->");
      const managerEmail = managerArg === "-" ? null : managerArg;
      await setManagerByEmail(email, managerEmail);
      console.log(managerEmail ? `${email} manager set to ${managerEmail}` : `${email} manager cleared`);
      break;
    }
    case "set-name": {
      const [email, displayName] = args;
      if (!email || !displayName) throw new Error("usage: set-name <email> <display-name>");
      await setDisplayNameByEmail(email, displayName);
      // A whitespace-only argument normalizes to NULL rather than "", so the
      // report says cleared. Unlike set-manager, no "-" placeholder exists: the
      // CLI rejects nothing here, it only normalizes.
      const trimmed = displayName.trim();
      console.log(trimmed ? `${email} display name set to ${trimmed}` : `${email} display name cleared`);
      break;
    }
    default:
      throw new Error(`unknown command: ${command ?? "(none)"} — expected add-user | set-roles | set-password | set-manager | set-name`);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
