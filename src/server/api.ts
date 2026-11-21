import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { AppError, checkDb, requireDb } from "./errors";
import { config } from "./config";
import { requestContext, rate, requireStaff } from "./session";
import { authAction, authCallback } from "./auth";
import { catalog, publicContent, toProduct } from "./content";
import {
  beginCheckout,
  initializePayment,
  ownedOrder,
  quoteCheckout,
  reconcile,
  webhook,
} from "./payments";
import { customerAction, customerData, orderDetails } from "./customer";
import { adminAction, adminList, adminWrite, adminRecord } from "./admin";
import { uploadTicket, finalizeUpload } from "./uploads";
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
            ? requireDb(
                await ctx.db
                  .from("catalog")
                  .select(
                    "id,name,slug,detail,category,price_kobo,image,image_alt,directions,storage,prescription,deal,available",
                  )
                  .eq("active", true)
                  .in("id", input.ids),
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
      else if (path.startsWith("orders/") && method === "GET") {
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
      } else if (path === "admin/summary" && method === "GET") {
        await requireStaff(ctx, ["owner", "admin"]);
        result = requireDb(await ctx.db.rpc("admin_summary"));
      } else if (path === "admin/record" && method === "GET") {
        result = await adminRecord(
          ctx,
          url.searchParams.get("resource") ?? "",
          url.searchParams.get("id") ?? "",
        );
      } else if (path === "admin/product-import" && method === "POST") {
        await requireStaff(ctx, ["owner", "admin"]);
        await rate(ctx, "import", 2, 600);
        const records = z
          .array(z.unknown())
          .max(100)
          .min(1)
          .parse(await body());
        const outcomes = [];
        for (const [index, record] of records.entries()) {
          try {
            outcomes.push({ row: index + 1, saved: await adminWrite(ctx, "products", record) });
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
        result = { outcomes };
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
          events: requireDb(await ctx.db.from("delivery_events").select("*").eq("order_id", id)),
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
            email: "support@myreliefpoint.com",
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
