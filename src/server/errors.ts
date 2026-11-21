export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function checkDb<T>(result: { data: T; error: unknown }): T {
  if (result.error) {
    const message =
      typeof result.error === "object" && "message" in result.error
        ? String(result.error.message)
        : "";
    const known: Record<string, string> = {
      STOCK_UNAVAILABLE: "An item no longer has enough stock. Please review your basket.",
      CHECKOUT_UNAVAILABLE:
        "Online checkout isn’t available yet. Please contact our pharmacy team.",
      DELIVERY_UNAVAILABLE:
        "Delivery isn’t available for this area. Please select another area or contact us.",
      ORDER_ON_HOLD: "This order must be paid and approved by the pharmacist before dispatch.",
      DELIVERY_SEQUENCE: "Choose the next delivery stage for this order.",
      REFUND_POLICY_REQUIRED:
        "Approve the processing-fee refund policy in business settings first.",
      REFUND_AMOUNT_INVALID: "This amount exceeds the remaining refundable balance.",
      REFUND_UNAVAILABLE: "This order cannot be refunded yet. Check its payment status.",
      PRESCRIPTION_UNAVAILABLE: "Upload a prescription before reviewing this order.",
      FORBIDDEN: "You don’t have access to this action.",
    };
    if (known[message]) throw new AppError(message, known[message]!);
    if (typeof result.error === "object" && "code" in result.error && result.error.code === "23505")
      throw new AppError(
        "ALREADY_EXISTS",
        "A record with this name or reference already exists. Please use a different one.",
        409,
      );
    throw new AppError(
      "DATA_UNAVAILABLE",
      "We couldn’t save or load this information. Please try again.",
      503,
    );
  }
  return result.data;
}
export function requireDb<T>(result: { data: T; error: unknown }): NonNullable<T> {
  const data = checkDb(result);
  if (data === null || data === undefined)
    throw new AppError(
      "NOT_FOUND",
      "This information couldn’t be found. Please refresh and try again.",
      404,
    );
  return data;
}
export async function timedFetch(url: string, options: RequestInit = {}) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new AppError(
      "CONNECTION_TIMEOUT",
      "The connection took too long. Please try again.",
      504,
    );
  }
}
