import { receiptNumbers } from "@/lib/receipt";
import { readReceipt, receiptPdf } from "./receipts";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { AppError, checkDb, requireDb } from "./errors";
import { config } from "./config";
import { requestContext, rate, requireStaff } from "./session";
import { authAction, authCallback } from "./auth";
import { catalog, publicContent, toProduct, type CatalogRow } from "./content";
import { selectCatalog } from "./catalog-query";
import { readCheckoutReadiness } from "./checkout-readiness";
import {
  beginCheckout,
  initializePayment,
  ownedOrder,
  quoteCheckout,
  reconcile,
  webhook,
} from "./payments";
import { customerAction, customerData, orderDetails } from "./customer";
import {
  adminAction,
  adminList,
  adminWrite,
  adminRecord,
  adminDashboard,
  inviteCustomer,
  addCustomer,
  inviteStaff,
  importProducts,
  createAdminOrder,
  quoteAdminOrder,
  recordManualPayment,
} from "./admin";
import { uploadTicket, finalizeUpload, paymentEvidenceLink } from "./uploads";
import { runWorker } from "./worker";
import { readBody } from "./body";

export async function handleApi(request: Request) {
  const requestId = crypto.randomUUID();
  let responseHeaders = new Headers({ "Cache-Control": "no-store", "X-Request-Id": requestId });
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
    const method = request.method;
    const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
    // Cookie-authenticated endpoints require an exact trusted Origin. Only signed/service endpoints are exempt.
    if (mutating && !["payments/webhook", "internal/worker"].includes(path)) {
      if (request.headers.get("origin") !== config().APP_ORIGIN)
        throw new AppError("REQUEST_REJECTED", "Please refresh the page and try again.", 403);
    }
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 12 * 1024 * 1024)
      throw new AppError(
        "REQUEST_TOO_LARGE",
        "This upload is too large. Please choose a smaller file.",
        413,
      );
    let result: unknown;
    // Public reads do not create cookies and may be cached independently of customer sessions.
    if (method === "GET" && path === "catalog") result = await catalog(url.searchParams);
    else if (method === "GET" && ["posts", "settings", "zones"].includes(path))
      result = await publicContent(
        path,
        path === "posts" ? (url.searchParams.get("page") ?? "0") : undefined,
        path === "posts" ? (url.searchParams.get("category") ?? "") : "",
      );
    else if (method === "GET" && /^(product|post)\//.test(path)) {
      const [kind, ...slug] = path.split("/");
      result = await publicContent(kind!, decodeURIComponent(slug.join("/")));
    } else {
      const ctx = requestContext(request);
      responseHeaders = ctx.headers;
      responseHeaders.set("X-Request-Id", requestId);
      const body = async () => {
        try {
          return JSON.parse(await readBody(request));
        } catch (error) {
          if (error instanceof AppError) throw error;
          throw new AppError("INVALID_INPUT", "Please check the form and try again.");
        }
      };
      if (path === "catalog/resolve" && method === "POST") {
        const input = z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(await body());
        await rate(ctx, "resolve", 30, 60);
        result = {
          products: input.ids.length
            ? (
                await selectCatalog(
                  "id,name,slug,detail,category,price_kobo,regular_price_kobo,image,image_alt,directions,storage,prescription,deal,available",
                  (columns) =>
                    ctx.db
                      .from("catalog")
                      .select(columns)
                      .eq("active", true)
                      .in("id", input.ids)
                      .returns<CatalogRow[]>(),
                )
              ).map(toProduct)
            : [],
        };
      } else if (["auth/callback", "auth/confirm"].includes(path) && method === "GET")
        return await authCallback(ctx);
      else if (
        path.startsWith("auth/") &&
        (method === "POST" || (path === "auth/session" && method === "GET"))
      )
        result = await authAction(ctx, path.slice(5), method === "GET" ? {} : await body());
      else if (path === "checkout/quote" && method === "POST")
        result = await quoteCheckout(ctx, await body());
      else if (path === "checkout/start" && method === "POST")
        result = await beginCheckout(ctx, await body());
      else if (path === "payments/initialize" && method === "POST") {
        const input = z
          .object({ id: z.string().uuid(), channel: z.enum(["card", "bank_transfer", "ussd"]) })
          .parse(await body());
        result = await initializePayment(ctx, input.id, input.channel);
      } else if (path === "payments/webhook" && method === "POST") result = await webhook(ctx);
      else if (path === "payments/callback" && method === "GET") {
        const reference = url.searchParams.get("reference") ?? "";
        const order = requireDb(
          await ctx.db.from("orders").select("id").eq("reference", reference).single(),
        );
        await ownedOrder(ctx, order.id);
        try {
          await reconcile(ctx, reference);
        } catch {
          /* The order page shows a pending state and allows safe reconciliation. */
        }
        ctx.headers.set("Location", `${ctx.origin}/orders/${order.id}`);
        return new Response(null, { status: 303, headers: ctx.headers });
      } else if (path.startsWith("customer/") && method === "POST")
        result = await customerAction(ctx, path.slice(9), await body());
      else if (path.startsWith("customer/") && method === "GET")
        result = await customerData(ctx, path.slice(9), url.searchParams);
      else if (
        (path.startsWith("receipts/") || path.startsWith("admin/receipts/")) &&
        method === "GET"
      ) {
        await rate(ctx, "receipt-read", 15, 60);
        const admin = path.startsWith("admin/");
        const id = z
          .string()
          .uuid()
          .parse(path.slice(admin ? 15 : 9));
        const receipt = await readReceipt(
          ctx,
          id,
          url.searchParams.get("token") ?? undefined,
          admin,
        );
        const bytes = await receiptPdf(receipt);
        ctx.headers.set("X-Robots-Tag", "noindex, nofollow");
        ctx.headers.set("Content-Type", "application/pdf");
        ctx.headers.set(
          "Content-Disposition",
          'attachment; filename="ReliefPoint-' +
            receipt.number.replace(/[^a-zA-Z0-9-]/g, "") +
            '.pdf"',
        );
        ctx.headers.set("Referrer-Policy", "no-referrer");
        return new Response(Buffer.from(bytes), { headers: ctx.headers });
      } else if (path.startsWith("orders/") && method === "GET") {
        await rate(ctx, "order-read", 30, 60);
        result = await orderDetails(ctx, path.slice(7), url.searchParams.get("token") ?? undefined);
      } else if (path === "uploads/ticket" && method === "POST")
        result = await uploadTicket(ctx, await body());
      else if (path === "uploads/finalize" && method === "POST")
        result = await finalizeUpload(ctx, await body());
      else if (path === "admin/post-preview" && method === "GET") {
        await requireStaff(ctx, ["owner", "admin", "editor", "pharmacist"]);
        const id = z.string().uuid().parse(url.searchParams.get("id"));
        result = {
          post: requireDb(await ctx.db.from("blog_posts").select("*").eq("id", id).single()),
        };
      } else if (path === "admin/checkout-readiness" && method === "GET") {
        await requireStaff(ctx, ["owner", "admin"]);
        result = await readCheckoutReadiness(ctx.db);
      } else if (path === "admin/summary" && method === "GET") {
        result = await adminDashboard(ctx, url.searchParams);
      } else if (path === "admin/customer-create" && method === "POST") {
        result = await addCustomer(ctx, await body());
      } else if (path === "admin/customer-invite" && method === "POST") {
        result = await inviteCustomer(ctx, await body());
      } else if (path === "admin/staff-invite" && method === "POST") {
        result = await inviteStaff(ctx, await body());
      } else if (path === "admin/order-create" && method === "POST") {
        result = await createAdminOrder(ctx, await body());
      } else if (path === "admin/order-quote" && method === "POST") {
        result = await quoteAdminOrder(ctx, await body());
      } else if (path === "admin/manual-payment" && method === "POST") {
        result = await recordManualPayment(ctx, await body());
      } else if (path.startsWith("admin/payment-evidence/") && method === "GET") {
        result = await paymentEvidenceLink(ctx, path.slice("admin/payment-evidence/".length));
      } else if (path === "admin/record" && method === "GET") {
        result = await adminRecord(
          ctx,
          url.searchParams.get("resource") ?? "",
          url.searchParams.get("id") ?? "",
        );
      } else if (path === "admin/product-import" && method === "POST") {
        result = await importProducts(ctx, await body());
      } else if (path.startsWith("admin/actions/") && method === "POST")
        result = await adminAction(ctx, path.slice(14), await body());
      else if (path === "admin/order" && method === "GET") {
        const actor = await requireStaff(ctx, [
          "owner",
          "admin",
          "pharmacist",
          "fulfillment",
          "support",
        ]);
        const id = z.string().uuid().parse(url.searchParams.get("id"));
        const order = requireDb(await ctx.db.from("orders").select("*").eq("id", id).single());
        result = {
          order: { ...order, guest_hash: undefined },
          receipt: await (async () => {
            const row = checkDb(
              await ctx.db.from("receipts").select("document").eq("order_id", id).maybeSingle(),
            );
            return row?.document ? receiptNumbers(row.document, order.public_reference) : null;
          })(),
          staff_notes: requireDb(
            await ctx.db
              .from("order_staff_notes")
              .select("id,note,created_at,actor")
              .eq("order_id", id)
              .order("created_at", { ascending: false }),
          ),
          notifications: requireDb(
            await ctx.db
              .from("notification_outbox")
              .select("id,subject,status,attempts,created_at")
              .eq("order_id", id)
              .order("created_at", { ascending: false })
              .limit(30),
          ),
          manual_payment: order.created_by
            ? checkDb(
                await ctx.db
                  .from("manual_payments")
                  .select(
                    "method,amount,reference,note,created_at,actor,parts:manual_payment_parts(method,amount,reference,position,evidence_id)",
                  )
                  .eq("order_id", id)
                  .maybeSingle(),
              )
            : null,
          items: requireDb(await ctx.db.from("order_items").select("*").eq("order_id", id)),
          prescriptions: actor.roles.some((r) => ["owner", "admin", "pharmacist"].includes(r))
            ? requireDb(
                await ctx.db
                  .from("prescriptions")
                  .select("id,created_at,notes,reviewed_at")
                  .eq("order_id", id),
              )
            : [],
          refunds: requireDb(await ctx.db.from("refunds").select("*").eq("order_id", id)),
          events: requireDb(
            await ctx.db.from("delivery_events").select("*").eq("order_id", id).order("created_at"),
          ),
        };
      } else if (path === "admin/reconcile" && method === "POST") {
        await requireStaff(ctx, ["owner", "admin"]);
        const input = z.object({ reference: z.string() }).parse(await body());
        result = await reconcile(ctx, input.reference);
      } else if (path.startsWith("admin/") && method === "GET")
        result = await adminList(ctx, path.slice(6), url.searchParams);
      else if (path.startsWith("admin/") && method === "POST")
        result = await adminWrite(ctx, path.slice(6), await body());
      else if (path === "contact" && method === "POST") {
        const input = z
          .object({
            name: z.string().trim().min(2).max(120),
            email: z.string().email().max(180),
            message: z.string().trim().min(10).max(5000),
          })
          .parse(await body());
        await rate(ctx, "contact", 3, 3600);
        const message = requireDb(
          await ctx.db.from("contact_messages").insert(input).select("id").single(),
        );
        checkDb(
          await ctx.db.from("notification_outbox").insert({
            dedupe: `contact:${message.id}`,
            email: "support@reliefpointpharmacy.com",
            subject: "New website enquiry — ReliefPoint Pharmacy",
            body: "A new customer enquiry is available in your administration inbox.",
          }),
        );
        result = { message: "Your message has been sent. Our team will get back to you." };
      } else if (path === "internal/worker" && method === "POST") {
        const expected = config().WORKER_SECRET;
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
        if (
          !expected ||
          Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
          !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
        )
          throw new AppError("FORBIDDEN", "This request isn’t authorised.", 401);
        result = await runWorker(ctx);
      } else throw new AppError("NOT_FOUND", "This service couldn’t be found.", 404);
    }
    if (method === "GET" && ["catalog", "posts", "settings", "zones"].includes(path))
      responseHeaders.set(
        "Cache-Control",
        path === "zones"
          ? "public, max-age=30, s-maxage=60"
          : "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      );
    return Response.json(result, { headers: responseHeaders });
  } catch (error) {
    const issue =
      error instanceof z.ZodError
        ? new AppError("CHECK_DETAILS", "Please check the form details and try again.")
        : error instanceof AppError
          ? error
          : new AppError(
              "SERVICE_ERROR",
              "We couldn’t complete that action. Please try again shortly.",
              503,
            );
    if (!(error instanceof AppError) && !(error instanceof z.ZodError))
      console.error(
        JSON.stringify({
          requestId,
          event: "api_failure",
          type: error instanceof Error ? error.name : "unknown",
        }),
      );
    responseHeaders.set("Cache-Control", "no-store");
    if (issue.retryAfter) responseHeaders.set("Retry-After", String(issue.retryAfter));
    if (["/api/auth/callback", "/api/auth/confirm"].includes(new URL(request.url).pathname)) {
      responseHeaders.set("Location", "/account?auth_error=link");
      return new Response(null, { status: 303, headers: responseHeaders });
    }
    return Response.json(
      {
        error: {
          code: issue.code,
          message: issue.message,
          requestId,
          ...(error instanceof z.ZodError ? { fields: error.flatten().fieldErrors } : {}),
        },
      },
      { status: issue.status, headers: responseHeaders },
    );
  }
}
