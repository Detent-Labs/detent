import { shellCatalog, type CatalogKey } from "../i18n/catalogs/shell.js";
import { makeCatalog } from "../i18n/makeCatalog.js";

export type { CatalogKey };

export const t = makeCatalog("shell", shellCatalog);
