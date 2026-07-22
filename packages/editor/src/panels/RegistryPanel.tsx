import { useDraft } from "../draft/store";
import { useT } from "../i18n/store";
import { createExampleRegistry } from "../registry/exampleRegistry";

/**
 * Toggles the injected `Registry` `checkActionRegistry` runs against (task
 * 4.2 / editor-live-validation's "Registry becomes available mid-session"
 * scenario). See `registry/exampleRegistry.ts` for why this is a built-in
 * example rather than an author-authored one in v1.
 */
export function RegistryPanel() {
  const { registry, setRegistry } = useDraft();
  const t = useT();

  return (
    <fieldset className="registry-panel">
      <legend>{t("registry.legend")}</legend>
      <label>
        registry
        <select
          value={registry ? "example" : "none"}
          onChange={(e) => setRegistry(e.target.value === "example" ? createExampleRegistry() : undefined)}
        >
          <option value="none">{t("registry.notLoadedOption")}</option>
          <option value="example">{t("registry.exampleOption")}</option>
        </select>
      </label>
    </fieldset>
  );
}
