import { useCallback, useEffect, useState } from "react";
import { stripCompiledContent } from "workflow-engine/schema/strip-compiled";
import { listTemplates, saveTemplate, deleteTemplate, listProcesses, getVersionBody, StudioClientError } from "../api/client.js";
import type { ProcessBody } from "workflow-engine/schema";
import type { TemplateSummary, ProcessSummary } from "../api/types.js";
import { templateDisplayName } from "./processListLogic.js";

interface TemplatesScreenProps {
  token: string;
  locale: string;
  onUnauthorized: () => void;
}

/**
 * What a template is copied from: one published version. A draft is
 * deliberately not a source. `system:templates` cannot read one, and widening
 * that would hand a curator every unfinished body in the installation. A
 * published body is the one every participant already runs, so it is the safe
 * half of the pair to open.
 */
type Source = { processId: string; version: number };

const sourceValue = (s: Source): string => `${s.processId}:${s.version}`;

/**
 * The curator's screen, behind `system:templates`. A template is a reusable
 * authored body a new process seeds from, and nothing more: it is never
 * published, nothing pins it, and editing one changes no process already
 * seeded from it.
 *
 * A template is created from a published version of a process that already
 * exists. There is no body editor here on purpose: the studio already has
 * three editing surfaces, and a fourth over the same JSON would be a second
 * way to author one thing.
 */
export function TemplatesScreen({ token, locale, onUnauthorized }: TemplatesScreenProps) {
  const [items, setItems] = useState<TemplateSummary[]>([]);
  const [sources, setSources] = useState<{ source: Source; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [templateKey, setTemplateKey] = useState("");
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof StudioClientError && err.status === 401) onUnauthorized();
      else setError(err instanceof Error ? err.message : String(err));
    },
    [onUnauthorized],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [templates, processes] = await Promise.all([listTemplates(token), listProcesses(token)]);
      setItems(templates);
      setSources(describeSources(processes, locale));
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [token, locale, fail]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const source = sources.find((s) => sourceValue(s.source) === selected)?.source;
    if (!source) return;
    setCreating(true);
    setError(undefined);
    try {
      const { body, layout } = await readSource(source, token);
      await saveTemplate(templateKey.trim(), body, layout, token);
      setTemplateKey("");
      setSelected("");
      await load();
    } catch (err) {
      fail(err);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (key: string) => {
    if (!confirm(`Delete the template "${key}"? Processes already created from it keep their bodies.`)) return;
    setError(undefined);
    try {
      await deleteTemplate(key, token);
      await load();
    } catch (err) {
      fail(err);
    }
  };

  const canCreate = templateKey.trim() !== "" && selected !== "" && !creating;

  return (
    <main className="studio-screen">
      <h1>Templates</h1>
      <p className="studio-note">
        A starting body for a new process. A template is a snapshot: editing one changes no process already created from it.
      </p>

      <form
        className="studio-controls"
        onSubmit={(e) => {
          e.preventDefault();
          if (canCreate) void create();
        }}
      >
        <input
          value={templateKey}
          onChange={(e) => setTemplateKey(e.target.value)}
          placeholder="approval…"
          aria-label="Template key"
          autoComplete="off"
          spellCheck={false}
        />
        <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Copy from">
          <option value="">Copy from…</option>
          {sources.map(({ source, label }) => (
            <option key={sourceValue(source)} value={sourceValue(source)}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={!canCreate}>
          {creating ? "Creating…" : "Create template"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </form>

      {error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}

      {items.length === 0 && !loading && !error && (
        <p className="studio-empty">No templates yet. Create one from a published version of a process.</p>
      )}

      {items.length > 0 && (
        <table className="studio-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Name</th>
              <th>Last change</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((template) => (
              <tr key={template.templateKey}>
                <td>{template.templateKey}</td>
                <td>{templateDisplayName(template.label, locale, template.templateKey)}</td>
                <td>
                  {new Date(template.updatedAt).toLocaleString()} · {template.createdBy}
                </td>
                <td>
                  <button type="button" className="btn btn-secondary" onClick={() => void remove(template.templateKey)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

/** One entry per process holding a published version: its newest one, named by its label. */
function describeSources(processes: ProcessSummary[], locale: string): { source: Source; label: string }[] {
  return processes.map((process) => ({
    source: { processId: process.processId, version: process.version },
    label: `${templateDisplayName(process.label, locale, process.processId)} — version ${process.version}`,
  }));
}

/**
 * A published body carries the compile pass's cancel-sink injection, so it is
 * stripped here — the same call `seededDraftInput` makes for the same reason.
 * A template holds the authored shape.
 *
 * No layout travels with it. Layout lives on the draft, and a published
 * version carries none, so a process seeded from this template lays itself out
 * on first open.
 */
async function readSource(source: Source, token: string): Promise<{ body: unknown; layout: Record<string, unknown> }> {
  const published = await getVersionBody(source.processId, source.version, token);
  return { body: stripCompiledContent(published as ProcessBody), layout: {} };
}
