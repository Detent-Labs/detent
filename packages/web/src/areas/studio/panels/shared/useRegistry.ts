import { useEffect, useState } from "react";
import { getRegistry } from "../../api/client.js";
import type { RegistryInfo } from "../../api/types.js";

/** Fetches GET /registry once per mount. `undefined` until it resolves, and after a failed fetch. */
export function useRegistry(token: string): RegistryInfo | undefined {
  const [registry, setRegistry] = useState<RegistryInfo | undefined>(undefined);

  useEffect(() => {
    let live = true;
    getRegistry(token)
      .then((r) => live && setRegistry(r))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [token]);

  return registry;
}
