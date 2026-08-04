import { useState } from "react";
import type { Plugin } from "workflow-engine/schema";
import type { DraftOf } from "../../draft/types";
import type { ConfigFieldDescriptor } from "../../api/types.js";
import { t } from "../../catalog.js";

type DraftPlugin = DraftOf<Plugin>;

interface Props {
  label: string;
  value: DraftPlugin | undefined;
  onChange: (next: DraftPlugin) => void;
  typePlaceholder?: string;
  /**
   * The registered type names for this position (one slice of GET
   * /registry's three arrays), populating a type picker instead of the
   * free-text input. Omit entirely to keep today's free-text behavior — the
   * custom-field-type position (`FieldCatalogPanel`) has no registry, so it
   * never passes this.
   */
  registryTypes?: string[];
  /** The matching slice of GET /registry's per-type config-schema descriptions, keyed by type. */
  registrySchemas?: Record<string, ConfigFieldDescriptor[]>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateField(descriptor: ConfigFieldDescriptor, value: unknown): string | undefined {
  const isEmpty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  if (descriptor.required && isEmpty) return t("plugin.fieldRequired");
  if (isEmpty) return undefined;
  if (descriptor.kind === "string" && typeof value === "string") {
    if (descriptor.minLength !== undefined && value.length < descriptor.minLength) return `min ${descriptor.minLength} chars`;
    if (descriptor.maxLength !== undefined && value.length > descriptor.maxLength) return `max ${descriptor.maxLength} chars`;
    if (descriptor.format === "email" && !EMAIL_RE.test(value)) return "invalid email";
  }
  if (descriptor.kind === "number" && typeof value === "number") {
    if (descriptor.min !== undefined && value < descriptor.min) return `min ${descriptor.min}`;
    if (descriptor.max !== undefined && value > descriptor.max) return `max ${descriptor.max}`;
  }
  if (descriptor.kind === "string-array" && Array.isArray(value)) {
    if (descriptor.minItems !== undefined && value.length < descriptor.minItems) return `at least ${descriptor.minItems} item(s)`;
    if (descriptor.maxItems !== undefined && value.length > descriptor.maxItems) return `at most ${descriptor.maxItems} item(s)`;
    if (descriptor.format === "email" && value.some((v) => typeof v === "string" && !EMAIL_RE.test(v))) return "invalid email";
  }
  return undefined;
}

function GeneratedField({
  descriptor,
  value,
  onChange,
}: {
  descriptor: ConfigFieldDescriptor;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const error = validateField(descriptor, value);
  return (
    <label className="plugin-field">
      {descriptor.key}
      {descriptor.kind === "string" && (
        <input type="text" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {descriptor.kind === "number" && (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      )}
      {descriptor.kind === "boolean" && <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />}
      {descriptor.kind === "enum" && (
        <select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
          <option value="" />
          {(descriptor.enumValues ?? []).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      )}
      {descriptor.kind === "string-array" && (
        <textarea
          rows={3}
          aria-label={`${descriptor.key} (${t("plugin.arrayHint")})`}
          value={Array.isArray(value) ? value.join("\n") : ""}
          onChange={(e) =>
            onChange(
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            )
          }
        />
      )}
      {error && <span className="error">{error}</span>}
    </label>
  );
}

/**
 * The `{ type, config }` plugin envelope recurs across the contract: actions,
 * data sources, assignment strategies, and a custom field type. One editor
 * for the shape shared by all of them; the core validates only the envelope
 * (each plugin ships its own JSON Schema, checked at publish, not here).
 *
 * When `registryTypes` is supplied, `type` becomes a picker over that list
 * and, for a type `registrySchemas` describes, `config` becomes a generated
 * form instead of raw JSON — an author can still switch back to JSON for
 * that type. A type with no schema description keeps the raw JSON textarea,
 * exactly as before this capability.
 */
export function PluginEnvelopeEditor({ label, value, onChange, typePlaceholder, registryTypes, registrySchemas }: Props) {
  const [configText, setConfigText] = useState(() => JSON.stringify(value?.config ?? {}, null, 2));
  const [configError, setConfigError] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

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

  const currentType = value?.type ?? "";
  // `core.`-prefixed types are internal, dispatched only by subprocess.ts —
  // never a real authoring choice, and a Zod refinement rejects one in an
  // authored body at publish. Registered on the same Registry regardless
  // (registerSubprocessHandlers), so GET /registry still lists them; the
  // picker just declines to offer them.
  const selectableTypes = registryTypes?.filter((rt) => !rt.startsWith("core."));
  const descriptorList = registrySchemas?.[currentType];
  const useGeneratedForm = descriptorList !== undefined && !showRawJson;

  const setConfigField = (key: string, fieldValue: unknown) => {
    const config = { ...((value?.config as Record<string, unknown> | undefined) ?? {}), [key]: fieldValue };
    onChange({ ...value, type: currentType, config });
    setConfigText(JSON.stringify(config, null, 2));
  };

  const switchToJson = () => {
    setConfigText(JSON.stringify(value?.config ?? {}, null, 2));
    setShowRawJson(true);
  };

  return (
    <fieldset className="plugin-envelope">
      <legend>{label}</legend>
      <label>
        type
        {selectableTypes ? (
          <select
            value={currentType}
            onChange={(e) => {
              setShowRawJson(false);
              onChange({ ...value, type: e.target.value, config: value?.config ?? {} });
            }}
          >
            <option value="">{t("plugin.selectType")}</option>
            {currentType && !selectableTypes.includes(currentType) && (
              <option value={currentType}>
                {currentType} {t("plugin.unregisteredType")}
              </option>
            )}
            {selectableTypes.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            placeholder={typePlaceholder ?? t("plugin.typePlaceholder")}
            value={currentType}
            onChange={(e) => onChange({ ...value, type: e.target.value, config: value?.config ?? {} })}
          />
        )}
      </label>

      {useGeneratedForm ? (
        <>
          {descriptorList.map((descriptor) => (
            <GeneratedField
              key={descriptor.key}
              descriptor={descriptor}
              value={(value?.config as Record<string, unknown> | undefined)?.[descriptor.key]}
              onChange={(fieldValue) => setConfigField(descriptor.key, fieldValue)}
            />
          ))}
          <button type="button" className="btn btn-secondary" onClick={switchToJson}>
            {t("plugin.switchToJson")}
          </button>
        </>
      ) : (
        <>
          <label>
            config (JSON)
            <textarea rows={3} value={configText} onChange={(e) => commitConfig(e.target.value)} />
          </label>
          {configError && (
            <p className="error">
              {t("common.configErrorPrefix")} {configError}
            </p>
          )}
          {descriptorList !== undefined && (
            <button type="button" className="btn btn-secondary" onClick={() => setShowRawJson(false)}>
              {t("plugin.switchToForm")}
            </button>
          )}
        </>
      )}

      <label>
        description
        <input
          type="text"
          value={value?.description ?? ""}
          onChange={(e) => onChange({ ...value, type: currentType, config: value?.config ?? {}, description: e.target.value })}
        />
      </label>
    </fieldset>
  );
}
