import { toast } from "sonner";
export class ClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export function notifyError(error: unknown) {
  const message =
    error instanceof ClientError
      ? error.message
      : "We couldn’t complete that action. Please try again.";
  toast.error(message, { id: message, duration: 6500 });
  return message;
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`/api/${path}`, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
      signal: AbortSignal.timeout(25000),
    });
    const payload = await response.json();
    if (!response.ok) {
      if (payload.error?.code === "MFA_REQUIRED" && typeof window !== "undefined")
        window.dispatchEvent(new Event("reliefpoint:mfa-required"));
      if (response.status === 401 && path !== "auth/signin" && typeof window !== "undefined")
        window.dispatchEvent(new Event("reliefpoint:session-expired"));
      throw new ClientError(
        payload.error?.message ?? "We couldn’t complete that action. Please try again.",
        payload.error?.code ?? "REQUEST_FAILED",
        response.status,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof ClientError) throw error;
    throw new ClientError(
      "We couldn’t connect. Check your connection and try again.",
      "CONNECTION_FAILED",
      0,
    );
  }
}
export const send = <T>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
