/**
 * The Groups screen's pure logic, mirroring `usersLogic.ts` and
 * `migrationsLogic.ts`: everything the screen needs that does not touch
 * React, so it stays testable without mounting the screen.
 */
import type { UiLocale } from "../../../i18n/locale.js";
import type { GroupScope, ProcessSummary, UserSummary } from "../api/types.js";
import { t, tFill } from "../catalog.js";

/** A group's scope, in the words an operator reads: "Global," or "N processes." */
export function scopeText(scope: GroupScope, locale: UiLocale): string {
  if (scope.type === "global") return t(locale, "groups.scopeGlobal");
  return tFill(locale, "groups.scopeProcesses", { n: scope.processIds.length });
}

/** The process-filter predicate: a global group always matches, a processes-scoped one matches when it names the filtered process. No filter (`processId` undefined) matches everything. */
export function groupMatchesFilter(scope: GroupScope, processId: string | undefined): boolean {
  if (!processId) return true;
  if (scope.type === "global") return true;
  return scope.processIds.includes(processId);
}

/** The create-time scope pre-fill: the active process filter, or global when none is set. */
export function prefillScope(processId: string | undefined): GroupScope {
  return processId ? { type: "processes", processIds: [processId] } : { type: "global" };
}

/**
 * The member editor's forward (text-to-ids) resolution. Each comma-separated
 * token resolves against the loaded account directory by email, OR — when no
 * email matches — passes through unchanged when it exactly matches an id
 * already in `preEditMembers`, carrying a dangling member forward across an
 * edit that does not touch it. A token satisfying neither is collected into
 * `unresolvedTokens`, refused before any request fires. An entry empty after
 * trimming is dropped, mirroring `parseRoles`'s own tolerance for a stray or
 * trailing comma.
 */
export function resolveMemberTokens(
  text: string,
  users: UserSummary[],
  preEditMembers: string[],
): { ok: true; memberIds: string[] } | { ok: false; unresolvedTokens: string[] } {
  const byEmail = new Map(users.map((u) => [u.email, u.userId]));
  const preEditSet = new Set(preEditMembers);
  const memberIds: string[] = [];
  const unresolvedTokens: string[] = [];
  for (const raw of text.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const emailMatch = byEmail.get(token);
    if (emailMatch !== undefined) {
      memberIds.push(emailMatch);
      continue;
    }
    if (preEditSet.has(token)) {
      memberIds.push(token);
      continue;
    }
    unresolvedTokens.push(token);
  }
  if (unresolvedTokens.length > 0) return { ok: false, unresolvedTokens };
  return { ok: true, memberIds };
}

/**
 * The member editor's reverse (ids-to-text) resolution, seeding its initial
 * text. A stored member id no loaded account matches shows as that id
 * itself, comma-joined alongside any resolved emails — mirroring
 * `usersLogic.ts::managerLabel`'s identical fallback for an unmatched
 * manager pointer, and `blockingProcessLabels`'s own fallback below.
 */
export function memberDisplayText(members: string[], users: UserSummary[]): string {
  const byId = new Map(users.map((u) => [u.userId, u.email]));
  return members.map((id) => byId.get(id) ?? id).join(", ");
}

/**
 * The deletion guard's blocking-process-id-to-label resolver. `ProcessSummary.label`
 * is `LocalizedText`, resolved against the process's own `baseLocale` — never the
 * operator's `UiLocale` — the same way `instancesLogic.ts::labelText` resolves it.
 * Inlined rather than calling `labelText` directly: that function's own final
 * fallback is `""`, not the id, which would silently produce an empty string for a
 * matched process carrying an empty label object. A blocking id absent from the
 * loaded process list falls back to the raw id string itself.
 */
export function blockingProcessLabels(blockingProcessIds: string[], processes: ProcessSummary[]): string[] {
  return blockingProcessIds.map((id) => {
    const match = processes.find((p) => p.processId === id);
    if (!match) return id;
    return match.label[match.baseLocale] ?? Object.values(match.label)[0] ?? id;
  });
}

/** An empty processes list is not a meaningful scope; a global scope is always savable. */
export function scopeIsSavable(scope: GroupScope): boolean {
  return !(scope.type === "processes" && scope.processIds.length === 0);
}
