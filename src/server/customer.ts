import { z } from "zod";
import { randomBytes } from "node:crypto";
import { AppError, checkDb, requireDb } from "./errors";
import { identity, rate, type Context } from "./session";
import { ownedOrder, reconcile } from "./payments";

export async function orderDetails(ctx: Context, id: string, trackingToken?: string) {
  let order;
  if (trackingToken) {
    const token = checkDb(
      await ctx.db
        .from("tracking_tokens")
        .select("order_id")
        .eq("hash", ctx.hash(trackingToken))
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    );
    if (!token || token.order_id !== id)
      throw new AppError(
        "LINK_EXPIRED",
        "This tracking link has expired. Please request a new one.",
        401,
      );
    order = requireDb(await ctx.db.from("orders").select("*").eq("id", id).single());
  } else order = await ownedOrder(ctx, id);
  const items = requireDb(
    await ctx.db
      .from("order_items")
      .select("id,product_id,name,quantity,price_kobo,prescription,cancelled_quantity")
      .eq("order_id", id),
  );
  const events = requireDb(
    await ctx.db
      .from("delivery_events")
      .select("status,note,courier,tracking_reference,created_at")
      .eq("order_id", id)
      .order("created_at"),
  );
  const prescriptions = requireDb(
    await ctx.db.from("prescriptions").select("id,created_at,notes,reviewed_at").eq("order_id", id),
  );
  const refunds = requireDb(
    await ctx.db.from("refunds").select("id,amount,status,created_at").eq("order_id", id),
  );
  const payment = checkDb(
    await ctx.db
      .from("payments")
      .select("provider_status,verified_at")
      .eq("order_id", id)
      .maybeSingle(),
  );
  const { guest_hash: _g, fee_snapshot: _f, authorization_url: _a, ...safe } = order;
  return {
    order: safe,
    items,
    events,
    prescriptions,
    refunds,
    payment,
    can_resume:
      order.payment_status === "pending" &&
      !order.reservation_released &&
      Date.parse(order.reservation_expires) > Date.now() &&
      order.fulfillment_status !== "cancelled",
  };
}
export async function customerAction(ctx: Context, action: string, body: unknown) {
  const db = ctx.db;
  if (action === "tracking") {
    const input = z
      .object({ email: z.string().email(), reference: z.string().min(4).max(100) })
      .parse(body);
    await rate(ctx, "tracking-ip", 10, 3600);
    await rate(ctx, "tracking", 3, 3600, input.email);
    const order = checkDb(
      await db
        .from("orders")
        .select("id,contact")
        .eq("reference", input.reference)
        .ilike("contact->>email", input.email.replace(/[%_]/g, "\\$&"))
        .maybeSingle(),
    );
    if (order) {
      const token = randomBytes(32).toString("hex");
      checkDb(
        await db.from("tracking_tokens").insert({
          hash: ctx.hash(token),
          order_id: order.id,
          expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
        }),
      );
      checkDb(
        await db.from("notification_outbox").insert({
          dedupe: `tracking:${token}`,
          email: order.contact.email,
          subject: "Your secure order link — ReliefPoint Pharmacy",
          body: `Track your order using this private link, valid for 30 minutes: ${ctx.origin}/orders/${order.id}?token=${token}`,
        }),
      );
    }
    return { message: "If those details match an order, we’ll email you a secure tracking link." };
  }
  if (action === "reconcile") {
    const { id } = z.object({ id: z.string().uuid() }).parse(body);
    await rate(ctx, "reconcile", 5, 60, ctx.guestHash);
    const order = await ownedOrder(ctx, id);
    return reconcile(ctx, order.reference);
  }
  const user = (await identity(ctx))!;
  if (action === "profile") {
    const input = z
      .object({ name: z.string().trim().min(2).max(100), phone: z.string().max(30) })
      .parse(body);
    checkDb(await db.from("profiles").upsert({ id: user.id, ...input }));
    return { message: "Your profile has been updated." };
  }
  if (action === "address") {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(2).max(120),
        phone: z.string().min(10).max(30),
        address: z.string().min(5).max(500),
        state: z.string().min(2).max(80),
        lga: z.string().min(2).max(80),
      })
      .parse(body);
    if (input.id) {
      const existing = checkDb(
        await db.from("addresses").select("user_id").eq("id", input.id).maybeSingle(),
      );
      if (!existing || existing.user_id !== user.id)
        throw new AppError("NOT_FOUND", "This address couldn’t be found.", 404);
    }
    checkDb(await db.from("addresses").upsert({ ...input, user_id: user.id }));
    return { message: "Address saved." };
  }
  if (action === "delete-address") {
    const input = z.object({ id: z.string().uuid() }).parse(body);
    checkDb(await db.from("addresses").delete().eq("id", input.id).eq("user_id", user.id));
    return { message: "Address removed." };
  }
  if (action === "claim-orders") {
    requireDb(await db.rpc("claim_guest_orders", { p_user: user.id, p_email: user.email }));
    return { message: "Your verified guest purchases are now linked to your account." };
  }
  if (action === "shopping") {
    const input = z
      .object({
        cart: z
          .array(z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(99) }))
          .max(100),
        wishlist: z.array(z.string().uuid()).max(200),
      })
      .parse(body);
    checkDb(
      await db
        .from("shopping_lists")
        .upsert({ user_id: user.id, ...input, updated_at: new Date().toISOString() }),
    );
    return { saved: true };
  }
  throw new AppError("NOT_FOUND", "This action isn’t available.", 404);
}
export async function customerData(ctx: Context, kind: string, params: URLSearchParams) {
  const user = (await identity(ctx))!;
  const db = ctx.db;
  if (kind === "orders") {
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(params.get("page") ?? 0);
    const rows = requireDb(
      await db
        .from("orders")
        .select(
          "id,reference,payment_status,fulfillment_status,prescription_status,total,created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(page * 24, page * 24 + 24),
    );
    return { rows: rows.slice(0, 24), more: rows.length > 24 };
  }
  if (kind === "addresses")
    return {
      rows: requireDb(await db.from("addresses").select("*").eq("user_id", user.id).limit(50)),
    };
  if (kind === "shopping")
    return (
      checkDb(
        await db
          .from("shopping_lists")
          .select("cart,wishlist")
          .eq("user_id", user.id)
          .maybeSingle(),
      ) ?? { cart: [], wishlist: [] }
    );
  throw new AppError("NOT_FOUND", "This section couldn’t be found.", 404);
}
