/**
 * instance_audit cleanup for a suite's `beforeEach`. The engine's own
 * connecting role holds no TRUNCATE and no DELETE on the relation
 * (instance-audit-log-chain design.md "`instance_audit` carries no foreign
 * key to `instances`"), so a suite that truncates `instances` clears its
 * audit rows this way instead, under the owner role, rather than folding
 * `instance_audit` into its own TRUNCATE list.
 */
import { sql, withTransaction } from "../src/engine/store.js";

export const clearInstanceAudit = (): Promise<void> =>
  withTransaction(sql, async (tx) => {
    await tx`SET LOCAL ROLE detent_audit_owner`;
    await tx`DELETE FROM instance_audit`;
  });
