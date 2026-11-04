import { useEffect, useState } from "react";
import { getAssignableGroups } from "../../api/client.js";
import type { AssignableGroup } from "../../api/types.js";
import { describeCaughtError } from "../../errors.js";

/**
 * `loading` until the read settles, `ready` once the list arrived (`groups`
 * may still be empty), `failed` when the read threw. `groups` is empty and
 * `message` is empty in every state but `ready` and `failed` respectively.
 */
export interface AssignableGroups {
  status: "loading" | "ready" | "failed";
  groups: AssignableGroup[];
  message: string;
}

const LOADING: AssignableGroups = { status: "loading", groups: [], message: "" };

/** A settled read and the process it belongs to. */
export interface AssignableGroupsResult {
  forProcessId: string;
  status: "ready" | "failed";
  groups: AssignableGroup[];
  message: string;
}

/**
 * The state to draw for `processId`. A result fetched for another process
 * reads as loading, so a switch never shows the earlier process's groups.
 */
export function assignableGroupsFor(result: AssignableGroupsResult | undefined, processId: string): AssignableGroups {
  if (!result || result.forProcessId !== processId) return LOADING;
  return { status: result.status, groups: result.groups, message: result.message };
}

/** The groups open to `processId`, read once per process. A failed read sets `failed` with its message. */
export function useAssignableGroups(token: string, processId: string): AssignableGroups {
  const [result, setResult] = useState<AssignableGroupsResult | undefined>(undefined);

  useEffect(() => {
    let live = true;
    getAssignableGroups(processId, token)
      .then((groups) => {
        if (live) setResult({ forProcessId: processId, status: "ready", groups, message: "" });
      })
      .catch((err: unknown) => {
        if (live) setResult({ forProcessId: processId, status: "failed", groups: [], message: describeCaughtError(err) });
      });
    return () => {
      live = false;
    };
  }, [token, processId]);

  return assignableGroupsFor(result, processId);
}
