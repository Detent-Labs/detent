/**
 * Roadmap #5a (see CLAUDE.md "Post-v1: make the engine reachable"): drives
 * examples/expense-approval.json end-to-end through the Runtime API Layer
 * (publish -> create -> view -> submit -> transition, including the async
 * "book" wait-state) against the devcontainer's Postgres. Validates that the
 * full engine + Runtime API Layer stack works together end-to-end. A
 * throwaway validation script, not a permanent CLI or capability.
 *
 * Run inside the devcontainer (DATABASE_URL must be set):
 *   bun run scripts/demo-expense-approval.ts
 */
import { readFileSync } from "node:fs";
import { sql, initSchema } from "../src/engine/store.js";
import { publishBody, createDefinitionStore } from "../src/engine/definitions.js";
import { createRegistry, register, createDataSourceRegistry } from "../src/engine/registry.js";
import { drainOutbox } from "../src/engine/outbox.js";
import { drainResolutions } from "../src/engine/resolution.js";
import { createProcessInstance, getInstanceView, submitAndTransition } from "../src/runtime/api.js";
import type { InstanceView } from "../src/runtime/api.js";
import type { Actor } from "../src/cel/eval.js";
import type { ProcessId } from "../src/schema/definition.js";

const actor: Actor = { id: "user_demo", roles: ["employee", "finance-approver"] };

function fieldId(view: InstanceView, key: string): string {
  const f = view.fields.find((f) => f.field.key === key);
  if (!f) throw new Error(`field '${key}' not in view of step '${view.step.key}'`);
  return f.field.id;
}

function logView(label: string, view: InstanceView) {
  const fields = view.fields
    .map((f) => `${f.field.key}=${JSON.stringify(f.value)}${f.required ? " (required)" : ""}`)
    .join(", ");
  console.log(`\n--- ${label} ---`);
  console.log(`step: ${view.step.key} | status: ${view.status}`);
  console.log(`fields: ${fields || "(none)"}`);
  console.log(`available paths: ${view.availablePaths.map((p) => p.key).join(", ") || "(none)"}`);
}

async function main() {
  await initSchema();

  // Real handlers don't exist yet (roadmap #5e); dummy ones just enough to
  // satisfy publish-time registry validation and drive the demo forward.
  const registry = createRegistry();
  register(registry, "notify.email", { handler: async () => ({}) });
  register(registry, "accounting.postInvoice", { handler: async () => ({ status: "booked" }) });
  const dataSourceReg = createDataSourceRegistry();

  const raw = JSON.parse(readFileSync(new URL("../examples/expense-approval.json", import.meta.url), "utf-8"));
  const processId = `proc_${crypto.randomUUID()}` as ProcessId;
  const published = await publishBody(processId, raw.definition, registry, dataSourceReg);
  console.log(`Published ${processId} as version ${published.version} (hash ${published.definitionHash.slice(0, 12)}...)`);

  let instance = await createProcessInstance(processId, actor, dataSourceReg);
  console.log(`Created instance ${instance.instanceId} at step ${instance.currentStepId}`);

  // --- Capture ---
  let view = await getInstanceView(instance.instanceId, actor, dataSourceReg);
  logView("capture", view);
  const submitPath = view.availablePaths.find((p) => p.key === "submit")!;
  instance = await submitAndTransition(
    instance.instanceId,
    submitPath.id,
    { [fieldId(view, "amount")]: 250, [fieldId(view, "reason")]: "Team lunch" },
    actor,
    dataSourceReg,
  );

  // --- Review ---
  view = await getInstanceView(instance.instanceId, actor, dataSourceReg);
  logView("review", view);
  const approvePath = view.availablePaths.find((p) => p.key === "approve")!;
  instance = await submitAndTransition(
    instance.instanceId,
    approvePath.id,
    { [fieldId(view, "review_note")]: "Looks good, approved." },
    actor,
    dataSourceReg,
  );

  // --- Book: async wait-state. onEntry enqueued postInvoice; drive the
  // outbox delivery + writeback-triggered re-resolution passes by hand,
  // since no background worker is running in this script. ---
  view = await getInstanceView(instance.instanceId, actor, dataSourceReg);
  logView("book (before async settle)", view);

  const definitionStore = createDefinitionStore(sql);
  for (let i = 0; i < 5 && view.status === "running" && view.step.key === "book"; i++) {
    await drainOutbox(sql, registry);
    await drainResolutions(sql, definitionStore.resolveBody);
    view = await getInstanceView(instance.instanceId, actor, dataSourceReg);
  }

  logView("final", view);
  console.log(view.status === "completed" ? "\nDone: instance reached a terminal step." : "\nDid not reach a terminal step within the retry budget.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
