import { z } from "zod";
import { postSchema, productSchema, roles, type StaffRole } from "@/lib/contracts";
import { AppError, checkDb, requireDb } from "./errors";
import { audit, requireStaff, type Context } from "./session";
import { assertMedia } from "./uploads";
import { invalidatePublic } from "./public-cache";
import { verifiedPaymentStatuses, unverifiedPaymentStatuses } from "@/lib/order-groups";

const permissions: Record<string, StaffRole[]> = {
  products: ["owner", "admin", "pharmacist"],
  categories: ["owner", "admin", "pharmacist"],
  inventory_batches: ["owner", "admin", "pharmacist"],
  inventory_movements: ["owner", "admin", "pharmacist"],
  orders: ["owner", "admin", "pharmacist", "fulfillment", "support"],
  prescriptions: ["owner", "admin", "pharmacist"],
  refunds: ["owner", "admin"],
  payments: ["owner", "admin"],
  shipping_zones: ["owner", "admin", "fulfillment"],
  blog_posts: ["owner", "admin", "editor", "pharmacist"],
  contact_messages: ["owner", "admin", "support"],
  profiles: ["owner", "admin", "support"],
  settings: ["owner", "admin"],
  staff_roles: ["owner", "admin"],
  audit_log: ["owner", "admin"],
  notification_outbox: ["owner", "admin"],
  webhook_events: ["owner", "admin"],
};
export async function adminDashboard(ctx: Context) {
  await requireStaff(ctx, ["owner", "admin"]);
  const [base, confirmed, pending] = await Promise.all([
    ctx.db.rpc("admin_summary"),
    ctx.db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("payment_status", verifiedPaymentStatuses),
    ctx.db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("payment_status", unverifiedPaymentStatuses),
  ]);
  const summary = requireDb(base);
  checkDb(confirmed);
  checkDb(pending);
  return {
    paid_kobo: summary.paid_kobo,
    confirmed_orders: confirmed.count ?? 0,
    pending_payments: pending.count ?? 0,
    prescription_queue: summary.prescription_queue,
  };
}
export async function adminList(ctx: Context, resource: string, params: URLSearchParams) {
  if (!permissions[resource])
    throw new AppError("NOT_FOUND", "This section couldn’t be found.", 404);
  await requireStaff(ctx, permissions[resource]);
  const page = z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .parse(params.get("page") ?? 0);
  const projection: string =
    resource === "blog_posts"
      ? "id,title,slug,summary,category,cover,status,author_name,reviewer_id,reviewed_at,published_at,updated_at"
      : resource === "products" && params.get("export") !== "1"
        ? "id,name,slug,category,brand,price_kobo,image,active,prescription,deal,updated_at,available"
        : resource === "notification_outbox"
          ? "id,email,subject,status,attempts,next_attempt,created_at"
          : "*";
  let query = ctx.db
    .from(resource === "products" && params.get("export") !== "1" ? "catalog" : resource)
    .select(projection);
  if (resource === "orders")
    query = query
      .in(
        "payment_status",
        params.get("view") === "pending" ? unverifiedPaymentStatuses : verifiedPaymentStatuses,
      )
      .order("created_at", { ascending: false });
  else if (resource === "blog_posts") query = query.order("updated_at", { ascending: false });
  else if (resource !== "settings" && resource !== "staff_roles") query = query.order("id");
  if (params.get("q")) {
    const term = params
      .get("q")!
      .replace(/[%_,()]/g, "")
      .slice(0, 100);
    if (["products", "profiles", "categories"].includes(resource))
      query = query.ilike("name", `%${term}%`);
    if (resource === "blog_posts") query = query.ilike("title", `%${term}%`);
    if (resource === "orders") query = query.ilike("reference", `%${term}%`);
  }
  const rows = requireDb(
    await query.range(page * 24, page * 24 + 24).returns<Record<string, unknown>[]>(),
  );
  // File paths are accessed only through the audited prescription-view endpoint.
  return {
    rows: rows
      .slice(0, 24)
      .map((row) =>
        resource === "prescriptions"
          ? { ...row, path: undefined }
          : resource === "webhook_events"
            ? { ...row, payload: undefined }
            : row,
      ),
    more: rows.length > 24,
  };
}
export async function adminRecord(ctx: Context, resource: string, id: string) {
  if (!["products", "blog_posts", "categories", "shipping_zones"].includes(resource))
    throw new AppError("NOT_FOUND", "This section couldn’t be found.", 404);
  await requireStaff(ctx, permissions[resource]!);
  z.string().uuid().parse(id);
  return { row: requireDb(await ctx.db.from(resource).select("*").eq("id", id).single()) };
}
export async function adminWrite(ctx: Context, resource: string, body: unknown) {
  const allowed = permissions[resource];
  if (!allowed) throw new AppError("NOT_FOUND", "This action isn’t available.", 404);
  const actor = await requireStaff(
    ctx,
    resource === "blog_posts" ? ["owner", "admin", "editor"] : allowed,
  );
  const db = ctx.db;
  let id: string | undefined;
  if (resource === "products" || resource === "blog_posts") {
    const input = resource === "products" ? productSchema.parse(body) : postSchema.parse(body);
    id = input.id;
    const { id: _id, ...fields } = input;
    const old = id ? requireDb(await db.from(resource).select("*").eq("id", id).single()) : null;
    const reserved = checkDb(
      await db
        .from("slug_redirects")
        .select("target_id")
        .eq("kind", resource === "products" ? "product" : "post")
        .eq("slug", input.slug)
        .maybeSingle(),
    );
    if (reserved && reserved.target_id !== id)
      throw new AppError(
        "NAME_RESERVED",
        "This page name is already in use. Choose another one.",
        409,
      );
    assertMedia(
      resource === "products"
        ? (input as z.infer<typeof productSchema>).image
        : (input as z.infer<typeof postSchema>).cover,
    );
    let values: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() };
    if (resource === "products")
      checkDb(await db.from("categories").upsert({ name: input.category }, { onConflict: "name" }));
    if (resource === "blog_posts") {
      const post = input as z.infer<typeof postSchema>;
      for (const block of post.blocks) if (block.type === "image") assertMedia(block.src);
      let reviewerName: string | null = null;
      if (post.reviewer_id) {
        const reviewer = checkDb(
          await db
            .from("staff_roles")
            .select("user_id")
            .eq("user_id", post.reviewer_id)
            .eq("role", "pharmacist")
            .maybeSingle(),
        );
        if (!reviewer)
          throw new AppError("REVIEWER_INVALID", "Choose a registered pharmacist on your staff.");
        reviewerName = requireDb(
          await db.from("profiles").select("name").eq("id", post.reviewer_id).single(),
        ).name;
      }
      const selfReviewed = post.reviewer_id === actor.id && actor.roles.includes("pharmacist");
      values = {
        ...values,
        author_id: old?.author_id ?? actor.id,
        author_name: old?.author_name ?? (actor.name || "ReliefPoint Pharmacy team"),
        reviewer_name: selfReviewed ? reviewerName : null,
        reviewed_at: selfReviewed ? new Date().toISOString() : null,
        published_at:
          post.status === "published"
            ? (old?.published_at ?? new Date().toISOString())
            : (old?.published_at ?? null),
      };
    }
    const saved = requireDb(
      await (id ? db.from(resource).update(values).eq("id", id) : db.from(resource).insert(values))
        .select("id")
        .single(),
    );
    id = saved.id;
    if (old && old.slug !== input.slug)
      checkDb(
        await db.from("slug_redirects").upsert({
          kind: resource === "products" ? "product" : "post",
          slug: old.slug,
          target_id: id,
        }),
      );
  } else if (resource === "categories") {
    const input = z
      .object({ id: z.string().uuid().optional(), name: z.string().trim().min(2).max(80) })
      .parse(body);
    id = requireDb(
      await db.rpc("save_category", {
        p_id: input.id ?? null,
        p_name: input.name,
        p_actor: actor.id,
      }),
    );
  } else if (resource === "shipping_zones") {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        state: z.string().min(2).max(80),
        lga: z.string().min(2).max(80),
        area: z.string().max(100),
        fee_kobo: z.number().int().min(0).max(10000000),
        free_over_kobo: z.number().int().min(0).nullable(),
        estimate: z.string().min(3).max(200),
        active: z.boolean(),
      })
      .parse(body);
    id = requireDb(await db.from(resource).upsert(input).select("id").single()).id;
  } else if (resource === "inventory_batches") {
    const input = z
      .object({
        product_id: z.string().uuid(),
        lot: z
          .string()
          .min(1)
          .max(80)
          .default(() => `STOCK-${crypto.randomUUID()}`),
        // PostgreSQL infinity means expiry is not tracked, not a fabricated date.
        expires_on: z
          .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("infinity")])
          .default("infinity"),
        quantity: z.number().int().min(0).max(100000),
      })
      .parse(body);
    if (
      input.expires_on !== "infinity" &&
      input.expires_on <= new Date().toISOString().slice(0, 10)
    )
      throw new AppError("EXPIRY_INVALID", "Choose a future expiry date.");
    id = requireDb(await db.from(resource).insert(input).select("id").single()).id;
    checkDb(
      await db.from("inventory_movements").insert({
        batch_id: id,
        quantity: input.quantity,
        reason: "Opening stock",
        actor: actor.id,
      }),
    );
  } else if (resource === "settings") {
    const input = z
      .object({
        public_data: z.object({
          address: z.string().max(500),
          opening_hours: z.string().max(500),
          pcn_logo: z.string().url().or(z.literal("")),
          privacy_text: z.string().max(20000),
          refund_text: z.string().max(20000),
          shipping_text: z.string().max(20000),
        }),
        checkout_enabled: z.boolean(),
        launch_approved: z.boolean(),
        refund_fee_policy: z.enum(["refund", "retain"]).nullable(),
        prescription_retention_days: z.number().int().min(1).max(3650).nullable(),
        fee_rate: z.number().int().min(0).max(9999),
        fee_fixed: z.number().int().min(0).max(10000000),
        fee_threshold: z.number().int().min(0).max(100000000),
        fee_cap: z.number().int().min(0).max(10000000),
      })
      .parse(body);
    if (input.public_data.pcn_logo) assertMedia(input.public_data.pcn_logo);
    if (
      input.launch_approved &&
      (!input.public_data.address ||
        !input.public_data.opening_hours ||
        !input.public_data.pcn_logo ||
        !input.refund_fee_policy ||
        !input.prescription_retention_days ||
        !input.public_data.privacy_text ||
        !input.public_data.shipping_text ||
        !input.public_data.refund_text)
    )
      throw new AppError(
        "LAUNCH_INCOMPLETE",
        "Complete the business information, policies and retention settings before approving launch.",
      );
    checkDb(await db.from(resource).update(input).eq("id", true));
  } else if (resource === "staff_roles") {
    if (!actor.roles.includes("owner"))
      throw new AppError("OWNER_REQUIRED", "Only the owner can change staff access.", 403);
    const input = z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(roles),
        remove: z.boolean().default(false),
      })
      .parse(body);
    if (input.user_id === actor.id && input.role === "owner" && input.remove)
      throw new AppError("OWNER_REQUIRED", "You cannot remove your own owner access.");
    checkDb(
      input.remove
        ? await db.from(resource).delete().eq("user_id", input.user_id).eq("role", input.role)
        : await db.from(resource).upsert({ user_id: input.user_id, role: input.role }),
    );
    id = input.user_id;
  } else if (resource === "contact_messages") {
    const input = z.object({ id: z.string().uuid(), resolved: z.boolean() }).parse(body);
    id = input.id;
    checkDb(await db.from(resource).update({ resolved: input.resolved }).eq("id", id));
  } else
    throw new AppError("ACTION_UNAVAILABLE", "Use the action on the record to make this change.");
  await audit(ctx, actor.id, "save", resource, id);
  invalidatePublic();
  return { id, message: "Changes saved." };
}
export async function adminAction(ctx: Context, action: string, body: unknown) {
  const input = z
    .object({
      id: z.string().uuid(),
      value: z.string().max(1000).optional(),
      note: z.string().max(1000).optional(),
      amount: z.number().int().optional(),
      courier: z.string().max(100).optional(),
      tracking_reference: z.string().max(200).optional(),
      request_id: z.string().uuid().optional(),
    })
    .parse(body);
  const db = ctx.db;
  if (action === "approve-post-review") {
    const actor = await requireStaff(ctx, ["pharmacist"]);
    checkDb(await db.rpc("approve_post_review", { p_post: input.id, p_actor: actor.id }));
    await audit(ctx, actor.id, "approve-review", "blog_post", input.id);
    invalidatePublic();
    return { message: "Pharmacist review recorded." };
  }
  if (action === "prescription-view") {
    const actor = await requireStaff(ctx, ["owner", "admin", "pharmacist"]);
    const file = requireDb(
      await db.from("prescriptions").select("path").eq("id", input.id).single(),
    );
    const signed = requireDb(
      await db.storage.from("prescriptions").createSignedUrl(file.path, 60, { download: true }),
    );
    await audit(ctx, actor.id, "view", "prescription", input.id);
    return { url: signed.signedUrl };
  }
  if (action === "prescription-review") {
    const actor = await requireStaff(ctx, ["owner", "admin", "pharmacist"]);
    const status = z.enum(["approved", "rejected", "clarification"]).parse(input.value);
    checkDb(
      await db.rpc("review_prescription", {
        p_order: input.id,
        p_status: status,
        p_note: input.note ?? "",
        p_actor: actor.id,
      }),
    );
    await audit(ctx, actor.id, status, "prescription", input.id);
  } else if (action === "delivery") {
    const actor = await requireStaff(ctx, ["owner", "admin", "fulfillment"]);
    const status = z.enum(["processing", "dispatched", "delivered"]).parse(input.value);
    checkDb(
      await db.rpc("advance_delivery", {
        p_order: input.id,
        p_status: status,
        p_note: input.note ?? "",
        p_courier: input.courier ?? "",
        p_tracking: input.tracking_reference ?? "",
        p_actor: actor.id,
      }),
    );
    await audit(ctx, actor.id, status, "order", input.id);
  } else if (action === "refund") {
    const actor = await requireStaff(ctx, ["owner", "admin"]);
    requireDb(
      await db.rpc("reserve_refund", {
        p_order: input.id,
        p_amount: z.number().int().positive().parse(input.amount),
        p_reason: input.note ?? "Customer refund",
        p_actor: actor.id,
        p_request: z.string().uuid().parse(input.request_id),
      }),
    );
    await audit(ctx, actor.id, "refund-request", "order", input.id);
  } else if (["cancel-order", "cancel-item", "approve-remaining"].includes(action)) {
    const actor = await requireStaff(ctx, ["owner", "admin"]);
    if (action === "cancel-order")
      checkDb(
        await db.rpc("cancel_order", {
          p_order: input.id,
          p_actor: actor.id,
          p_note: input.note ?? "Cancelled by the pharmacy",
        }),
      );
    if (action === "cancel-item")
      checkDb(
        await db.rpc("cancel_item", {
          p_order: input.id,
          p_item: z.string().uuid().parse(input.value),
          p_quantity: z.number().int().positive().parse(input.amount),
          p_actor: actor.id,
          p_note: input.note ?? "",
        }),
      );
    if (action === "approve-remaining")
      checkDb(await db.rpc("approve_remaining", { p_order: input.id, p_actor: actor.id }));
    await audit(ctx, actor.id, action, "order", input.id);
  } else if (action === "inventory-adjust") {
    const actor = await requireStaff(ctx, ["owner", "admin", "pharmacist"]);
    checkDb(
      await db.rpc("adjust_inventory", {
        p_batch: input.id,
        p_delta: z.number().int().min(-100000).max(100000).parse(input.amount),
        p_actor: actor.id,
        p_reason: input.note ?? "Stock adjustment",
      }),
    );
    await audit(ctx, actor.id, "adjust", "inventory", input.id);
  } else if (action === "delete-draft") {
    const actor = await requireStaff(ctx, ["owner", "admin"]);
    const product = requireDb(
      await db.from("products").select("active").eq("id", input.id).single(),
    );
    if (product.active)
      throw new AppError("ARCHIVE_REQUIRED", "Archive the product before deleting it.");
    const { error } = await db.from("products").delete().eq("id", input.id);
    if (error)
      throw new AppError(
        "PRODUCT_IN_USE",
        "This product has stock or order history. Keep it archived instead.",
      );
    await audit(ctx, actor.id, "delete", "product", input.id);
  } else if (action === "retry-mail" || action === "retry-webhook") {
    const actor = await requireStaff(ctx, ["owner", "admin"]);
    if (action === "retry-webhook")
      throw new AppError("RETRY_RECONCILIATION", "Use payment reconciliation to retry this order.");
    checkDb(
      await db
        .from("notification_outbox")
        .update({
          status: "pending",
          attempts: 0,
          locked_at: null,
          next_attempt: new Date().toISOString(),
        })
        .eq("id", input.id)
        .neq("status", "sent"),
    );
    await audit(ctx, actor.id, "retry", "notification", input.id);
  } else throw new AppError("NOT_FOUND", "This action isn’t available.", 404);
  invalidatePublic();
  return { message: "Changes saved." };
}
