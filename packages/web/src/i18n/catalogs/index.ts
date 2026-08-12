import { shellCatalog } from "./shell.js";
import { appCatalog } from "./app.js";
import { studioCatalog } from "./studio.js";
import { adminCatalog } from "./admin.js";
import { reportingCatalog } from "./reporting.js";

/**
 * Every builtin catalog, keyed by the same area name the override table stores.
 *
 * Only the admin area's UI-strings screen imports this file. Each area imports
 * its own catalog file directly, so the per-area chunking `shell/App.tsx` sets
 * up survives: the participant's chunk pulls `catalogs/app.ts` alone, and only
 * the admin chunk pulls all five.
 */
export const BUILTIN_CATALOGS: Record<string, Record<string, Record<string, string>>> = {
  shell: shellCatalog,
  app: appCatalog,
  studio: studioCatalog,
  admin: adminCatalog,
  reporting: reportingCatalog,
};

/** Area names in the order the screen offers them, so the picker does not depend on object key order. */
export const OVERRIDABLE_AREAS = ["shell", "app", "studio", "admin", "reporting"] as const;
