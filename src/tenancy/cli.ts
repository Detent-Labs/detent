/**
 * Tenant administration CLI — the only way to create a tenant; no HTTP route
 * does. Stage 24 put self-service signup out of scope, and this is what
 * enforces that. Mirrors `src/auth/cli.ts`'s shape. Usage:
 *
 *   bun run src/tenancy/cli.ts add-tenant <key> <name> <database-url>
 *   bun run src/tenancy/cli.ts list-tenants
 *
 * Every command needs `TENANT_CONTROL_PLANE_URL`. Without it there is no
 * control plane to write to, and the deployment is the single-tenant one this
 * whole file is irrelevant to.
 */
import { controlPlane, initControlPlane, listTenants } from "./store.js";
import { provisionTenant } from "./provision.js";

async function main(argv: string[]): Promise<void> {
  const control = controlPlane();
  // Idempotent, and load-bearing against a fresh control plane: add-tenant is
  // usually the first thing anyone runs there. The same reasoning
  // `src/auth/cli.ts` applies to initSchema.
  await initControlPlane(control);

  const [command, ...rest] = argv;
  switch (command) {
    case "add-tenant": {
      const [key, name, databaseUrl] = rest;
      if (!key || !name || !databaseUrl) throw new Error("usage: add-tenant <key> <name> <database-url>");
      const tenant = await provisionTenant(control, { key, name, databaseUrl });
      console.log(`created tenant ${tenant.key} (${tenant.id})`);
      break;
    }
    case "list-tenants": {
      for (const t of await listTenants(control)) console.log(`${t.key}\t${t.name}\t${t.id}`);
      break;
    }
    default:
      throw new Error(`unknown command: ${command ?? "(none)"}`);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
