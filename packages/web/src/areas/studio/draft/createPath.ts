import type { Path, PathTrigger } from "workflow-engine/schema";
import type { DraftOf } from "./types";
import { mintId } from "./ids";

type DraftPath = DraftOf<Path>;

/** One path-creation shape, called by `PathsPanel`'s own "add path" action
 * and by both canvas drag-to-connect branches (an existing target, and the
 * new drop-on-empty-canvas gesture), so none can drift in which fields it
 * sets. */
export function newPath(to: string | undefined, trigger: PathTrigger): DraftPath {
  return { id: mintId("path"), key: "", to: to as DraftPath["to"], trigger };
}
