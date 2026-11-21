import { api, send, ClientError } from "./api";
export async function uploadFile<T>(
  kind: "media" | "prescription",
  file: File,
  orderId?: string,
  trackingToken?: string,
): Promise<T> {
  const limit = (kind === "media" ? 10 : 5) * 1024 * 1024;
  if (!file.size || file.size > limit)
    throw new ClientError(`Choose a file up to ${kind === "media" ? 10 : 5} MB.`, "FILE_SIZE", 400);
  if (
    !["image/jpeg", "image/png", ...(kind === "prescription" ? ["application/pdf"] : [])].includes(
      file.type,
    )
  )
    throw new ClientError(
      kind === "media" ? "Choose a JPEG or PNG photo." : "Choose a PDF, JPEG or PNG prescription.",
      "FILE_TYPE",
      400,
    );
  const ticket = await api<{ id: string; url: string }>("uploads/ticket", {
    method: "POST",
    headers: trackingToken ? { "X-Order-Token": trackingToken } : {},
    body: JSON.stringify({
      kind,
      size: file.size,
      mime: file.type,
      ...(orderId ? { order_id: orderId } : {}),
    }),
  });
  let response: Response;
  try {
    response = await fetch(ticket.url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type, "x-upsert": "false" },
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new ClientError(
      "Your upload was interrupted. Check your connection and select the file again.",
      "UPLOAD_INTERRUPTED",
      0,
    );
  }
  if (!response.ok)
    throw new ClientError(
      "We couldn’t upload this file. Please select it again.",
      "UPLOAD_FAILED",
      400,
    );
  return api<T>("uploads/finalize", {
    method: "POST",
    headers: trackingToken ? { "X-Order-Token": trackingToken } : {},
    body: JSON.stringify({ id: ticket.id }),
  });
}
