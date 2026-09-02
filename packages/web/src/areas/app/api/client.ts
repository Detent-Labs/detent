import type { AttachmentPage, CommentPage, InstanceAttachment, InstanceComment, InstancePage, InstanceView, ProcessSummary } from "./types.js";
import { AppClientError, createInstance, getJson, request, submitPath } from "../../../api/client.js";

export { AppClientError, createInstance, submitPath };

/**
 * `scope=started` derives the starter from the credential, so that case sends
 * no `startedBy` of its own — the route rejects the pair. `scope=visible`
 * resolves the caller's whole principal set from the credential the same way,
 * so it sends no actor id either.
 */
export function listInstances(
  scope: "mine" | "started" | "visible",
  token: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<InstancePage> {
  const params = new URLSearchParams({ scope });
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  if (opts.cursor !== undefined) params.set("cursor", opts.cursor);
  return getJson(`/instances?${params}`, token);
}

export function getInstanceView(instanceId: string, token: string): Promise<InstanceView> {
  return getJson(`/instances/${encodeURIComponent(instanceId)}`, token);
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

export function listComments(instanceId: string, token: string, cursor?: string): Promise<CommentPage> {
  const params = new URLSearchParams();
  if (cursor !== undefined) params.set("cursor", cursor);
  const qs = params.toString();
  return getJson(`/instances/${encodeURIComponent(instanceId)}/comments${qs ? `?${qs}` : ""}`, token);
}

export async function uploadAttachment(instanceId: string, filename: string, contentType: string, dataBase64: string, token: string): Promise<InstanceAttachment> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/attachments`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, contentType, dataBase64 }),
  });
  return (await res.json()) as InstanceAttachment;
}

export function listAttachments(instanceId: string, token: string, cursor?: string): Promise<AttachmentPage> {
  const params = new URLSearchParams();
  if (cursor !== undefined) params.set("cursor", cursor);
  const qs = params.toString();
  return getJson(`/instances/${encodeURIComponent(instanceId)}/attachments${qs ? `?${qs}` : ""}`, token);
}

/** Returns the raw file as a `Blob` — the caller already has `filename` from the listed `InstanceAttachment` to name the saved file with. */
export async function downloadAttachment(instanceId: string, attachmentId: string, token: string): Promise<Blob> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/attachments/${encodeURIComponent(attachmentId)}`, token);
  return res.blob();
}

export async function cancelInstance(instanceId: string, token: string): Promise<void> {
  await request(`/instances/${encodeURIComponent(instanceId)}/cancel`, token, { method: "POST" });
}

export async function saveInstanceDraft(instanceId: string, data: Record<string, unknown>, token: string): Promise<{ updatedBy: string; updatedAt: string }> {
  const res = await request(`/instances/${encodeURIComponent(instanceId)}/draft`, token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data }),
  });
  return (await res.json()) as { updatedBy: string; updatedAt: string };
}

export function listProcesses(token: string): Promise<ProcessSummary[]> {
  return getJson("/processes", token);
}
