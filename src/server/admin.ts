import { validSocialUrl } from "@/lib/contact-links";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { checkoutSchema, postSchema, productSchema, roles, type StaffRole } from "@/lib/contracts";
import { AppError, checkDb, requireDb } from "./errors";
import { audit, requireStaff, rate, type Context, type Identity } from "./session";
import { assertMedia } from "./uploads";
import { invalidatePublic } from "./public-cache";
import { verifiedPaymentStatuses, unverifiedPaymentStatuses } from "@/lib/order-groups";
import { salesPeriod } from "@/lib/sales-period";
import { deliveryState } from "@/lib/nigeria";

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
export async function createAdminOrder(ctx: Context, body: unknown) {
  const actor = await requireStaff(ctx, ["owner", "admin"]);
  const input = checkoutSchema.parse(body);
  await rate(ctx, "admin-order", 10, 60, actor.id);
  // Stable on retry, scoped to this staff member, independent of their personal cart.
  const token = ctx.hash(`admin-order-link:${actor.id}:${input.request_id}`);
  const order = requireDb(
    await ctx.db.rpc("create_admin_order", {
      p_actor: actor.id,
      p_input: input,
      p_guest: ctx.hash(`admin-order:${actor.id}:${input.request_id}`),
      p_token_hash: ctx.hash(token),
    }),
  );
  return {
    order: {
      id: order.id,
      reference: order.reference,
      public_reference: order.public_reference,
      payment_status: order.payment_status,
    },
    url: `${ctx.origin}/orders/${order.id}?token=${token}`,
    expires_at: order.link_expires_at,
    total: order.total,
    message: "Saved under Pending payments. Record the payment once received.",
  };
}
export async function quoteAdminOrder(ctx: Context, body: unknown) {
  const actor = await requireStaff(ctx, ["owner", "admin"]);
  const input = checkoutSchema.parse(body);
  await rate(ctx, "admin-order-quote", 30, 60, actor.id);
  const quote = requireDb(
    await ctx.db.rpc("calculate_quote", { p_items: input.items, p_zone: input.zone_id }),
  );
  return {
    quote: { ...quote, processing: 0, total: Number(quote.subtotal) + Number(quote.delivery) },
  };
}
export async function recordManualPayment(ctx: Context, body: unknown) {
  const actor = await requireStaff(ctx, ["owner", "admin"]);
  const input = z
    .object({
      id: z.string().uuid(),
      request_id: z.string().uuid(),
      method: z.enum(["cash", "bank_transfer", "card", "other"]).optional(),
      amount: z.number().int().positive().max(100000000000).optional(),
      reference: z.string().trim().max(120).default(""),
      payments: z
        .array(
          z.object({
            method: z.enum(["cash", "bank_transfer", "card", "other"]),
            amount: z.number().int().positive().max(100000000000),
            reference: z.string().trim().max(120).default(""),
            evidence_id: z.string().uuid().nullable().optional(),
          }),
        )
        .min(1)
        .max(10)
        .optional(),
      note: z.string().trim().max(1000).default(""),
    })
    .parse(body);
  if (!input.payments && (!input.method || !input.amount))
    throw new AppError("MANUAL_PAYMENT_INVALID", "Check the payment methods and amounts.");
  await rate(ctx, "manual-payment", 10, 60, actor.id);
  const order = requireDb(
    await ctx.db.rpc(input.payments ? "record_manual_payment_parts" : "record_manual_payment", {
      p_actor: actor.id,
      p_order: input.id,
      p_request: input.request_id,
      ...(input.payments
        ? {
            p_parts: input.payments.map((part) => ({
              ...part,
              reference: part.method === "cash" ? "" : part.reference,
            })),
          }
        : {
            p_method: input.method,
            p_amount: input.amount,
            p_reference: input.method === "cash" ? "" : input.reference,
          }),
      p_note: input.note,
    }),
  );
  return {
    status: order.payment_status,
    message:
      order.payment_status === "review"
        ? "Payment recorded. Stock needs review before dispatch."
        : "Payment recorded. The order is now confirmed.",
  };
}
function requireAdminData<T>(
  ctx: Context,
  resource: string,
  result: { data: T; error: unknown },
): NonNullable<T> {
  if (result.error) {
    const rawCode =
      typeof result.error === "object" && "code" in result.error
        ? String(result.error.code)
        : "UNKNOWN";
    const code = /^[A-Z0-9]{3,12}$/.test(rawCode) ? rawCode : "UNKNOWN";
    console.error(
      JSON.stringify({
        event: "admin_data_failure",
        requestId: ctx.headers?.get("X-Request-Id") ?? undefined,
        resource,
        code,
      }),
    );
    if (["PGRST202", "42883", "42P01", "42703"].includes(code)) {
      throw new AppError(
        "ADMIN_UPDATE_REQUIRED",
        "This section needs a database update. Please ask the website administrator to finish setup.",
        503,
      );
    }
  }
  return requireDb(result);
}
export async function adminDashboard(ctx: Context, params = new URLSearchParams()) {
  await requireStaff(ctx, ["owner", "admin"]);
  let range;
  try {
    range = salesPeriod(params);
  } catch {
    throw new AppError("INVALID_PERIOD", "Choose a valid sales period and date range.");
  }
  return requireDb(await ctx.db.rpc("admin_sales_summary", { p_from: range.from, p_to: range.to }));
}
export async function adminList(
  ctx: Context,
  resource: string,
  params: URLSearchParams,
): Promise<{ rows: Record<string, unknown>[]; more: boolean }> {
  if (!permissions[resource])
    throw new AppError("NOT_FOUND", "This section couldn’t be found.", 404);
  await requireStaff(ctx, permissions[resource]);
  const page = z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .parse(params.get("page") ?? 0);
  const term = (params.get("q") ?? "")
    .trim()
    .replace(/[%_\\,()]/g, "")
    .slice(0, 100);
  let range = { from: null as string | null, to: null as string | null };
  if (params.has("period")) {
    try {
      range = salesPeriod(params);
    } catch {
      throw new AppError("INVALID_PERIOD", "Choose a valid date range.");
    }
  }
  if (["orders", "prescriptions", "refunds"].includes(resource)) {
    return requireAdminData(
      ctx,
      resource,
      await ctx.db.rpc("admin_order_records", {
        p_resource: resource,
        p_query: term,
        p_statuses:
          resource === "orders"
            ? params.get("view") === "pending"
              ? unverifiedPaymentStatuses
              : verifiedPaymentStatuses
            : null,
        p_from: range.from,
        p_to: range.to,
        p_offset: page * 24,
      }),
    );
  }
  if (resource === "profiles") {
    return requireAdminData(
      ctx,
      resource,
      await ctx.db.rpc("admin_customer_directory", {
        p_query: term,
        p_from: range.from,
        p_to: range.to,
        p_offset: page * 24,
      }),
    );
  }
  const projection: string =
    resource === "blog_posts"
      ? "id,title,slug,summary,category,cover,status,author_name,reviewer_id,reviewed_at,published_at,updated_at"
      : resource === "products"
        ? "id,name,slug,category,brand,price_kobo,image,active,prescription,deal,updated_at,available"
        : resource === "notification_outbox"
          ? "id,email,subject,status,attempts,next_attempt,created_at"
          : "*";
  let query = ctx.db.from(resource === "products" ? "catalog" : resource).select(projection);
  const dateColumn =
    resource === "blog_posts" || resource === "products" ? "updated_at" : "created_at";
  if (
    ![
      "categories",
      "shipping_zones",
      "settings",
      "staff_roles",
      "inventory_batches",
      "payments",
    ].includes(resource)
  ) {
    if (range.from) query = query.gte(dateColumn, range.from);
    if (range.to) query = query.lt(dateColumn, range.to);
  }
  if (resource === "products" && params.get("category"))
    query = query.eq("category", params.get("category")!);
  if (resource === "blog_posts") query = query.order("updated_at", { ascending: false });
  else if (resource === "staff_roles") query = query.order("user_id").order("role");
  else if (resource !== "settings") query = query.order("id");
  if (params.get("q")) {
    if (["products", "profiles", "categories"].includes(resource))
      query = query.ilike("name", `%${term}%`);
    if (resource === "blog_posts") query = query.ilike("title", `%${term}%`);
  }
  const rows = requireAdminData(
    ctx,
    resource,
    await query.range(page * 24, page * 24 + 24).returns<Record<string, unknown>[]>(),
  );
  if (resource === "staff_roles") {
    const visible = rows.slice(0, 24);
    const ids = [...new Set(visible.map((row) => String(row["user_id"])))];
    if (!ids.length) return { rows: [], more: false };
    const [profileResult, users] = await Promise.all([
      ctx.db.from("profiles").select("id,name,phone").in("id", ids),
      Promise.all(
        ids.map(async (id) => {
          const { data, error } = await ctx.db.auth.admin.getUserById(id);
          if (error || !data.user)
            throw new AppError(
              "STAFF_DETAILS_UNAVAILABLE",
              "We couldn’t load staff details. Please try again.",
              503,
            );
          return {
            id,
            email: data.user.email ?? "",
            name: String(data.user.user_metadata["name"] ?? ""),
          };
        }),
      ),
    ]);
    const profiles = new Map(requireDb(profileResult).map((profile) => [profile.id, profile]));
    const accounts = new Map(users.map((user) => [user.id, user]));
    return {
      rows: visible.map((row) => {
        const id = String(row["user_id"]),
          profile = profiles.get(id),
          account = accounts.get(id);
        return {
          ...row,
          name: profile?.name || account?.name || "",
          email: account?.email || "",
          phone: profile?.phone || "",
        };
      }),
      more: rows.length > 24,
    };
  }
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

export async function inviteCustomer(ctx: Context, body: unknown) {
  return saveCustomer(ctx, body, true);
}
export async function addCustomer(ctx: Context, body: unknown) {
  return saveCustomer(ctx, body, false);
}
async function saveCustomer(ctx: Context, body: unknown, invite: boolean) {
  const actor = await requireStaff(ctx, ["owner", "admin", "support"]);
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z
        .string()
        .trim()
        .email()
        .max(180)
        .transform((value) => value.toLowerCase()),
      phone: z
        .string()
        .trim()
        .regex(/^(?:\+234|234|0)[789][01]\d{8}$/, "Enter a valid phone number."),
      address: z.string().trim().max(500).default(""),
      state: z.string().trim().max(80).default(""),
      lga: z.string().trim().max(120).default(""),
    })
    .parse(body);
  await rate(ctx, "customer-create", 30, 3600, actor.id);
  await rate(ctx, "customer-invite-email", 1, 300, input.email);
  const { data, error } = invite
    ? await ctx.db.auth.admin.inviteUserByEmail(input.email, {
        data: { name: input.name, phone: input.phone },
        redirectTo: `${ctx.origin}/api/auth/callback`,
      })
    : await ctx.db.auth.admin.createUser({
        email: input.email,
        password: randomBytes(48).toString("base64url"),
        email_confirm: false,
        user_metadata: { name: input.name, phone: input.phone },
      });
  if (error || !data.user)
    throw new AppError(
      invite ? "INVITE_FAILED" : "CUSTOMER_CREATE_FAILED",
      invite
        ? "We couldn’t send the invitation. Check whether this email already has an account, or try again later."
        : "We couldn’t add this customer. Check whether the email already has an account.",
      503,
    );
  const saved = await ctx.db
    .from("profiles")
    .upsert({ id: data.user.id, name: input.name, phone: input.phone });
  if (saved.error)
    throw new AppError(
      "INVITE_DETAILS_FAILED",
      "Customer details couldn’t be saved. Refresh the customer list before trying again.",
      503,
    );
  if (input.address) {
    const address = await ctx.db.from("addresses").insert({
      user_id: data.user.id,
      name: input.name,
      phone: input.phone,
      address: input.address,
      state: deliveryState(input.state),
      lga: input.lga,
    });
    if (address.error)
      throw new AppError(
        "INVITE_ADDRESS_FAILED",
        "The customer was added, but the address couldn’t be saved. Refresh the customer list before trying again.",
        503,
      );
  }
  await audit(
    ctx,
    actor.id,
    invite ? "customer_invited" : "customer_created",
    "profiles",
    data.user.id,
  );
  return {
    message: invite ? "Invitation sent." : "Customer added.",
    customer: {
      id: data.user.id,
      name: input.name,
      email: input.email,
      phone: input.phone,
      addresses: input.address
        ? [{ address: input.address, state: input.state, lga: input.lga }]
        : [],
    },
  };
}

export async function inviteStaff(ctx: Context, body: unknown) {
  const actor = await requireStaff(ctx, ["owner", "admin"]);
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z
        .string()
        .trim()
        .email()
        .max(180)
        .transform((value) => value.toLowerCase()),
      role: z.enum(roles),
    })
    .parse(body);
  if (input.role === "owner" && !actor.roles.includes("owner"))
    throw new AppError("OWNER_REQUIRED", "Only the owner can grant owner access.", 403);
  await rate(ctx, "staff-invite", 10, 3600, actor.id);
  await rate(ctx, "staff-invite-email", 1, 300, input.email);
  const existing = checkDb(
    await ctx.db.rpc("staff_account_by_email", { p_email: input.email }),
  ) as { id: string; verified: boolean } | null;
  if (existing && !existing.verified)
    throw new AppError(
      "EMAIL_NOT_VERIFIED",
      "This account must verify its email before staff access can be added.",
    );
  let id = existing?.id;
  if (!id) {
    const { data, error } = await ctx.db.auth.admin.inviteUserByEmail(input.email, {
      data: { name: input.name },
      redirectTo: `${ctx.origin}/api/auth/callback`,
    });
    if (error || !data.user)
      throw new AppError(
        "INVITE_FAILED",
        "We couldn’t send the staff invitation. Check the email address or try again later.",
        503,
      );
    id = data.user.id;
  }
  const granted = await ctx.db.rpc("manage_staff_role", {
    p_actor: actor.id,
    p_user: id,
    p_role: input.role,
    p_remove: false,
  });
  if (granted.error && !existing)
    throw new AppError(
      "STAFF_ACCESS_PENDING",
      "The invitation was sent, but staff access couldn’t be added. After email verification, add this person again using the same email.",
      503,
    );
  checkDb(granted);
  return {
    message: existing
      ? "Staff access added. They must verify their authenticator to use administration."
      : "Staff invitation sent. They must verify their email, set a password and set up an authenticator.",
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
  return writeAdminRecord(ctx, resource, body, actor);
}

export async function importProducts(ctx: Context, body: unknown) {
  const actor = await requireStaff(ctx, ["owner", "admin"]);
  await rate(ctx, "import", 120, 600, actor.id);
  const records = z.array(z.unknown()).min(1).max(20).parse(body);
  const outcomes = [];
  for (const [index, record] of records.entries()) {
    try {
      outcomes.push({
        row: index + 1,
        saved: await writeAdminRecord(ctx, "products", record, actor),
      });
    } catch (error) {
      outcomes.push({
        row: index + 1,
        error:
          error instanceof AppError
            ? error.message
            : "Check this product’s fields and uploaded photo.",
      });
    }
  }
  return { outcomes };
}

async function writeAdminRecord(ctx: Context, resource: string, body: unknown, actor: Identity) {
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
    await rate(ctx, "category-write", 30, 60, actor.id);
    const input = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(80),
        product_ids: z.array(z.string().uuid()).max(500).default([]),
      })
      .parse(body);
    id = requireDb(
      await db.rpc("save_category_products", {
        p_id: input.id ?? null,
        p_name: input.name,
        p_products: input.product_ids,
        p_actor: actor.id,
      }),
    );
  } else if (resource === "shipping_zones") {
    const input = z
      .object({
        id: z.string().uuid().optional(),
        fulfillment_method: z.enum(["delivery", "pickup"]).default("delivery"),
        state: z.string().trim().min(2).max(80).transform(deliveryState),
        lga: z.string().trim().min(2).max(80),
        area: z.string().trim().max(100),
        fee_kobo: z.number().int().min(0).max(10000000),
        free_over_kobo: z.number().int().min(0).nullable(),
        estimate: z.string().min(3).max(200),
        active: z.boolean(),
      })
      .parse(body);
    if (
      input.fulfillment_method === "pickup" &&
      (input.fee_kobo !== 0 || input.free_over_kobo !== null || input.area.length < 3)
    )
      throw new AppError("PICKUP_SETTINGS", "Add a pickup location and use a zero pickup fee.");
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
          instagram_url: z
            .string()
            .refine(
              (v) => !v || validSocialUrl(v, "instagram.com"),
              "Enter an Instagram HTTPS link.",
            )
            .optional(),
          facebook_url: z
            .string()
            .refine((v) => !v || validSocialUrl(v, "facebook.com"), "Enter a Facebook HTTPS link.")
            .optional(),
          tiktok_url: z
            .string()
            .refine((v) => !v || validSocialUrl(v, "tiktok.com"), "Enter a TikTok HTTPS link.")
            .optional(),
          address: z.string().max(500),
          opening_hours: z.string().max(500),
          pcn_logo: z.string().url().or(z.literal("")),
          privacy_text: z.string().max(20000),
          refund_text: z.string().max(20000),
          shipping_text: z.string().max(20000),
          terms_text: z.string().max(20000).default(""),
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
    const input = z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(roles),
        remove: z.boolean().default(false),
      })
      .parse(body);
    checkDb(
      await db.rpc("manage_staff_role", {
        p_actor: actor.id,
        p_user: input.user_id,
        p_role: input.role,
        p_remove: input.remove,
      }),
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
      estimated_delivery: z.string().trim().max(200).optional(),
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
    await rate(ctx, "staff-tracking", 20, 60, actor.id);
    const status = z.enum(["processing", "dispatched", "delivered"]).parse(input.value);
    checkDb(
      await db.rpc("update_order_tracking", {
        p_order: input.id,
        p_status: status,
        p_note: input.note ?? "",
        p_courier: input.courier ?? "",
        p_tracking: input.tracking_reference ?? "",
        p_estimate: input.estimated_delivery ?? "",
        p_request: z.string().uuid().parse(input.request_id),
        p_actor: actor.id,
      }),
    );
    return { message: "Tracking updated. Customer email queued." };
  } else if (action === "internal-note") {
    const actor = await requireStaff(ctx, [
      "owner",
      "admin",
      "pharmacist",
      "fulfillment",
      "support",
    ]);
    await rate(ctx, "staff-order-note", 20, 60, actor.id);
    checkDb(
      await db.rpc("add_order_staff_note", {
        p_order: input.id,
        p_actor: actor.id,
        p_request: z.string().uuid().parse(input.request_id),
        p_note: z.string().trim().min(1).max(1000).parse(input.note),
      }),
    );
    return { message: "Internal note saved." };
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
    requireDb(
      await db
        .from("notification_outbox")
        .update({
          status: "pending",
          attempts: 0,
          locked_at: null,
          next_attempt: new Date().toISOString(),
        })
        .eq("id", input.id)
        .eq("status", "failed")
        .select("id")
        .maybeSingle(),
    );
    await audit(ctx, actor.id, "retry", "notification", input.id);
  } else throw new AppError("NOT_FOUND", "This action isn’t available.", 404);
  invalidatePublic();
  return { message: "Changes saved." };
}
