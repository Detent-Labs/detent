import { useEffect, useState } from "react";
import { usePlayer } from "./store";
import { FieldForm } from "./FieldInput";
import type { ClientError, SubmissionIssue } from "./types";

function firstText(value: Record<string, string> | undefined): string {
  if (!value) return "";
  return Object.values(value)[0] ?? "";
}

function GenericError({ error, unmatchedIssues }: { error: ClientError; unmatchedIssues: SubmissionIssue[] }) {
  if (error.type === "validation") {
    if (unmatchedIssues.length === 0) return null;
    return (
      <ul className="player-error player-error-validation">
        {unmatchedIssues.map((issue, i) => (
          <li key={i}>
            {issue.fieldId}: {issue.kind}
          </li>
        ))}
      </ul>
    );
  }
  if (error.type === "guard-refused") {
    return <p className="player-error">{error.message} — the selected path is no longer available. Try Refresh.</p>;
  }
  if (error.type === "concurrency-conflict") {
    return <p className="player-error">The instance changed concurrently. Refresh and try again.</p>;
  }
  return <p className="player-error">{error.message}</p>;
}

export function PlayerView() {
  const player = usePlayer();
  const { view, instanceId, loading, error } = player;

  const [processId, setProcessId] = useState("");
  const [versionInput, setVersionInput] = useState("");
  const [seedDataJson, setSeedDataJson] = useState("");
  const [openInstanceIdInput, setOpenInstanceIdInput] = useState("");
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  // Reset the form's local edits whenever a different instance/step is
  // displayed, seeded from the server's current values.
  useEffect(() => {
    if (!view) {
      setFormValues({});
      return;
    }
    const seeded: Record<string, unknown> = {};
    for (const f of view.fields) seeded[f.field.id] = f.value;
    setFormValues(seeded);
  }, [view?.instanceId, view?.step.id]);

  const fieldIds = new Set(view?.fields.map((f) => f.field.id) ?? []);
  const validationIssues = error?.type === "validation" ? error.issues : [];
  const issuesByField = new Map<string, SubmissionIssue[]>();
  const unmatchedIssues: SubmissionIssue[] = [];
  for (const issue of validationIssues) {
    if (fieldIds.has(issue.fieldId)) {
      const arr = issuesByField.get(issue.fieldId) ?? [];
      arr.push(issue);
      issuesByField.set(issue.fieldId, arr);
    } else {
      unmatchedIssues.push(issue);
    }
  }

  return (
    <main className="player-view">
      <h1>Player</h1>

      <fieldset className="player-connection">
        <legend>Connection</legend>
        <label>
          Server URL
          <input type="text" value={player.serverUrl} onChange={(e) => player.setServerUrl(e.target.value)} />
        </label>
        <label>
          Actor id
          <input type="text" value={player.actorId} onChange={(e) => player.setActor(e.target.value, player.actorRoles)} />
        </label>
        <label>
          Actor roles (comma-separated)
          <input type="text" value={player.actorRoles} onChange={(e) => player.setActor(player.actorId, e.target.value)} />
        </label>
      </fieldset>

      <fieldset className="player-instance-access">
        <legend>Instance access</legend>
        <div className="player-create">
          <h4>Create new</h4>
          <label>
            Process id
            <input type="text" value={processId} onChange={(e) => setProcessId(e.target.value)} />
          </label>
          <label>
            Version (optional)
            <input type="number" value={versionInput} onChange={(e) => setVersionInput(e.target.value)} />
          </label>
          <label>
            Seed data (raw JSON, optional)
            <textarea value={seedDataJson} onChange={(e) => setSeedDataJson(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={loading || !processId}
            onClick={() => void player.createInstance(processId, versionInput ? Number(versionInput) : undefined, seedDataJson)}
          >
            Create
          </button>
        </div>
        <div className="player-open">
          <h4>Open existing</h4>
          <label>
            Instance id
            <input type="text" value={openInstanceIdInput} onChange={(e) => setOpenInstanceIdInput(e.target.value)} />
          </label>
          <button type="button" disabled={loading || !openInstanceIdInput} onClick={() => void player.openInstance(openInstanceIdInput)}>
            Open
          </button>
        </div>
      </fieldset>

      {error && <GenericError error={error} unmatchedIssues={unmatchedIssues} />}

      {view && (
        <section className="player-instance">
          <h2>
            {view.step.key} — {firstText(view.step.label) || view.step.key}
          </h2>
          <p className="player-instance-meta">
            instance {instanceId} · status {view.status}
          </p>

          <FieldForm fields={view.fields} values={formValues} onChange={(fieldId, value) => setFormValues((v) => ({ ...v, [fieldId]: value }))} issuesByField={issuesByField} />

          <div className="player-paths">
            {view.availablePaths.map((path) => (
              <button key={path.id} type="button" disabled={loading} onClick={() => void player.submit(path.id, formValues)}>
                {path.label ?? path.key}
              </button>
            ))}
          </div>

          <button type="button" disabled={loading} onClick={() => void player.refresh()}>
            Refresh
          </button>
        </section>
      )}
    </main>
  );
}
