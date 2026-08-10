import { z } from "zod";
import { createRegistry, register, type Registry } from "workflow-engine/engine/registry";

/**
 * `checkActionRegistry` needs a real `Registry` — a `Map<string, HandlerDef>`
 * whose `configSchema` is a live Zod schema, not JSON. A Zod schema can't be
 * authored as plain data pasted into the browser, and evaluating arbitrary
 * pasted author JS to build one would be a real code-execution surface for a
 * document editor that has no server and no reason to run untrusted code. So
 * v1 offers one built-in example registry an author can toggle on to see the
 * registry-check dimension go from "not checked" to a real pass/fail — a
 * production embedding of this editor would inject its own real `Registry`
 * the same way `publishBody` does, via `checkActionRegistry`'s existing
 * `(body, registry)` signature, not through this toggle.
 */
export function createExampleRegistry(): Registry {
  const registry = createRegistry();

  register(registry, "http.call", {
    handler: async () => undefined,
    configSchema: z.object({
      url: z.url(),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
    }),
  });

  register(registry, "notify.email", {
    handler: async () => undefined,
    configSchema: z.object({
      to: z.email(),
      template: z.string(),
    }),
  });

  return registry;
}
