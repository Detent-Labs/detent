import { appCatalog, type CatalogKey } from "../../i18n/catalogs/app.js";
import { makeCatalog } from "../../i18n/makeCatalog.js";

export type { CatalogKey };

export const t = makeCatalog("app", appCatalog);
