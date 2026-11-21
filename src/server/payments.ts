import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { z } from "zod";
import { checkoutSchema } from "@/lib/contracts";
import { config } from "./config";
import { AppError, checkDb, timedFetch, requireDb } from "./errors";
import { identity, rate, type Context } from "./session";
import { readBody } from "./body";

export async function paystack(path: string, body?: unknown) {
  const key = config().PAYSTACK_SECRET_KEY;
  if (!key)
    throw new AppError(
      "PAYMENTS_UNAVAILABLE",
      "Online payment isn’t available yet. Please contact our pharmacy team.",
      503,
    );
  const response = await timedFetch(`https://api.paystack.co${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok || !result.status)
    throw new AppError(
      [400, 404, 422].includes(response.status) ? "PAYSTACK_REJECTED" : "PAYMENT_PENDING",
      "We couldn’t confirm this payment action yet. Please check your order before trying again.",
      [400, 404, 422].includes(response.status) ? response.status : 503,
    );
  return result.data;
}
export function validSignature(raw: string, signature: string | null, key: string) {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", key).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export async function ownedOrder(ctx: Context, id: string) {
  z.string().uuid().parse(id);
  const user = await identity(ctx, true);
  const order = checkDb(await ctx.db.from("orders").select("*").eq("id", id).maybeSingle());
  const emailToken = ctx.request.headers.get("x-order-token");
  if (order && emailToken && /^[a-f0-9]{64}$/.test(emailToken)) {
    const proof = checkDb(
      await ctx.db
        .from("tracking_tokens")
        .select("order_id")
        .eq("hash", ctx.hash(emailToken))
        .eq("order_id", id)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    );
    if (proof) return order;
  }
  if (
    !order ||
    (!(user && order.user_id === user.id) &&
      !(order.user_id === null && order.guest_hash === ctx.guestHash))
  )
    throw new AppError(
      "ORDER_NOT_FOUND",
      "We couldn’t find this order. Sign in or request a tracking link.",
      404,
    );
  return order;
}
export async function quoteCheckout(ctx: Context, input: unknown) {
  const data = checkoutSchema.parse(input);
  await rate(ctx, "quote", 20, 60, ctx.guestHash);
  await rate(ctx, "quote-ip", 60, 60);
  return {
    quote: requireDb(
      await ctx.db.rpc("calculate_quote", { p_items: data.items, p_zone: data.zone_id }),
    ),
  };
}
export async function beginCheckout(ctx: Context, input: unknown) {
  const data = checkoutSchema.parse(input);
  await rate(ctx, "checkout", 5, 60, ctx.guestHash);
  await rate(ctx, "checkout-ip", 20, 60);
  const user = await identity(ctx, true);
  const key = config().PAYSTACK_SECRET_KEY;
  if (
    key?.startsWith("sk_live_") &&
    (!config().BREVO_API_KEY ||
      !config().WORKER_SECRET ||
      !config().APP_ORIGIN.startsWith("https://"))
  )
    throw new AppError(
      "PAYMENTS_UNAVAILABLE",
      "Online checkout is temporarily unavailable. Please contact our pharmacy team.",
      503,
    );
  if (!key)
    throw new AppError(
      "PAYMENTS_UNAVAILABLE",
      "Online payment isn’t available yet. Please contact our pharmacy team.",
      503,
    );
  if (user && data.contact.email.toLowerCase() !== user.email.toLowerCase())
    throw new AppError(
      "EMAIL_MISMATCH",
      "Use your account email for checkout, or sign out to buy as a guest.",
    );
  const order = requireDb(
    await ctx.db.rpc("begin_checkout", {
      p_input: data,
      p_user: user?.id ?? null,
      p_guest: ctx.guestHash,
      p_test: key.startsWith("sk_test_"),
    }),
  );
  return {
    order: {
      id: order.id,
      reference: order.reference,
      needs_prescription: order.needs_prescription,
    },
    quote: {
      subtotal: order.subtotal,
      delivery: order.delivery,
      processing: order.processing,
      total: order.total,
      prescription: order.needs_prescription,
      eta: order.zone_snapshot.estimate,
    },
  };
}
export async function initializePayment(ctx: Context, id: string, channel: string) {
  z.enum(["card", "bank_transfer", "ussd"]).parse(channel);
  await rate(ctx, "payment-init", 5, 60, ctx.guestHash);
  const order = await ownedOrder(ctx, id);
  const settings = requireDb(
    await ctx.db
      .from("settings")
      .select("checkout_enabled,launch_approved,worker_last_success")
      .eq("id", true)
      .single(),
  );
  const key = config().PAYSTACK_SECRET_KEY;
  if (!key || order.test_mode !== key.startsWith("sk_test_"))
    throw new AppError(
      "PAYMENT_ENVIRONMENT",
      "This checkout is no longer available. Please contact our pharmacy team.",
    );
  if (
    !settings.checkout_enabled ||
    (!order.test_mode &&
      (!settings.launch_approved ||
        !settings.worker_last_success ||
        Date.now() - Date.parse(settings.worker_last_success) > 600000 ||
        !config().BREVO_API_KEY ||
        !config().WORKER_SECRET))
  )
    throw new AppError(
      "CHECKOUT_UNAVAILABLE",
      "Online checkout is temporarily unavailable. Please contact our pharmacy team.",
      503,
    );
  if (order.payment_status !== "pending")
    throw new AppError(
      "PAYMENT_ALREADY_RECEIVED",
      "This order already has a payment update. Please view its status.",
    );
  if (order.fulfillment_status === "cancelled")
    throw new AppError("ORDER_CANCELLED", "This order was cancelled. Please start a new checkout.");
  if (order.reservation_released || Date.parse(order.reservation_expires) < Date.now())
    throw new AppError(
      "CHECKOUT_EXPIRED",
      "Your checkout has expired. Please review your basket again.",
    );
  if (order.needs_prescription && order.prescription_status === "awaiting_upload")
    throw new AppError(
      "PRESCRIPTION_REQUIRED",
      "Upload your prescription before continuing to payment.",
    );
  if (order.authorization_url) return { url: order.authorization_url };
  const result = await paystack("/transaction/initialize", {
    email: order.contact.email,
    amount: String(order.total),
    currency: "NGN",
    reference: order.reference,
    channels: [channel],
    callback_url: `${ctx.origin}/api/payments/callback`,
    metadata: { order_id: order.id },
  });
  if (
    typeof result.authorization_url !== "string" ||
    new URL(result.authorization_url).hostname !== "checkout.paystack.com"
  )
    throw new AppError(
      "PAYMENT_UNAVAILABLE",
      "We couldn’t open secure checkout. Please try again.",
      503,
    );
  checkDb(
    await ctx.db
      .from("orders")
      .update({ authorization_url: result.authorization_url })
      .eq("id", id),
  );
  return { url: result.authorization_url };
}
export async function reconcile(ctx: Context, reference: string) {
  if (!/^RP-[a-f0-9]{32}$/.test(reference))
    throw new AppError("REFERENCE_INVALID", "This payment reference isn’t valid.");
  checkDb(
    await ctx.db
      .from("payments")
      .update({ next_check_at: new Date(Date.now() + 60000).toISOString() })
      .eq("reference", reference),
  );
  let transaction;
  try {
    transaction = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return { status: "pending" };
    throw error;
  }
  if (transaction.reference !== reference)
    throw new AppError(
      "PAYMENT_REVIEW",
      "This payment needs a review. Please contact our pharmacy team.",
      409,
    );
  if (transaction.status !== "success") {
    const status = ["failed", "abandoned", "pending", "ongoing", "processing", "reversed"].includes(
      transaction.status,
    )
      ? transaction.status
      : "pending";
    checkDb(
      await ctx.db
        .from("payments")
        .update({ provider_status: status })
        .eq("reference", reference)
        .is("verified_at", null),
    );
    return { status };
  }
  const order = requireDb(
    await ctx.db.from("orders").select("id,test_mode").eq("reference", reference).single(),
  );
  if (
    transaction.metadata?.order_id !== order.id ||
    !Number.isSafeInteger(transaction.amount) ||
    !["test", "live"].includes(transaction.domain)
  )
    throw new AppError(
      "PAYMENT_REVIEW",
      "This payment needs a review. Please contact our pharmacy team.",
      409,
    );
  const settled = requireDb(
    await ctx.db.rpc("settle_payment", {
      p_reference: reference,
      p_amount: transaction.amount,
      p_currency: transaction.currency,
      p_provider: String(transaction.id),
      p_fee: transaction.fees ?? 0,
      p_test: transaction.domain === "test",
    }),
  );
  return { status: settled.payment_status };
}
export async function webhook(ctx: Context) {
  const raw = await readBody(ctx.request);
  const key = config().PAYSTACK_SECRET_KEY;
  if (!key || !validSignature(raw, ctx.request.headers.get("x-paystack-signature"), key))
    throw new AppError("INVALID_SIGNATURE", "This request could not be verified.", 401);
  const event = z.object({ event: z.string(), data: z.record(z.unknown()) }).parse(JSON.parse(raw));
  const eventId = createHash("sha256").update(raw).digest("hex");
  checkDb(
    await ctx.db.from("webhook_events").upsert(
      {
        id: eventId,
        payload: {
          event: event.event,
          data: { reference: event.data["reference"], id: event.data["id"] },
        },
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
  );
  // Durably acknowledge; the authenticated worker verifies provider state before applying value.
  return { received: true };
}
