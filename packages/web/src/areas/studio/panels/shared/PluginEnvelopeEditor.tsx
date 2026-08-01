import { useState } from "react";
import type { Plugin } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import { t } from "../../catalog.js";

type DraftPlugin = DraftOf<Plugin>;

interface Props {
  label: string;
  value: DraftPlugin | undefined;
  onChange: (next: DraftPlugin) => void;
  typePlaceholder?: string;
}

/**
 * The `{ type, config }` plugin envelope recurs across the contract: actions,
 * data sources, assignment strategies, and a custom field type. One editor
 * for the shape shared by all of them; the core validates only the envelope
 * (each plugin ships its own JSON Schema, checked at publish, not here).
 */
export function PluginEnvelopeEditor({ label, value, onChange, typePlaceholder }: Props) {
  const [configText, setConfigText] = useState(() => JSON.stringify(value?.config ?? {}, null, 2));
  const [configError, setConfigError] = useState<string | null>(null);

  const commitConfig = (text: string) => {
    setConfigText(text);
    try {
      const parsed = JSON.parse(text);
      setConfigError(null);
      onChange({ ...value, type: value?.type ?? "", config: parsed });
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : t("common.invalidJson"));
    }
  };

  return (
    <fieldset className="plugin-envelope">
      <legend>{label}</legend>
      <label>
        type
        <input
          type="text"
          placeholder={typePlaceholder ?? t("plugin.typePlaceholder")}
          value={value?.type ?? ""}
          onChange={(e) => onChange({ ...value, type: e.target.value, config: value?.config ?? {} })}
        />
      </label>
      <label>
        config (JSON)
        <textarea rows={3} value={configText} onChange={(e) => commitConfig(e.target.value)} />
      </label>
      {configError && (
        <p className="error">
          {t("common.configErrorPrefix")} {configError}
        </p>
      )}
      <label>
        description
        <input
          type="text"
          value={value?.description ?? ""}
          onChange={(e) => onChange({ ...value, type: value?.type ?? "", config: value?.config ?? {}, description: e.target.value })}
        />
      </label>
    </fieldset>
  );
}
