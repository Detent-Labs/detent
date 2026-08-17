import { getRegistry } from "../../api/client.js";
import type { RegistryInfo } from "../../api/types.js";
import { useFetchOnce } from "./useFetchOnce.js";

/** Fetches GET /registry once per mount. `undefined` until it resolves, and after a failed fetch. */
export function useRegistry(token: string): RegistryInfo | undefined {
  return useFetchOnce(token, getRegistry);
}
