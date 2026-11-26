import { prepareNotification } from "./notifications";
import { config } from "./config";
import { checkDb, timedFetch, requireDb, AppError } from "./errors";
import { paystack, reconcile } from "./payments";
import type { Context } from "./session";
export async function runWorker(ctx: Context) {
  const db = ctx.db;
  const deadline = Date.now() + 45000;
  requireDb(await db.rpc("release_expired"));
  const events = requireDb(await db.rpc("claim_work", { p_kind: "webhook" })) as any[];
  for (const event of events) {
    if (Date.now() > deadline) {
      checkDb(
        await db
          .from("webhook_events")
          .update({ status: "pending", locked_at: null, attempts: event.attempts - 1 })
          .eq("id", event.id),
      );
      continue;
    }
    try {
      if (event.payload.event === "charge.success")
        await reconcile(ctx, String(event.payload.data.reference));
      // Refund state is reconciled from the provider below, not trusted from event payload.
      checkDb(
        await db
          .from("webhook_events")
          .update({ status: "done", locked_at: null })
          .eq("id", event.id),
      );
    } catch {
      checkDb(
        await db
          .from("webhook_events")
          .update({
            status: event.attempts >= 8 ? "failed" : "pending",
            locked_at: null,
            next_attempt: new Date(
              Date.now() + Math.min(3600, 2 ** event.attempts * 30) * 1000,
            ).toISOString(),
          })
          .eq("id", event.id),
      );
    }
  }
  const pending = requireDb(
    await db
      .from("payments")
      .select("reference,orders!inner(payment_status,created_at,payment_method)")
      .eq("orders.payment_status", "pending")
      .eq("orders.payment_method", "paystack")
      .lt("orders.created_at", new Date(Date.now() - 60000).toISOString())
      .gt("orders.created_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .lte("next_check_at", new Date().toISOString())
      .order("next_check_at")
      .limit(10),
  );
  for (const order of pending) {
    if (Date.now() > deadline) break;
    try {
      await reconcile(ctx, order.reference);
    } catch {
      /* Retry in the next bounded reconciliation pass. */
    }
  }
  const refunds = requireDb(
    await db
      .from("refunds")
      .select("*")
      .in("status", ["pending", "processing"])
      .order("created_at")
      .limit(10),
  );
  for (const refund of refunds) {
    if (Date.now() > deadline) break;
    try {
      const binding = requireDb(
        await db.from("orders").select("reference,test_mode").eq("id", refund.order_id).single(),
      );
      if (binding.test_mode !== config().PAYSTACK_SECRET_KEY?.startsWith("sk_test_")) continue;
      if (refund.status === "pending") {
        const claimed = checkDb(
          await db
            .from("refunds")
            .update({ status: "processing" })
            .eq("id", refund.id)
            .eq("status", "pending")
            .select("id")
            .maybeSingle(),
        );
        if (!claimed) continue;
        const order = requireDb(
          await db.from("orders").select("reference").eq("id", refund.order_id).single(),
        );
        const result = await paystack("/refund", {
          transaction: order.reference,
          amount: refund.amount,
          merchant_note: `ReliefPoint:${refund.id}`,
        });
        checkDb(
          await db.rpc("apply_refund", {
            p_id: refund.id,
            p_status:
              result.status === "processed"
                ? "processed"
                : result.status === "failed"
                  ? "failed"
                  : "processing",
            p_provider: String(result.id),
          }),
        );
      } else if (refund.provider_id) {
        const result = await paystack(`/refund/${encodeURIComponent(refund.provider_id)}`);
        checkDb(
          await db.rpc("apply_refund", {
            p_id: refund.id,
            p_status:
              result.status === "processed"
                ? "processed"
                : result.status === "failed"
                  ? "failed"
                  : "processing",
            p_provider: String(result.id),
          }),
        );
      } else {
        // Initialization may have succeeded before a network timeout. Never submit a second refund blindly.
        const result = await paystack(
          `/refund?perPage=100&from=${encodeURIComponent(refund.created_at)}`,
        );
        const match = Array.isArray(result)
          ? result.find((r: any) => r.merchant_note === `ReliefPoint:${refund.id}`)
          : null;
        if (match)
          checkDb(
            await db.rpc("apply_refund", {
              p_id: refund.id,
              p_status:
                match.status === "processed"
                  ? "processed"
                  : match.status === "failed"
                    ? "failed"
                    : "processing",
              p_provider: String(match.id),
            }),
          );
      }
    } catch (error) {
      if (
        refund.status === "pending" &&
        error instanceof AppError &&
        error.code === "PAYSTACK_REJECTED"
      )
        checkDb(await db.from("refunds").update({ status: "failed" }).eq("id", refund.id));
      /* Leave uncertain refunds visible for reconciliation, never retry the charge. */
    }
  }
  if (config().BREVO_API_KEY && Date.now() < deadline - 10000) {
    const messages = requireDb(await db.rpc("claim_work", { p_kind: "mail" })) as any[];
    for (const message of messages) {
      if (Date.now() > deadline) {
        checkDb(
          await db
            .from("notification_outbox")
            .update({ status: "pending", locked_at: null, attempts: message.attempts - 1 })
            .eq("id", message.id),
        );
        continue;
      }
      try {
        const mail = await prepareNotification(ctx, message);
        if (Date.now() > deadline - 10000) {
          checkDb(
            await db
              .from("notification_outbox")
              .update({
                status: "pending",
                locked_at: null,
                attempts: message.attempts - 1,
              })
              .eq("id", message.id),
          );
          continue;
        }
        const response = await timedFetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": config().BREVO_API_KEY!, "Content-Type": "application/json" },
          body: JSON.stringify(mail),
        });
        if (!response.ok) throw new Error("Mail unavailable");
        const delivery = (await response.json()) as { messageId?: string };
        checkDb(
          await db
            .from("notification_outbox")
            .update({
              status: "sent",
              locked_at: null,
              provider_message_id: delivery.messageId ?? null,
            })
            .eq("id", message.id),
        );
      } catch {
        checkDb(
          await db
            .from("notification_outbox")
            .update({
              status: message.attempts >= 8 ? "failed" : "pending",
              locked_at: null,
              next_attempt: new Date(
                Date.now() + Math.min(3600, 2 ** message.attempts * 30) * 1000,
              ).toISOString(),
            })
            .eq("id", message.id),
        );
      }
    }
  }
  await db
    .from("rate_limits")
    .delete()
    .lt("window_start", new Date(Date.now() - 86400000).toISOString());
  await db.from("tracking_tokens").delete().lt("expires_at", new Date().toISOString());
  checkDb(await db.from("mfa_browser_grants").delete().lt("expires_at", new Date().toISOString()));
  const oldUploads = requireDb(
    await db
      .from("upload_tickets")
      .select("id,path")
      .lt("created_at", new Date(Date.now() - 3 * 3600000).toISOString())
      .limit(20),
  );
  if (oldUploads.length) {
    checkDb(await db.storage.from("upload-quarantine").remove(oldUploads.map((t) => t.path)));
    checkDb(
      await db
        .from("upload_tickets")
        .delete()
        .in(
          "id",
          oldUploads.map((t) => t.id),
        ),
    );
  }
  const settings = requireDb(
    await db.from("settings").select("prescription_retention_days").eq("id", true).single(),
  );
  if (settings.prescription_retention_days) {
    const files = requireDb(
      await db
        .from("prescriptions")
        .select("id,path,orders!inner(fulfillment_status)")
        .lt(
          "created_at",
          new Date(Date.now() - settings.prescription_retention_days * 86400000).toISOString(),
        )
        .in("orders.fulfillment_status", ["delivered", "cancelled"])
        .limit(20),
    );
    for (const file of files) {
      if (Date.now() > deadline) break;
      checkDb(await db.storage.from("prescriptions").remove([file.path]));
      checkDb(await db.from("prescriptions").delete().eq("id", file.id));
    }
  }
  checkDb(
    await db
      .from("settings")
      .update({ worker_last_success: new Date().toISOString() })
      .eq("id", true),
  );
  return { processed: events.length };
}
