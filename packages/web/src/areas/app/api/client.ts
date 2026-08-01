import type { AttachmentPage, CommentPage, InstanceAttachment, InstanceComment, InstancePage, InstanceView, ProcessSummary } from "./types.js";
import { AppClientError, request } from "../../../api/client.js";

export { AppClientError };

export async function listMyTasks(token: string, opts: { limit?: number; cursor?: string } = {}): Promise<InstancePage> {
  const params = new URLSearchParams({ scope: "mine" });
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) params.set("cursor", opts.cursor);
  const res = await request(`/instances?${params}`, token);
  return (await res.json()) as InstancePage;
}

export async function getInstanceView(instanceId: string, token: string): Promise<InstanceView> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}`, token);
  return (await res.json()) as InstanceView;
}

export async function claim(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/claim`, token, { method: "POST" });
}

export async function release(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/release`, token, { method: "POST" });
}

export async function delegate(instanceId: string, toActorId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/delegate`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ toActorId }),
  });
}

export async function postComment(instanceId: string, text: string, token: string): Promise<InstanceComment> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/comments`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return (await res.json()) as InstanceComment;
}

export async function listComments(instanceId: string, token: string, cursor?: string): Promise<CommentPage> {
  const params = new URLSearchParams();
  if (cursor !== undefined) params.set("cursor", cursor);
  const qs = params.toString();
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/comments${qs ? `?${qs}` : ""}`, token);
  return (await res.json()) as CommentPage;
}

export async function uploadAttachment(instanceId: string, filename: string, contentType: string, dataBase64: string, token: string): Promise<InstanceAttachment> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/attachments`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, contentType, dataBase64 }),
  });
  return (await res.json()) as InstanceAttachment;
}

export async function listAttachments(instanceId: string, token: string, cursor?: string): Promise<AttachmentPage> {
  const params = new URLSearchParams();
  if (cursor !== undefined) params.set("cursor", cursor);
  const qs = params.toString();
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/attachments${qs ? `?${qs}` : ""}`, token);
  return (await res.json()) as AttachmentPage;
}

/** Returns the raw file as a `Blob` — the caller already has `filename` from the listed `InstanceAttachment` to name the saved file with. */
export async function downloadAttachment(instanceId: string, attachmentId: string, token: string): Promise<Blob> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/attachments/${encodeURIComponent(attachmentId)}`, token);
  return res.blob();
}

export async function submitPath(instanceId: string, pathId: string, data: Record<string, unknown>, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/submit`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathId, data }),
  });
}

export async function cancelInstance(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/cancel`, token, { method: "POST" });
}

export async function listProcesses(token: string): Promise<ProcessSummary[]> {
  const res = await request("/processes", token);
  return (await res.json()) as ProcessSummary[];
}

export async function createInstance(processId: string, token: string): Promise<{ instanceId: string }> {
  const res = await request(`/processes/${encodeURIComponent(processId)}/instances`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  return (await res.json()) as { instanceId: string };
}
