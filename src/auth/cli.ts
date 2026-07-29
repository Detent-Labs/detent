/**
 * User administration CLI — the only way to create a local BPS user, assign
 * its roles, or change its password; no HTTP route does any of those three.
 * Listing users and disabling/enabling them do have an HTTP route — see
 * `src/http/admin-routes.ts` (`GET /admin/users`, `POST
 * /admin/users/:id/disable`, `POST /admin/users/:id/enable`). Usage:
 *
 *   bun run src/auth/cli.ts add-user <email> <password> [role,role,...]
 *   bun run src/auth/cli.ts set-roles <email> <role,role,...>
 *   bun run src/auth/cli.ts set-password <email> <password>
 */
import { createUser, setRoles, setPassword } from "./users.js";

async function main(argv: string[]): Promise<void> {
  const [command, ...args] = argv;
  switch (command) {
    case "add-user": {
      const [email, password, rolesArg] = args;
      if (!email || !password) throw new Error("usage: add-user <email> <password> [role,role,...]");
      const roles = rolesArg ? rolesArg.split(",").map((r) => r.trim()).filter(Boolean) : [];
      const { userId } = await createUser(email, password, roles);
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
    default:
      throw new Error(`unknown command: ${command ?? "(none)"} — expected add-user | set-roles | set-password`);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
